import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
  Logs,
} from "@solana/web3.js";
import { db, schema } from "./db";
import { eq } from "drizzle-orm";

export interface ClosedPosition {
  wallet: string;
  openedAt: number;       // unix seconds
  closedAt: number;
  collateralUsd: number;
  realizedPnlUsd: number;
  side: "long" | "short";
  notionalUsd: number;
  txSignature: string;
}

/**
 * Adrena position account discriminators and field offsets.
 * These must be confirmed with the Adrena team before mainnet use.
 * Layout is a placeholder — adjust offsets once the IDL is obtained.
 */
const POSITION_DISCRIMINATOR = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]); // placeholder

export class AdrenPoller {
  private connection: Connection;
  private adrenaProgram: PublicKey;
  private competitionId: number;
  private periodStart: number;

  constructor(
    rpcUrl: string,
    adrenaProgram: string,
    competitionId: number,
    periodStart: number
  ) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.adrenaProgram = new PublicKey(adrenaProgram);
    this.competitionId = competitionId;
    this.periodStart = periodStart;
  }

  /**
   * On startup: backfill all position closes since competition start.
   */
  async backfill(wallets: string[]): Promise<void> {
    console.log(`[Poller] Backfilling ${wallets.length} wallets from ${new Date(this.periodStart * 1000).toISOString()}`);

    for (const wallet of wallets) {
      await this.fetchHistoricalPositions(wallet);
    }
  }

  private async fetchHistoricalPositions(wallet: string): Promise<void> {
    let before: string | undefined;
    const pubkey = new PublicKey(wallet);

    while (true) {
      const sigs: ConfirmedSignatureInfo[] =
        await this.connection.getSignaturesForAddress(pubkey, {
          limit: 100,
          before,
        });

      if (!sigs.length) break;

      const filtered = sigs.filter(
        (s) => s.blockTime && s.blockTime >= this.periodStart
      );

      for (const sig of filtered) {
        await this.processSignature(sig.signature, wallet);
      }

      // If the oldest sig is before period start, stop paginating
      const oldest = sigs[sigs.length - 1];
      if (oldest.blockTime && oldest.blockTime < this.periodStart) break;

      before = oldest.signature;
    }
  }

  /**
   * Subscribe to real-time position close events.
   */
  startSubscription(): void {
    console.log("[Poller] Starting log subscription for Adrena program");

    this.connection.onLogs(
      this.adrenaProgram,
      async (logs: Logs) => {
        if (logs.err) return;

        // Detect position close events from program logs
        const isClose = logs.logs.some(
          (l) =>
            l.includes("ClosePosition") ||
            l.includes("close_position") ||
            l.includes("PositionClosed")
        );

        if (!isClose) return;

        console.log(`[Poller] Position close detected in tx ${logs.signature}`);
        // The wallet must be inferred from the transaction — fetch full tx
        const tx = await this.connection.getParsedTransaction(logs.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx) return;

        const walletPubkey =
          tx.transaction.message.accountKeys[0]?.pubkey.toBase58();
        if (!walletPubkey) return;

        await this.processSignature(logs.signature, walletPubkey);
      },
      "confirmed"
    );
  }

  private async processSignature(
    signature: string,
    wallet: string
  ): Promise<void> {
    // Skip if already stored
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
   * Parses a position close event from a parsed Adrena transaction.
   *
   * NOTE: The actual field offsets depend on Adrena's IDL.
   * This is a structural skeleton — fill in real log parsing once the IDL
   * is obtained from the Adrena team.
   */
  private parsePositionFromTx(
    tx: ParsedTransactionWithMeta,
    wallet: string,
    signature: string
  ): ClosedPosition | null {
    try {
      // Extract close event data from inner instructions or log messages.
      // Adrena emits structured events; parse the base64 data field.
      const innerInstructions = tx.meta?.innerInstructions ?? [];

      for (const inner of innerInstructions) {
        for (const ix of inner.instructions) {
          if ("data" in ix) {
            // Attempt to decode — replace with actual Adrena event schema
            const raw = Buffer.from(ix.data as string, "base64");
            if (raw.length < 40) continue;

            // Placeholder field extraction — MUST be updated with real offsets
            return {
              wallet,
              openedAt: tx.blockTime! - 3600, // placeholder
              closedAt: tx.blockTime!,
              collateralUsd: 0,
              realizedPnlUsd: 0,
              side: "long",
              notionalUsd: 0,
              txSignature: signature,
            };
          }
        }
      }

      return null;
    } catch (err) {
      console.error(`[Poller] Failed to parse tx ${signature}:`, err);
      return null;
    }
  }

  private async storePosition(pos: ClosedPosition): Promise<void> {
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
      washFlagged:
        pos.closedAt - pos.openedAt < 60 || pos.notionalUsd < 50,
    });

    console.log(
      `[Poller] Stored position close for ${pos.wallet.slice(0, 8)}… tx=${pos.txSignature.slice(0, 8)}…`
    );
  }
}
