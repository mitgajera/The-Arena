import React, { useState, useCallback } from "react";
import { SquadLeaderboard } from "./SquadLeaderboard";
import { GladiatorBracket } from "./GladiatorBracket";
import { RasCalculator } from "./RasCalculator";

const TABS = [
  { id: "squads",    label: "Squad Wars" },
  { id: "gladiator", label: "Gladiator Mode" },
  { id: "ras",       label: "RAS Calculator" },
] as const;

type TabId = typeof TABS[number]["id"];

interface Props {
  competitionId: number;
  connectedWallet: string | null;
}

export function ArenaTab({ competitionId, connectedWallet }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("squads");

  // --- wallet transaction helpers ---
  // These call the API to get an unsigned tx, then ask the wallet adapter to sign + send.
  const handleCreateSquad = useCallback(async () => {
    const name = window.prompt("Enter squad name (max 32 chars):");
    if (!name || !connectedWallet) return;

    const res = await fetch("/api/v1/squads/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, competition_id: competitionId, wallet: connectedWallet }),
    });
    const data = await res.json();
    // TODO: sign & send data.base64_tx via wallet adapter once program is deployed
    console.log("[Arena] create_squad instruction params:", data.params);
    alert("Squad creation queued — sign the transaction in your wallet.");
  }, [competitionId, connectedWallet]);

  const handleJoinSquad = useCallback(async (onchainPubkey: string) => {
    if (!connectedWallet) return;
    // TODO: build join_squad tx and send via wallet adapter
    console.log("[Arena] join_squad:", { onchainPubkey, wallet: connectedWallet });
    alert("Join squad transaction — wallet signing coming once program is deployed.");
  }, [connectedWallet]);

  const handleRegister = useCallback(async () => {
    if (!connectedWallet) return;
    // TODO: build register_gladiator tx via wallet adapter
    console.log("[Arena] register_gladiator:", { competitionId, wallet: connectedWallet });
    alert("Gladiator registration — wallet signing coming once program is deployed.");
  }, [competitionId, connectedWallet]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-white">The Arena</h1>
        <p className="text-sm text-gray-400">
          Competition #{competitionId} — {connectedWallet ? `${connectedWallet.slice(0, 6)}…${connectedWallet.slice(-4)}` : "Connect wallet to compete"}
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-800 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-500 text-blue-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-6 py-6">
        {activeTab === "squads" && (
          <SquadLeaderboard
            competitionId={competitionId}
            connectedWallet={connectedWallet}
            onCreateSquad={handleCreateSquad}
            onJoinSquad={handleJoinSquad}
          />
        )}

        {activeTab === "gladiator" && (
          <GladiatorBracket
            competitionId={competitionId}
            connectedWallet={connectedWallet}
            onRegister={handleRegister}
          />
        )}

        {activeTab === "ras" && <RasCalculator />}
      </div>
    </div>
  );
}
