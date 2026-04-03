import React, { useState, useMemo } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="font-mono text-white">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  );
}

function computeRas(pnlPct: number, tradeCount: number, streakDays: number, maxDrawdownPct: number): number {
  if (tradeCount < 5) return 0;
  const N = tradeCount;
  const tradeMultiplier = Math.log(1 + N) / Math.log(10);
  const streakBonus = 1 + Math.min(streakDays * 0.05, 0.5);
  const drawdownPenalty = 1 + maxDrawdownPct;
  return Math.max(0, (pnlPct * tradeMultiplier * streakBonus) / drawdownPenalty);
}

const ARCHETYPES = [
  { label: "Whale", pnlPct: 80, tradeCount: 20, streakDays: 5, maxDrawdownPct: 30 },
  { label: "Consistent", pnlPct: 25, tradeCount: 50, streakDays: 14, maxDrawdownPct: 5 },
  { label: "High-freq Bot", pnlPct: 8, tradeCount: 200, streakDays: 7, maxDrawdownPct: 2 },
];

export function RasCalculator() {
  const [pnlPct, setPnlPct]           = useState(20);
  const [tradeCount, setTradeCount]   = useState(30);
  const [streakDays, setStreakDays]   = useState(5);
  const [maxDrawdown, setMaxDrawdown] = useState(10);

  const ras = useMemo(
    () => computeRas(pnlPct, tradeCount, streakDays, maxDrawdown),
    [pnlPct, tradeCount, streakDays, maxDrawdown]
  );

  return (
    <div className="space-y-6">
      {/* Sliders */}
      <div className="space-y-5 rounded-xl bg-gray-800/60 p-6">
        <Slider label="Net PnL %" value={pnlPct} min={-50} max={300} step={1} unit="%" onChange={setPnlPct} />
        <Slider label="Trade Count" value={tradeCount} min={1} max={300} step={1} unit="" onChange={setTradeCount} />
        <Slider label="Streak Days" value={streakDays} min={0} max={30} step={1} unit="d" onChange={setStreakDays} />
        <Slider label="Max Drawdown %" value={maxDrawdown} min={0} max={100} step={1} unit="%" onChange={setMaxDrawdown} />
      </div>

      {/* RAS output */}
      <div className="rounded-xl bg-blue-900/30 border border-blue-700 p-6 text-center">
        <p className="text-sm text-blue-300 mb-1">Your Estimated RAS Score</p>
        <p className="text-5xl font-bold text-white">{ras.toFixed(2)}</p>
        {tradeCount < 5 && (
          <p className="mt-2 text-xs text-red-400">Need at least 5 trades to be eligible</p>
        )}
      </div>

      {/* Formula explanation */}
      <div className="rounded-xl bg-gray-800/60 p-4 text-xs text-gray-400 space-y-1">
        <p className="font-semibold text-gray-300">Formula</p>
        <p>RAS = (PnL% × log(1+N)/log(10) × (1 + min(streak×0.05, 0.5))) / (1 + MaxDrawdown%)</p>
        <ul className="mt-2 space-y-0.5 list-disc list-inside">
          <li>PnL% — realized PnL as a % of average collateral</li>
          <li>N — trade count (log-scaled, prevents bot farming)</li>
          <li>Streak bonus — up to +50% for 10+ consecutive days</li>
          <li>Drawdown penalty — divides by 1 + drawdown%, rewards risk management</li>
        </ul>
      </div>

      {/* Archetype comparison */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="pb-2 pr-4">Archetype</th>
              <th className="pb-2 pr-4">PnL%</th>
              <th className="pb-2 pr-4">Trades</th>
              <th className="pb-2 pr-4">Streak</th>
              <th className="pb-2 pr-4">MaxDD%</th>
              <th className="pb-2">RAS</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-800 text-blue-300 font-semibold">
              <td className="py-2 pr-4">You</td>
              <td className="py-2 pr-4">{pnlPct}%</td>
              <td className="py-2 pr-4">{tradeCount}</td>
              <td className="py-2 pr-4">{streakDays}d</td>
              <td className="py-2 pr-4">{maxDrawdown}%</td>
              <td className="py-2 font-mono">{ras.toFixed(2)}</td>
            </tr>
            {ARCHETYPES.map((a) => {
              const aRas = computeRas(a.pnlPct, a.tradeCount, a.streakDays, a.maxDrawdownPct);
              return (
                <tr key={a.label} className="border-b border-gray-800 text-gray-300">
                  <td className="py-2 pr-4">{a.label}</td>
                  <td className="py-2 pr-4">{a.pnlPct}%</td>
                  <td className="py-2 pr-4">{a.tradeCount}</td>
                  <td className="py-2 pr-4">{a.streakDays}d</td>
                  <td className="py-2 pr-4">{a.maxDrawdownPct}%</td>
                  <td className="py-2 font-mono">{aRas.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
