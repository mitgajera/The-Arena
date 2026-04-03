import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
  Logs,
} from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { updateStreak } from "./squad_aggregator";

export interface ClosedPosition {
  wallet: string;
  openedAt: number;
  closedAt: number;
  collateralUsd: number;
  realizedPnlUsd: number;
  side: "long" | "short";
  notionalUsd: number;
  txSignature: string;
}

interface AdrenaClosedPositionApiRow {
  opened_at?: number;
  closed_at?: number;
  collateral_usd?: number;
  realized_pnl_usd?: number;
  side?: "long" | "short";
  notional_usd?: number;
  tx_signature?: string;
  openedAt?: number;
  closedAt?: number;
  collateralUsd?: number;
  realizedPnlUsd?: number;
  notionalUsd?: number;
  txSignature?: string;
}

function normalizeRestBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function mapApiRowToClosedPosition(
  wallet: string,
  row: AdrenaClosedPositionApiRow
): ClosedPosition | null {
  const openedAt = row.opened_at ?? row.openedAt;
  const closedAt = row.closed_at ?? row.closedAt;
  const collateralUsd = row.collateral_usd ?? row.collateralUsd;
  const realizedPnlUsd = row.realized_pnl_usd ?? row.realizedPnlUsd;
  const notionalUsd = row.notional_usd ?? row.notionalUsd;
  const txSignature = row.tx_signature ?? row.txSignature;
  const side = row.side;

  if (
    typeof openedAt !== "number" ||
    typeof closedAt !== "number" ||
    typeof collateralUsd !== "number" ||
    typeof realizedPnlUsd !== "number" ||
    typeof notionalUsd !== "number" ||
    typeof txSignature !== "string" ||
    (side !== "long" && side !== "short")
  ) {
    return null;
  }

  return {
    wallet,
    openedAt,
    closedAt,
    collateralUsd,
    realizedPnlUsd,
    side,
    notionalUsd,
    txSignature,
  };
}

export class AdrenaPoller {
  private connection: Connection;
  private adrenaProgram: PublicKey | null;
  private competitionId: number;
  private periodStart: number;

  // Set by the caller once Adrena provides their REST endpoint.
  // When set, backfill uses the API instead of raw RPC log parsing.
  private adrenaRestUrl: string | null;

