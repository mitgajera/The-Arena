import { createHash } from "crypto";
import { eq, and } from "drizzle-orm";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { db, schema } from "./db";

export interface BracketMatch {
  round: number;
  slotIndex: number;
  p1Wallet: string | null;
  p2Wallet: string | null;
  p1Ras: number;
  p2Ras: number;
  winner: string | null;
  matchStart: number;
  matchEnd: number;
  status: "pending" | "live" | "complete" | "eliminated";
}

/**
 * Seeds the bracket by shuffling registrants using a VRF seed (drand or on-chain).
 * Each round-1 match lasts `matchDurationSeconds` (default: 24h).
 */
export async function seedBracket(
  competitionId: number,
  registrants: string[],
  bracketSize: 32 | 64 | 128,
  vrfSeed: Buffer,
  matchDurationSeconds: number = 86_400,
  tournamentStart: number = Math.floor(Date.now() / 1000)
): Promise<void> {
  // Shuffle deterministically from VRF seed
  const shuffled = deterministicShuffle(registrants, vrfSeed).slice(
    0,
    bracketSize
  );

  // Pad with byes if fewer registrants than bracket size
  while (shuffled.length < bracketSize) shuffled.push("BYE");

  const matchCount = bracketSize / 2;
  const rows = [];

  for (let i = 0; i < matchCount; i++) {
    const p1 = shuffled[i * 2];
    const p2 = shuffled[i * 2 + 1];
    const matchStart = tournamentStart;
    const matchEnd   = tournamentStart + matchDurationSeconds;

    // p1 slot
    rows.push({
      competitionId,
      round: 0,
      slotIndex: i * 2,
      wallet: p1 === "BYE" ? null : p1,
      matchStart,
      matchEnd,
      status: "live",
    });
    // p2 slot
    rows.push({
      competitionId,
      round: 0,
      slotIndex: i * 2 + 1,
      wallet: p2 === "BYE" ? null : p2,
      matchStart,
      matchEnd,
      status: "live",
    });
  }

  await db.insert(schema.bracketSlots).values(rows);
  console.log(
    `[Bracket] Seeded ${bracketSize}-player bracket for competition ${competitionId}`
  );
}

/** Fisher-Yates shuffle seeded deterministically from a Buffer. */
function deterministicShuffle<T>(arr: T[], seed: Buffer): T[] {
  const copy = [...arr];
  const seedNum = seed.readUInt32BE(0);

  let rng = seedNum;
  function next(): number {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0x100000000;
  }

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Checks all live matches and resolves any that have passed their matchEnd time.
 * Called by a cron every hour.
 */
export async function resolveExpiredMatches(
  competitionId: number,
  program: Program,
  indexerKeypair: Keypair
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Fetch all "live" slots where matchEnd has passed
  const liveSlots = await db.query.bracketSlots.findMany({
    where: (t, { and, eq, lte }) =>
      and(
        eq(t.competitionId, competitionId),
        eq(t.status, "live"),
        lte(t.matchEnd!, now)
      ),
  });

  // Group into pairs (even/odd slot index = match pair)
  const pairs = new Map<number, typeof liveSlots>();
  for (const slot of liveSlots) {
    const matchKey = Math.floor(slot.slotIndex / 2);
    if (!pairs.has(matchKey)) pairs.set(matchKey, []);
    pairs.get(matchKey)!.push(slot);
  }

  for (const [, pair] of pairs) {
    if (pair.length !== 2) continue;

    const [s1, s2] = pair.sort((a, b) => a.slotIndex - b.slotIndex);

    const p1Ras = s1.rasAtClose ?? 0;
    const p2Ras = s2.rasAtClose ?? 0;

    const winnerSlot  = p1Ras >= p2Ras ? s1 : s2;
    const loserSlot   = p1Ras >= p2Ras ? s2 : s1;
    const winnerWallet = winnerSlot.wallet;

    // Mark slots in DB
    await db
      .update(schema.bracketSlots)
      .set({ status: "complete" })
      .where(eq(schema.bracketSlots.id, winnerSlot.id));

    await db
      .update(schema.bracketSlots)
      .set({ status: "eliminated" })
      .where(eq(schema.bracketSlots.id, loserSlot.id));

    // Seed next-round slot
    const nextRound = s1.round + 1;
    const nextSlotIndex = Math.floor(s1.slotIndex / 2);
    const nextMatchDuration = 86_400; // 24h per round

    await db
      .insert(schema.bracketSlots)
      .values({
        competitionId,
        round: nextRound,
        slotIndex: nextSlotIndex,
        wallet: winnerWallet,
        matchStart: s1.matchEnd!,
        matchEnd: s1.matchEnd! + nextMatchDuration,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [
          schema.bracketSlots.competitionId,
          schema.bracketSlots.round,
          schema.bracketSlots.slotIndex,
        ],
        set: { wallet: winnerWallet, status: "pending" },
      });

    // Push on-chain
    try {
      await program.methods
        .advanceBracket(new BN(Math.round(p1Ras * 1000)), new BN(Math.round(p2Ras * 1000)))
        .accounts({
          p1Slot: deriveBracketSlotPDA(competitionId, s1.round, s1.slotIndex, program.programId),
          p2Slot: deriveBracketSlotPDA(competitionId, s2.round, s2.slotIndex, program.programId),
          winnerSlot: deriveBracketSlotPDA(competitionId, nextRound, nextSlotIndex, program.programId),
          indexerSigner: indexerKeypair.publicKey,
        })
        .signers([indexerKeypair])
        .rpc();

      console.log(
        `[Bracket] Resolved R${s1.round} match: winner=${winnerWallet?.slice(0, 8)}… p1RAS=${p1Ras.toFixed(2)} p2RAS=${p2Ras.toFixed(2)}`
      );
    } catch (err) {
      console.error("[Bracket] On-chain advance failed:", err);
    }
  }
}

function deriveBracketSlotPDA(
  competitionId: number,
  round: number,
  slotIndex: number,
  programId: PublicKey
): PublicKey {
  const compIdBuf = Buffer.alloc(8);
  compIdBuf.writeBigUInt64LE(BigInt(competitionId));
  const roundBuf = Buffer.alloc(1);
  roundBuf.writeUInt8(round);
  const slotBuf = Buffer.alloc(2);
  slotBuf.writeUInt16LE(slotIndex);

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bracket_slot"), compIdBuf, roundBuf, slotBuf],
    programId
  );
  return pda;
}

/** Snapshot current RAS into bracket slots for all live matches. */
export async function snapshotRasIntoBracket(competitionId: number): Promise<void> {
  const liveSlots = await db.query.bracketSlots.findMany({
    where: (t, { and, eq }) =>
      and(eq(t.competitionId, competitionId), eq(t.status, "live")),
  });

  for (const slot of liveSlots) {
    if (!slot.wallet) continue;

    const score = await db.query.rasScores.findFirst({
      where: (t, { and, eq }) =>
        and(
          eq(t.wallet, slot.wallet!),
          eq(t.competitionId, competitionId)
        ),
    });

    if (score) {
      await db
        .update(schema.bracketSlots)
        .set({ rasAtClose: score.ras })
        .where(eq(schema.bracketSlots.id, slot.id));
    }
  }
}
