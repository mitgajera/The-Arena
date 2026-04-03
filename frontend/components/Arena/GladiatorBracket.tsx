import React, { useState } from "react";
import { useBracket, useMyMatch, BracketMatch } from "../hooks/useGladiator";
import { MatchCard } from "./MatchCard";

interface Props {
  competitionId: number;
  connectedWallet: string | null;
  onRegister: () => void;
}

export function GladiatorBracket({ competitionId, connectedWallet, onRegister }: Props) {
  const { bracket, isLoading, error } = useBracket(competitionId);
  const { match: myMatch } = useMyMatch(competitionId, connectedWallet);
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-gray-800" />
        ))}
      </div>
    );
  }

  if (error) return <p className="text-red-400">Failed to load bracket.</p>;

  if (!bracket || bracket.rounds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-gray-400">Tournament bracket not yet seeded.</p>
        {connectedWallet && (
          <button
            onClick={onRegister}
            className="rounded bg-purple-600 px-6 py-2 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Register for Next Tournament
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* My match banner */}
      {myMatch && (
        <div className="rounded-lg border border-blue-500 bg-blue-900/20 p-4">
          <p className="mb-2 text-sm font-bold text-blue-300">Your Current Match — Round {myMatch.round + 1}</p>
          <MatchCard
            match={{
              slot_index: myMatch.slot_index,
              p1: myMatch.you,
              p2: myMatch.opponent,
              winner: null,
              status: myMatch.status as "pending" | "live" | "complete",
              match_start: myMatch.match_start,
              match_end: myMatch.match_end,
            }}
            connectedWallet={connectedWallet}
          />
        </div>
      )}

      {/* Register CTA */}
      {connectedWallet && !myMatch && (
        <div className="flex justify-center">
          <button
            onClick={onRegister}
            className="rounded bg-purple-600 px-6 py-2 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Register for Next Tournament (10 ADX)
          </button>
        </div>
      )}

      {/* Full bracket — rendered left to right, one column per round */}
      <div className="overflow-x-auto">
        <div className="flex gap-4" style={{ minWidth: `${bracket.rounds.length * 220}px` }}>
          {bracket.rounds.map((round) => (
            <div key={round.round} className="flex flex-col gap-2" style={{ width: 200 }}>
              <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-gray-400">
                {round.label}
              </h3>
              {round.matches.map((match) => (
                <button
                  key={match.slot_index}
                  onClick={() => setSelectedMatch(match)}
                  className="w-full text-left focus:outline-none"
                >
                  <MatchCard match={match} connectedWallet={connectedWallet} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Detail modal */}
      {selectedMatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setSelectedMatch(null)}
        >
          <div
            className="w-80 rounded-xl bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold text-white">Match Detail</h2>
            <MatchCard match={selectedMatch} connectedWallet={connectedWallet} />
            <button
              onClick={() => setSelectedMatch(null)}
              className="mt-4 w-full rounded bg-gray-700 py-2 text-sm text-white hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
