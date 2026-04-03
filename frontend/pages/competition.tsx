import React from "react";
import Head from "next/head";
import { ArenaTab } from "../components/Arena/ArenaTab";

// Replace with your wallet adapter integration (e.g. @solana/wallet-adapter-react).
// This page is designed as a drop-in to the existing Adrena Next.js frontend.
// Pass `competitionId` and `connectedWallet` as props or read them from context.

const COMPETITION_ID = parseInt(process.env.NEXT_PUBLIC_COMPETITION_ID ?? "1", 10);

export default function CompetitionPage() {
  // In the real integration: read from useWallet() hook provided by Adrena's wallet adapter context.
  const connectedWallet =
    typeof window !== "undefined"
      ? (window as unknown as { __arenaWallet?: string }).__arenaWallet ?? null
      : null;

  return (
    <>
      <Head>
        <title>The Arena — Adrena Trading Competition</title>
        <meta
          name="description"
          content="Squad Wars, Gladiator Mode, and RAS leaderboard for Adrena's trading competition."
        />
      </Head>
      <ArenaTab competitionId={COMPETITION_ID} connectedWallet={connectedWallet} />
    </>
  );
}
