import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export interface BracketParticipant {
  wallet: string;
  ras: number;
}

export interface BracketMatch {
  slot_index: number;
  p1: BracketParticipant | null;
  p2: BracketParticipant | null;
  winner: string | null;
  status: "pending" | "live" | "complete";
  match_start: number | null;
  match_end: number | null;
}

export interface BracketRound {
  round: number;
  label: string;
  matches: BracketMatch[];
}

export interface BracketData {
  competition_id: number;
  bracket_size: number;
  current_round: number;
  rounds: BracketRound[];
}

export interface MyMatch {
  round: number;
  slot_index: number;
  you: BracketParticipant;
  opponent: BracketParticipant | null;
  match_start: number | null;
  match_end: number | null;
  status: string;
}

export function useBracket(competitionId: number) {
  const { data, error, isLoading } = useSWR<BracketData>(
    `/api/v1/gladiator/bracket?competition_id=${competitionId}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  return { bracket: data ?? null, isLoading, error };
}

export function useMyMatch(competitionId: number, wallet: string | null) {
  const { data, error, isLoading } = useSWR<MyMatch>(
    wallet
      ? `/api/v1/gladiator/my-match?competition_id=${competitionId}&wallet=${wallet}`
      : null,
    fetcher,
    { refreshInterval: 30_000 }
  );

  return { match: data ?? null, isLoading, error };
}
