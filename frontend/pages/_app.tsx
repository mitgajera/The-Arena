import type { AppProps } from "next/app";
import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  BackpackWalletAdapter,
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import "../styles/globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";

const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet") as
  | "mainnet-beta"
  | "devnet";

export default function App({ Component, pageProps }: AppProps) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl(NETWORK),
    []
  );

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter()],
    []
  );

  const handleWalletError = (error: Error) => {
    console.error("[Wallet] Adapter error:", error.message);
  };

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={handleWalletError}>
        <WalletModalProvider>
          <Component {...pageProps} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
