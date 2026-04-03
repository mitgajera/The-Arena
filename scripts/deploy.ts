/**
 * deploy.ts
 *
 * Post-deploy setup script:
 *   1. Reads the deployed program ID from Anchor.toml or env
 *   2. Generates indexer + admin keypairs if missing
 *   3. Runs DB migrations
 *   4. Creates the first competition on-chain + inserts into DB
 *
 * Run AFTER: anchor build && anchor deploy --provider.cluster devnet
 *
 * Usage:
 *   ts-node scripts/deploy.ts [--cluster devnet|mainnet]
 */

import "dotenv/config";
import { execSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { db, schema } from "../indexer/src/db";
import idl from "../target/idl/arena.json";

const cluster = process.argv.includes("--cluster")
  ? process.argv[process.argv.indexOf("--cluster") + 1]
  : "devnet";

const RPC_URL =
  cluster === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";

function ensureKeypair(path: string, label: string): Keypair {
  if (!existsSync(path)) {
    const kp = Keypair.generate();
    writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`[Deploy] Generated new ${label} keypair: ${kp.publicKey.toBase58()}`);
    console.log(`[Deploy] IMPORTANT: Back up ${path} securely.`);
    return kp;
  }
  const raw = JSON.parse(require("fs").readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  console.log(`[Deploy] Deploying to ${cluster}…`);

  // 1. Ensure keypairs exist
  const adminKp   = ensureKeypair("./keys/admin.json",   "admin");
  const indexerKp = ensureKeypair("./keys/indexer.json", "indexer");

  console.log(`[Deploy] Admin:   ${adminKp.publicKey.toBase58()}`);
  console.log(`[Deploy] Indexer: ${indexerKp.publicKey.toBase58()}`);
  console.log(`\n[Deploy] ACTION REQUIRED: Update INDEXER_PUBKEY and ADMIN_PUBKEY in programs/arena/src/lib.rs with the above values, then rebuild.`);

  // 2. Run DB migrations
  console.log("\n[Deploy] Pushing DB schema…");
  try {
    execSync("cd indexer && npx drizzle-kit push", { stdio: "inherit" });
  } catch {
    console.warn("[Deploy] DB push failed — ensure Postgres is running and DATABASE_URL is set.");
  }

  // 3. Fund admin on devnet
  const connection = new Connection(RPC_URL, "confirmed");

  if (cluster === "devnet") {
    const balance = await connection.getBalance(adminKp.publicKey);
    if (balance < 2 * LAMPORTS_PER_SOL) {
      console.log("[Deploy] Airdropping SOL to admin on devnet…");
      await connection.confirmTransaction(
        await connection.requestAirdrop(adminKp.publicKey, 5 * LAMPORTS_PER_SOL)
      );
    }
  }

  // 4. Create first competition
  const wallet   = new Wallet(adminKp);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program  = new Program(idl as never, provider);

  const competitionId = new BN(0);
  const now = Math.floor(Date.now() / 1000);
  const periodStart = now;
  const periodEnd   = now + 7 * 86_400;

  const [competitionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("competition"), competitionId.toBuffer("le", 8)],
    program.programId
  );
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("competition_counter")],
    program.programId
  );

  console.log(`\n[Deploy] Creating Competition #0 on-chain…`);
  try {
    await program.methods
      .createCompetition(
        competitionId,
        new BN(periodStart),
        new BN(periodEnd),
        64,
        new BN(10_000_000),  // 10 ADX entry stake
        new BN(1_000_000)    // 1 ADX squad creation fee
      )
      .accounts({
        competition: competitionPda,
        counter: counterPda,
        admin: adminKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKp])
      .rpc();

    console.log(`[Deploy] Competition PDA: ${competitionPda.toBase58()}`);
  } catch (e) {
    console.warn("[Deploy] Competition creation failed (may already exist):", (e as Error).message);
  }

  // 5. Upsert into DB
  await db.insert(schema.competitions).values({
    onchainPubkey: competitionPda.toBase58(),
    periodStart,
    periodEnd,
    bracketSize: 64,
    entryStakeAdx: 10_000_000,
    status: "active",
  }).onConflictDoNothing();

  console.log("\n[Deploy] === Deployment complete ===");
  console.log("Next steps:");
  console.log("  1. Update .env with ARENA_PROGRAM_ID, INDEXER_KEYPAIR, ADMIN_KEYPAIR");
  console.log("  2. Start the indexer:   cd indexer && npm start");
  console.log("  3. Start the API:       cd api && npm start");
  console.log("  4. Start the frontend:  cd frontend && npm run dev");
}

main().catch((e) => {
  console.error("[Deploy] Fatal:", e);
  process.exit(1);
});
