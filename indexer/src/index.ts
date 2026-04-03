import "dotenv/config";
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { AdrenPoller } from "./poller";
import { aggregateSquads, recomputeWalletRas } from "./squad_aggregator";
import {
  resolveExpiredMatches,
  snapshotRasIntoBracket,
} from "./bracket_engine";
import idl from "../../target/idl/arena.json";

const RPC_URL   = process.env.RPC_URL   ?? "https://api.devnet.solana.com";
const WS_URL    = process.env.WS_URL    ?? "wss://api.devnet.solana.com";
const ADRENA_ID = process.env.ADRENA_PROGRAM_ID ?? "";

const RAS_INTERVAL_MS     =  5 * 60 * 1000;  // 5 minutes
const BRACKET_INTERVAL_MS = 60 * 60 * 1000;  // 1 hour

function loadKeypair(envVar: string): Keypair {
  const val = process.env[envVar];
  if (!val) throw new Error(`Missing env var: ${envVar}`);
  try {
    return Keypair.fromSecretKey(Buffer.from(JSON.parse(val)));
  } catch {
    const bs58 = require("bs58");
    return Keypair.fromSecretKey(bs58.decode(val));
  }
}

async function main() {
  console.log("[Arena Indexer] Starting…");

  const indexerKeypair = loadKeypair("INDEXER_KEYPAIR");

  // Load the active competition from DB
  const competition = await db.query.competitions.findFirst({
    where: eq(schema.competitions.status, "active"),
  });

  if (!competition) {
    console.error("[Arena Indexer] No active competition found in DB. Seed one first.");
    process.exit(1);
  }

  console.log(
    `[Arena Indexer] Watching competition ${competition.id} | ${new Date(competition.periodStart * 1000).toISOString()} → ${new Date(competition.periodEnd * 1000).toISOString()}`
  );

  // Build Anchor program client
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet     = new Wallet(indexerKeypair);
  const provider   = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new Program(idl as never, provider);

  // Fetch all registered wallets
  const memberships = await db.query.memberships.findMany({
    with: { squad: true } as Record<string, unknown>,
  });
  const uniqueWallets = [
    ...new Set(memberships.map((m) => m.wallet)),
  ];

  // Backfill historical positions
  const poller = new AdrenPoller(
    RPC_URL,
    ADRENA_ID,
    competition.id,
    competition.periodStart
  );
  await poller.backfill(uniqueWallets);

  // Real-time subscription
  poller.startSubscription();

  // RAS recompute loop (every 5 min)
  const rasLoop = setInterval(async () => {
    try {
      console.log("[RAS] Computing scores for all wallets…");
      for (const wallet of uniqueWallets) {
        await recomputeWalletRas(
          wallet,
          competition.id,
          competition.periodStart,
          competition.periodEnd
        );
      }
      await snapshotRasIntoBracket(competition.id);
      await aggregateSquads(competition.id, program, indexerKeypair);
    } catch (err) {
      console.error("[RAS] Loop error:", err);
    }
  }, RAS_INTERVAL_MS);

  // Bracket resolution loop (every hour)
  const bracketLoop = setInterval(async () => {
    try {
      console.log("[Bracket] Resolving expired matches…");
      await resolveExpiredMatches(competition.id, program, indexerKeypair);
    } catch (err) {
      console.error("[Bracket] Loop error:", err);
    }
  }, BRACKET_INTERVAL_MS);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Arena Indexer] Shutting down…");
    clearInterval(rasLoop);
    clearInterval(bracketLoop);
    process.exit(0);
  });

  console.log("[Arena Indexer] Running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[Arena Indexer] Fatal error:", err);
  process.exit(1);
});
