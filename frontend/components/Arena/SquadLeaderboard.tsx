import React, { useState } from "react";
import { useSquads } from "../hooks/useSquads";
import { SquadCard } from "./SquadCard";

const TIERS = ["all", "bronze", "silver", "gold", "diamond"] as const;
type Tier = typeof TIERS[number];

interface Props {
  competitionId: number;
  connectedWallet: string | null;
  onCreateSquad: () => void;
  onJoinSquad: (onchainPubkey: string) => void;
}

export function SquadLeaderboard({
  competitionId,
  connectedWallet,
  onCreateSquad,
  onJoinSquad,
}: Props) {
  const [activeTier, setActiveTier] = useState<Tier>("all");
  const { squads, isLoading, error } = useSquads(
    competitionId,
    activeTier === "all" ? undefined : activeTier
  );

  const mySquad = connectedWallet
    ? squads.find((s) => s.members.some((m) => m.wallet === connectedWallet))
    : null;

  return (
    <div className="space-y-4">
      {/* Tier filter pills */}
      <div className="flex gap-2 flex-wrap">
        {TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => setActiveTier(tier)}
            className={`rounded-full px-4 py-1 text-sm font-semibold capitalize transition-colors ${
              activeTier === tier
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {tier}
          </button>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex gap-3">
        <button
          onClick={onCreateSquad}
          className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          + Create Squad
        </button>
      </div>

      {/* My squad highlight */}
      {mySquad && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-blue-400 font-semibold">
            Your Squad
          </p>
          <SquadCard squad={mySquad} highlighted />
        </div>
      )}

      {/* Leaderboard */}
      <div className="space-y-2">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-800" />
          ))}

        {error && (
          <p className="text-red-400 text-sm">Failed to load squads.</p>
        )}

        {!isLoading && !error && squads.length === 0 && (
          <p className="text-gray-500 text-sm">No squads yet. Be the first!</p>
        )}

        {!isLoading &&
          squads.map((squad) => (
            <SquadCard
              key={squad.onchainPubkey}
              squad={squad}
              highlighted={squad === mySquad}
              onJoin={connectedWallet ? onJoinSquad : undefined}
            />
          ))}
      </div>
    </div>
  );
}
