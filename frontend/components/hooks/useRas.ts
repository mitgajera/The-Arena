import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export interface RasScore {
  wallet: string;
  competition_id: number;
  ras: number;
  pnl_pct: number;
  trade_count: number;
  streak_days: number;
  max_drawdown_pct: number;
  eligible: boolean;
  ineligibility_reason: string | null;
  rank: number;
  total_eligible: number;
  percentile: number | null;
}

export function useRas(competitionId: number, wallet: string | null) {
  const { data, error, isLoading } = useSWR<RasScore>(
    wallet
      ? `/api/v1/scores?competition_id=${competitionId}&wallet=${wallet}`
      : null,
    fetcher,
    { refreshInterval: 30_000 }
  );

  return { score: data ?? null, isLoading, error };
}
