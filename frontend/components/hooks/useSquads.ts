import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export interface SquadMember {
  wallet: string;
  ras: number;
  joinedAt: number | null;
}

export interface Squad {
  rank: number;
  name: string;
  creator: string;
  onchainPubkey: string;
  members: SquadMember[];
  squadRas: number;
  tier: "bronze" | "silver" | "gold" | "diamond";
  prizeEstimate: string;
}

export function useSquads(competitionId: number, tier?: string) {
  const tierParam = tier ? `&tier=${tier}` : "";
  const { data, error, isLoading } = useSWR<{ squads: Squad[]; total: number }>(
    `/api/v1/squads?competition_id=${competitionId}${tierParam}`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  return {
    squads: data?.squads ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}