  constructor(
    rpcUrl: string,
    adrenaProgram: string | null,
    competitionId: number,
    periodStart: number,
    adrenaRestUrl?: string
  ) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.adrenaProgram = adrenaProgram ? new PublicKey(adrenaProgram) : null;
    this.competitionId = competitionId;
    this.periodStart = periodStart;
    this.adrenaRestUrl = adrenaRestUrl ? normalizeRestBaseUrl(adrenaRestUrl) : null;
  }

  /**
   * On startup: backfill all position closes since competition start.
   * Uses the Adrena REST API when available, falls back to RPC log parsing.
   */
  async backfill(wallets: string[]): Promise<void> {
    console.log(
      `[Poller] Backfilling ${wallets.length} wallets from ${new Date(this.periodStart * 1000).toISOString()}`
    );

    if (this.adrenaRestUrl) {
      console.log("[Poller] Using Adrena REST API for backfill");
      for (const wallet of wallets) {
        await this.fetchViaRestApi(wallet);
      }
    } else {
      console.log("[Poller] No REST URL — using RPC signature backfill (stub parser)");
      for (const wallet of wallets) {
        await this.fetchHistoricalPositions(wallet);
      }
    }
  }

  /**
   * Fetches closed positions from the Adrena REST API.
   * Replace the response mapping once the real field names are confirmed.
   */
  private async fetchViaRestApi(wallet: string): Promise<void> {
    if (!this.adrenaRestUrl) return;

    const url = `${this.adrenaRestUrl}/positions/closed?wallet=${wallet}&from=${this.periodStart}&to=${Math.floor(Date.now() / 1000)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Poller] REST API ${res.status} for wallet ${wallet.slice(0, 8)}...`);
        return;
      }

      const data = (await res.json()) as AdrenaClosedPositionApiRow[];

      for (const row of data) {
        const pos = mapApiRowToClosedPosition(wallet, row);
        if (!pos) continue;

        await this.storePosition(pos);
      }
    } catch (err) {
      console.error(`[Poller] REST fetch failed for ${wallet.slice(0, 8)}…:`, err);
    }
  }

  /**
   * Subscribe to real-time position close events via Solana log subscription.
   */
  startSubscription(): void {
    if (!this.adrenaProgram) {
      console.warn("[Poller] ADRENA_PROGRAM_ID missing; realtime subscription disabled");
      return;
    }

    console.log("[Poller] Starting log subscription for Adrena program");

    this.connection.onLogs(
      this.adrenaProgram,
      async (logs: Logs) => {
        if (logs.err) return;

        const isClose = logs.logs.some(
          (l) =>
            l.includes("ClosePosition") ||
            l.includes("close_position") ||
            l.includes("PositionClosed")
        );
        if (!isClose) return;

        console.log(`[Poller] Position close in tx ${logs.signature}`);

        if (this.adrenaRestUrl) {
          // Re-fetch that specific tx from the REST API
          const tx = await this.connection.getParsedTransaction(logs.signature, {
            maxSupportedTransactionVersion: 0,
          });
          const walletPubkey = tx?.transaction.message.accountKeys[0]?.pubkey.toBase58();
          if (walletPubkey) await this.fetchViaRestApi(walletPubkey);
        } else {
          const tx = await this.connection.getParsedTransaction(logs.signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (!tx) return;
          const walletPubkey = tx.transaction.message.accountKeys[0]?.pubkey.toBase58();
          if (!walletPubkey) return;
          await this.processSignature(logs.signature, walletPubkey);
        }
      },
      "confirmed"
    );
  }

  // ── RPC fallback (used when REST API is not yet available) ──────────────

  private async fetchHistoricalPositions(wallet: string): Promise<void> {
    let before: string | undefined;
    const pubkey = new PublicKey(wallet);

    while (true) {
      const sigs: ConfirmedSignatureInfo[] =
        await this.connection.getSignaturesForAddress(pubkey, { limit: 100, before });

      if (!sigs.length) break;

      const filtered = sigs.filter(
        (s) => s.blockTime && s.blockTime >= this.periodStart
      );

      for (const sig of filtered) {
        await this.processSignature(sig.signature, wallet);
      }

      const oldest = sigs[sigs.length - 1];
      if (oldest.blockTime && oldest.blockTime < this.periodStart) break;
      before = oldest.signature;
    }
  }

  private async processSignature(signature: string, wallet: string): Promise<void> {
    const existing = await db.query.positionEvents.findFirst({
      where: eq(schema.positionEvents.txSignature, signature),
    });
    if (existing) return;

    const tx: ParsedTransactionWithMeta | null =
      await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

    if (!tx || !tx.blockTime) return;

    const position = this.parsePositionFromTx(tx, wallet, signature);
    if (!position) return;

    await this.storePosition(position);
  }

  /**
   * Parses a position close from a raw Adrena transaction.
   *
   * STUB — replace the field offsets once the Adrena IDL is received.
   * The actual event layout will be in tx.meta.innerInstructions or
   * as a structured Anchor event in the transaction logs.
   */
  private parsePositionFromTx(
    tx: ParsedTransactionWithMeta,
    wallet: string,
    signature: string
  ): ClosedPosition | null {
    try {
      const innerInstructions = tx.meta?.innerInstructions ?? [];

      for (const inner of innerInstructions) {
        for (const ix of inner.instructions) {
          if (!("data" in ix)) continue;

          const raw = Buffer.from(ix.data as string, "base64");
          // Minimum size check — actual Adrena event is larger
          if (raw.length < 40) continue;

          // TODO: replace these offsets with real values from Adrena IDL
          // return {
          //   wallet,
          //   openedAt:       Number(raw.readBigInt64LE(8)),
          //   closedAt:       tx.blockTime!,
          //   collateralUsd:  raw.readFloatLE(16),
          //   realizedPnlUsd: raw.readFloatLE(20),
          //   side:           raw[24] === 0 ? "long" : "short",
          //   notionalUsd:    raw.readFloatLE(28),
          //   txSignature:    signature,
          // };
          console.warn(
            `[Poller] parsePositionFromTx stub hit for tx ${signature.slice(0, 8)}… — awaiting Adrena IDL`
          );
          return null;
        }
      }

      return null;
    } catch (err) {
      console.error(`[Poller] Failed to parse tx ${signature}:`, err);
      return null;
    }
  }

  private async storePosition(pos: ClosedPosition): Promise<void> {
    const isWash = pos.closedAt - pos.openedAt < 60 || pos.notionalUsd < 50;

    await db.insert(schema.positionEvents).values({
      competitionId: this.competitionId,
      wallet: pos.wallet,
      openTime: pos.openedAt,
      closeTime: pos.closedAt,
      collateralUsd: pos.collateralUsd,
      realizedPnlUsd: pos.realizedPnlUsd,
      side: pos.side,
      notionalUsd: pos.notionalUsd,
      txSignature: pos.txSignature,
      washFlagged: isWash,
    });

    // Update streak immediately on each new position
    await updateStreak(pos.wallet, this.competitionId);

    console.log(
      `[Poller] Stored ${pos.side} ${pos.notionalUsd.toFixed(0)} USD for ${pos.wallet.slice(0, 8)}…`
    );
  }
}
