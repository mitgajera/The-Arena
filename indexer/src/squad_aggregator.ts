import { eq } from "drizzle-orm";
import BN from "bn.js";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { db, schema } from "./db";
import { computeRAS, computeStreak, TradeRecord } from "./ras";

const TIER_THRESHOLDS = {
  diamond: 25_000,
  gold:     5_000,
  silver:     500,
};

function assignTier(avgCollateral: number): "bronze" | "silver" | "gold" | "diamond" {
  if (avgCollateral > TIER_THRESHOLDS.diamond) return "diamond";
  if (avgCollateral > TIER_THRESHOLDS.gold)    return "gold";
  if (avgCollateral > TIER_THRESHOLDS.silver)  return "silver";
  return "bronze";
}

async function getLatestRas(
  wallet: string,
  competitionId: number
): Promise<{ ras: number; avgCollateral: number }> {
  const score = await db.query.rasScores.findFirst({
    where: (t, { and }) =>
      and(eq(t.wallet, wallet), eq(t.competitionId, competitionId)),
  });

  const events = await db.query.positionEvents.findMany({
    where: (t, { and }) =>
      and(eq(t.wallet, wallet), eq(t.competitionId, competitionId)),
  });

  const avgCollateral =
    events.length > 0
      ? events.reduce((a, e) => a + e.collateralUsd, 0) / events.length
      : 0;

  return { ras: score?.ras ?? 0, avgCollateral };
}

/**
 * Updates the streak cache for a wallet based on whether they traded today.
 * Called each time a new position event is stored for that wallet.
 */
export async function updateStreak(wallet: string): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const cached = await db.query.streakCache.findFirst({
    where: eq(schema.streakCache.wallet, wallet),
  });

  const newStreak = computeStreak(
    cached?.streakDays ?? 0,
    cached?.lastActiveDay ?? null,
    today
  );

  await db
    .insert(schema.streakCache)
    .values({ wallet, streakDays: newStreak, lastActiveDay: today })
    .onConflictDoUpdate({
      target: [schema.streakCache.wallet],
      set: { streakDays: newStreak, lastActiveDay: today, updatedAt: new Date() },
    });
}

/**
 * Fetches all trades for a wallet in the competition period, runs RAS, and upserts.
 */
export async function recomputeWalletRas(
  wallet: string,
  competitionId: number,
  periodStart: number,
  periodEnd: number
): Promise<void> {
  const events = await db.query.positionEvents.findMany({
    where: (t, { and }) =>
      and(eq(t.wallet, wallet), eq(t.competitionId, competitionId)),
  });

  const trades: TradeRecord[] = events.map((e) => ({
    wallet: e.wallet,
    openTime: e.openTime,
    closeTime: e.closeTime,
    collateralUsd: e.collateralUsd,
    realizedPnlUsd: e.realizedPnlUsd,
    side: e.side as "long" | "short",
    notionalUsd: e.notionalUsd,
  }));

  // Refresh streak before scoring
  await updateStreak(wallet);

  const streak = await db.query.streakCache.findFirst({
    where: eq(schema.streakCache.wallet, wallet),
  });

  const result = computeRAS(trades, periodStart, periodEnd, streak?.streakDays ?? 0);

  await db
    .insert(schema.rasScores)
    .values({
      competitionId,
      wallet,
      ras: result.ras,
      pnlPct: result.pnlPct,
      tradeCount: result.tradeCount,
      streakDays: result.streakDays,
      maxDrawdownPct: result.maxDrawdownPct,
      eligible: result.eligible,
      ineligibilityReason: result.ineligibilityReason ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.rasScores.competitionId, schema.rasScores.wallet],
      set: {
        ras: result.ras,
        pnlPct: result.pnlPct,
        tradeCount: result.tradeCount,
        streakDays: result.streakDays,
        maxDrawdownPct: result.maxDrawdownPct,
        eligible: result.eligible,
        ineligibilityReason: result.ineligibilityReason ?? null,
        computedAt: new Date(),
      },
    });
}

/**
 * Main aggregation loop — runs every 5 minutes.
 * For each squad: sum member RAS, assign tier, write to DB, push on-chain.
 */
export async function aggregateSquads(
  competitionId: number,
  program: Program,
  indexerKeypair: Keypair
): Promise<void> {
  const squads = await db.query.squads.findMany({
    where: eq(schema.squads.competitionId, competitionId),
    with: { memberships: true } as Record<string, unknown>,
  });

  for (const squad of squads) {
    const memberWallets: string[] = (
      squad as unknown as { memberships: Array<{ wallet: string }> }
    ).memberships.map((m) => m.wallet);

    const memberData = await Promise.all(
      memberWallets.map((w) => getLatestRas(w, competitionId))
    );

    const squadRas = memberData.reduce((a, d) => a + d.ras, 0);
    const avgCollateral =
      memberData.length > 0
        ? memberData.reduce((a, d) => a + d.avgCollateral, 0) / memberData.length
        : 0;
    const tier = assignTier(avgCollateral);

    await db
      .update(schema.squads)
      .set({ rasScore: squadRas, tier, updatedAt: new Date() })
      .where(eq(schema.squads.id, squad.id));

    try {
      const tierEnum =
        tier === "diamond" ? { diamond: {} }
        : tier === "gold"   ? { gold: {} }
        : tier === "silver" ? { silver: {} }
        : { bronze: {} };

      await program.methods
        .updateSquadRas(new BN(Math.round(squadRas * 1000)), tierEnum)
        .accounts({ squad: squad.onchainPubkey, indexerSigner: indexerKeypair.publicKey })
        .signers([indexerKeypair])
        .rpc();

      console.log(`[Aggregator] ${squad.name} RAS=${squadRas.toFixed(2)} tier=${tier}`);
    } catch (err) {
      console.error(`[Aggregator] On-chain update failed for ${squad.name}:`, err);
    }
  }
}
