import React from "react";
import { BracketMatch } from "../hooks/useGladiator";

function Countdown({ endTs }: { endTs: number }) {
  const [remaining, setRemaining] = React.useState(endTs - Math.floor(Date.now() / 1000));

  React.useEffect(() => {
    const id = setInterval(() => {
      setRemaining(endTs - Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [endTs]);

  if (remaining <= 0) return <span className="text-red-400 text-xs">Ended</span>;

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return (
    <span className="font-mono text-xs text-yellow-400">
      {h}h {m}m {s}s
    </span>
  );
}

interface Props {
  match: BracketMatch;
  connectedWallet?: string | null;
}

export function MatchCard({ match, connectedWallet }: Props) {
  const isLive = match.status === "live";
  const isComplete = match.status === "complete";

  return (
    <div className={`rounded-lg border p-3 text-sm ${isLive ? "border-yellow-500" : "border-gray-700"} bg-gray-900`}>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs font-bold uppercase ${isLive ? "text-yellow-400" : isComplete ? "text-green-400" : "text-gray-400"}`}>
          {isLive ? "LIVE" : isComplete ? "COMPLETE" : "PENDING"}
        </span>
        {isLive && match.match_end && <Countdown endTs={match.match_end} />}
      </div>

      {/* Participants */}
      {[match.p1, match.p2].map((p, i) => {
        if (!p) return (
          <div key={i} className="flex items-center gap-2 py-1 text-gray-500 italic text-xs">
            BYE
          </div>
        );

        const isWinner = match.winner === p.wallet;
        const isMe = connectedWallet === p.wallet;

        return (
          <div
            key={i}
            className={`flex items-center justify-between rounded px-2 py-1 ${
              isWinner ? "bg-green-900/30" : ""
            } ${isMe ? "ring-1 ring-blue-500" : ""}`}
          >
            <span className={`font-mono text-xs ${isMe ? "text-blue-400 font-bold" : "text-gray-300"}`}>
              {p.wallet.slice(0, 6)}…{p.wallet.slice(-4)}
              {isMe && " (you)"}
            </span>
            <span className="font-mono text-xs text-white">
              {p.ras.toFixed(2)} RAS
            </span>
            {isWinner && (
              <span className="ml-2 text-xs text-green-400">W</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
