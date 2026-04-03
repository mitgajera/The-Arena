import Head from "next/head";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ArenaTab } from "../components/Arena/ArenaTab";

const COMPETITION_ID = parseInt(
  process.env.NEXT_PUBLIC_COMPETITION_ID ?? "1",
  10
);

export default function CompetitionPage() {
  const { publicKey, connected } = useWallet();
  const connectedWallet = publicKey?.toBase58() ?? null;

  return (
    <>
      <Head>
        <title>The Arena — Adrena Trading Competition</title>
        <meta
          name="description"
          content="Squad Wars, Gladiator Mode, and RAS leaderboard for Adrena's trading competition."
        />
      </Head>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        <span className="rounded-full bg-black/70 px-3 py-1 text-xs text-white">
          {connected && connectedWallet
            ? `${connectedWallet.slice(0, 4)}...${connectedWallet.slice(-4)}`
            : "Wallet not connected"}
        </span>
        <WalletMultiButton />
      </div>

      <ArenaTab competitionId={COMPETITION_ID} connectedWallet={connectedWallet} />
    </>
  );
}
