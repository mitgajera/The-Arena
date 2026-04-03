import React from "react";
import { Squad } from "../hooks/useSquads";

const TIER_COLORS: Record<string, string> = {
  bronze:  "bg-amber-700 text-amber-100",
  silver:  "bg-slate-400 text-slate-900",
  gold:    "bg-yellow-400 text-yellow-900",
  diamond: "bg-cyan-400 text-cyan-900",
};

interface Props {
  squad: Squad;
  highlighted?: boolean;
  onJoin?: (onchainPubkey: string) => void;
}

export function SquadCard({ squad, highlighted, onJoin }: Props) {
  const tierColor = TIER_COLORS[squad.tier] ?? "bg-gray-600 text-white";

  return (
    <div
      className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
        highlighted
          ? "border-blue-500 bg-blue-900/20"
          : "border-gray-700 bg-gray-800/50"
      }`}
    >
      {/* Rank */}
      <span className="w-8 text-center text-lg font-bold text-gray-400">
        #{squad.rank}
      </span>

      {/* Name + tier */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{squad.name}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${tierColor}`}>
            {squad.tier}
          </span>
        </div>
        <div className="mt-1 flex gap-1">
          {squad.members.map((m) => (
            <span
              key={m.wallet}
              title={m.wallet}
              className="inline-block h-6 w-6 rounded-full bg-gray-600 text-center text-xs leading-6 text-gray-300"
            >
              {m.wallet.slice(0, 2)}
            </span>
          ))}
        </div>
      </div>

      {/* RAS bar */}
      <div className="flex flex-col items-end gap-1 w-40">
        <div className="flex w-full items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-gray-700">
            <div
              className="h-2 rounded-full bg-blue-500"
              style={{ width: `${Math.min((squad.squadRas / 100) * 100, 100)}%` }}
            />
          </div>
          <span className="text-sm font-mono text-white">
            {squad.squadRas.toFixed(1)}
          </span>
        </div>
        <span className="text-xs text-gray-400">{squad.prizeEstimate}</span>
      </div>

      {/* Join CTA */}
      {onJoin && squad.members.length < 5 && (
        <button
          onClick={() => onJoin(squad.onchainPubkey)}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        >
          Join
        </button>
      )}
    </div>
  );
}
