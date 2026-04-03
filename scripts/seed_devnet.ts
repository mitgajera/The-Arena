/**
 * seed_devnet.ts
 * Creates a test competition on devnet, seeds squads, and writes TradeProof PDAs.
 *
 * Usage:
 *   cd scripts && ts-node seed_devnet.ts
 */

import "dotenv/config";
import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { readFileSync } from "fs";
import { db, schema } from "../indexer/src/db";
import idl from "../target/idl/arena.json";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR ?? "./keys/admin.json";
const INDEXER_KEYPAIR_PATH = process.env.INDEXER_KEYPAIR ?? "./keys/indexer.json";

function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

const NOW = Math.floor(Date.now() / 1000);
const COMPETITION_ID = 0;
const COMPETITION_PERIOD_START = NOW - 600;   // started 10 min ago
const COMPETITION_PERIOD_END   = NOW + 7 * 86_400;

// Simulated test wallets (generate fresh for devnet seeding)
const TEST_SQUADS = [
  { name: "Alpha Perps",  memberCount: 3 },
  { name: "Sigma Squad",  memberCount: 5 },
  { name: "Diamond Hands", memberCount: 2 },
  { name: "YOLO Gang",    memberCount: 4 },
];

async function main() {
  console.log("[Seed] Connecting to devnet…");

  const connection  = new Connection(RPC_URL, "confirmed");
  const adminKp     = loadKeypair(ADMIN_KEYPAIR_PATH);
  const indexerKp   = loadKeypair(INDEXER_KEYPAIR_PATH);
  const wallet      = new Wallet(adminKp);
  const provider    = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program     = new Program(idl as never, provider);

  // Airdrop if needed
  const balance = await connection.getBalance(adminKp.publicKey);
  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log("[Seed] Airdropping SOL to admin…");
    await connection.confirmTransaction(
      await connection.requestAirdrop(adminKp.publicKey, 5 * LAMPORTS_PER_SOL)
    );
  }

  // 1. Create competition on-chain
  const competitionIdBN = new BN(COMPETITION_ID);
  const [competitionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("competition"), competitionIdBN.toBuffer("le", 8)],
    program.programId
  );
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("competition_counter")],
    program.programId
  );

  console.log("[Seed] Creating competition…");
  await program.methods
    .createCompetition(
      competitionIdBN,
      new BN(COMPETITION_PERIOD_START),
      new BN(COMPETITION_PERIOD_END),
      64,
      new BN(0),   // no entry stake for devnet test
      new BN(0)    // no squad creation cost
    )
    .accounts({
      competition: competitionPda,
      counter: counterPda,
      admin: adminKp.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKp])
    .rpc();

  console.log(`[Seed] Competition PDA: ${competitionPda.toBase58()}`);

  // 2. Insert competition into DB
  await db.insert(schema.competitions).values({
    onchainPubkey: competitionPda.toBase58(),
    periodStart: COMPETITION_PERIOD_START,
    periodEnd: COMPETITION_PERIOD_END,
    bracketSize: 64,
    entryStakeAdx: 0,
    status: "active",
  });

  // 3. For each test squad, generate wallets, write TradeProofs, create squads in DB
  for (const squadDef of TEST_SQUADS) {
    const members = Array.from({ length: squadDef.memberCount }, () => Keypair.generate());
    const creator = members[0];

    // Write trade proofs for all members
    for (const member of members) {
      const [proofPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("trade_proof"), member.publicKey.toBytes()],
        program.programId
      );

      await connection.confirmTransaction(
        await connection.requestAirdrop(member.publicKey, LAMPORTS_PER_SOL)
      );

      await program.methods
        .writeTradeProof(member.publicKey, new BN(NOW - 3600), 10)
        .accounts({
          tradeProof: proofPda,
          indexerSigner: indexerKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([indexerKp])
        .rpc();
    }

    // Derive squad PDA
    const [squadPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("squad"),
        competitionIdBN.toBuffer("le", 8),
        creator.publicKey.toBytes(),
      ],
      program.programId
    );

    // Insert squad + memberships into DB
    const nameBytes = Buffer.alloc(32);
    Buffer.from(squadDef.name).copy(nameBytes);

    const [newSquad] = await db.insert(schema.squads).values({
      competitionId: 1, // DB auto-id
      onchainPubkey: squadPda.toBase58(),
      creatorWallet: creator.publicKey.toBase58(),
      name: squadDef.name,
      tier: "bronze",
      rasScore: Math.random() * 30,
    }).returning();

    for (const member of members) {
      await db.insert(schema.memberships).values({
        squadId: newSquad.id,
        wallet: member.publicKey.toBase58(),
        rasContribution: Math.random() * 10,
      });

      // Simulate some position events
      const tradeCount = 8 + Math.floor(Math.random() * 20);
      for (let t = 0; t < tradeCount; t++) {
        const openTime  = COMPETITION_PERIOD_START + t * 3600;
        const closeTime = openTime + 1800 + Math.floor(Math.random() * 1800);
        const pnl       = (Math.random() - 0.35) * 200;

        await db.insert(schema.positionEvents).values({
          competitionId: 1,
          wallet: member.publicKey.toBase58(),
          openTime,
          closeTime,
          collateralUsd: 500 + Math.random() * 2000,
          realizedPnlUsd: pnl,
          side: Math.random() > 0.5 ? "long" : "short",
          notionalUsd: 5000 + Math.random() * 20000,
          txSignature: `SIMULATED_${member.publicKey.toBase58().slice(0, 8)}_${t}`,
          washFlagged: false,
        });
      }

      // Streak cache
      await db.insert(schema.streakCache).values({
        wallet: member.publicKey.toBase58(),
        streakDays: Math.floor(Math.random() * 10),
        lastActiveDay: new Date().toISOString().split("T")[0],
      }).onConflictDoNothing();
    }

    console.log(`[Seed] Created squad "${squadDef.name}" with ${squadDef.memberCount} members`);
  }

  // 4. Seed 32 gladiator wallets into bracket
  const gladiators = Array.from({ length: 32 }, () => Keypair.generate());
  for (const g of gladiators) {
    await db.insert(schema.bracketSlots).values({
      competitionId: 1,
      round: 0,
      slotIndex: gladiators.indexOf(g),
      wallet: g.publicKey.toBase58(),
      matchStart: NOW,
      matchEnd: NOW + 86_400,
      status: "live",
    }).onConflictDoNothing();
  }

  console.log("[Seed] Seeded 32 gladiators into bracket.");
  console.log("\n[Seed] Done. Now run the indexer: cd indexer && npm start");
}

main().catch((e) => {
  console.error("[Seed] Error:", e);
  process.exit(1);
});
