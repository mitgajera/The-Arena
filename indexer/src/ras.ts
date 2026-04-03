export interface TradeRecord {
  wallet: string;
  openTime: number;       // unix seconds
  closeTime: number;
  collateralUsd: number;
  realizedPnlUsd: number;
  side: "long" | "short";
  notionalUsd: number;
}

export interface RasResult {
  wallet: string;
  ras: number;
  pnlPct: number;
  tradeCount: number;
  streakDays: number;
  maxDrawdownPct: number;
  eligible: boolean;
  ineligibilityReason?: string;
}

function zero(wallet: string | undefined, reason: string): RasResult {
  return {
    wallet: wallet ?? "",
    ras: 0,
    pnlPct: 0,
    tradeCount: 0,
    streakDays: 0,
    maxDrawdownPct: 0,
    eligible: false,
    ineligibilityReason: reason,
  };
}

const MIN_TRADES         = 5;
const MIN_HOLDING_SECS   = 4 * 3600;  // 4 hours
const WASH_THRESHOLD_SEC = 60;
const MIN_NOTIONAL_USD   = 50;
const STREAK_BONUS_PER_DAY = 0.05;
const STREAK_BONUS_MAX     = 0.50;

export function computeRAS(
  trades: TradeRecord[],
  periodStart: number,
  periodEnd: number,
  streakDays: number
): RasResult {
  const wallet = trades[0]?.wallet;

  // 1. Filter to competition period
  const periodTrades = trades.filter(
    (t) => t.closeTime >= periodStart && t.closeTime <= periodEnd
  );

  // 2. Eligibility: minimum trade count
  if (periodTrades.length < MIN_TRADES) {
    return zero(wallet, "min_trades");
  }

  // 3. Eligibility: minimum total holding time
  const totalHoldingSecs = periodTrades.reduce(
    (acc, t) => acc + (t.closeTime - t.openTime),
    0
  );
  if (totalHoldingSecs < MIN_HOLDING_SECS) {
    return zero(wallet, "min_holding");
  }

  // 4. Wash trade filter: exclude positions held < 60 seconds
  const afterWashFilter = periodTrades.filter(
    (t) => t.closeTime - t.openTime >= WASH_THRESHOLD_SEC
  );

  // 5. Notional filter: exclude positions < $50
  const validTrades = afterWashFilter.filter(
    (t) => t.notionalUsd >= MIN_NOTIONAL_USD
  );

  if (validTrades.length < MIN_TRADES) {
    return zero(wallet, "min_trades_after_filter");
  }

  // 6. Core metrics
  const avgCollateral =
    validTrades.reduce((a, t) => a + t.collateralUsd, 0) / validTrades.length;

  const totalPnl = validTrades.reduce((a, t) => a + t.realizedPnlUsd, 0);
  const pnlPct   = avgCollateral > 0 ? (totalPnl / avgCollateral) * 100 : 0;

  const N = validTrades.length;
  const tradeMultiplier = Math.log(1 + N) / Math.log(10);

  const streakBonus = 1 + Math.min(streakDays * STREAK_BONUS_PER_DAY, STREAK_BONUS_MAX);

  // 7. Peak-to-trough drawdown on running realized PnL
  const sorted = [...validTrades].sort((a, b) => a.closeTime - b.closeTime);
  let runningPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of sorted) {
    runningPnl += t.realizedPnlUsd;
    if (runningPnl > peak) peak = runningPnl;
    const dd = peak > 0 ? (peak - runningPnl) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const drawdownPenalty = 1 + maxDrawdown * 100;

  const ras = Math.max(
    0,
    (pnlPct * tradeMultiplier * streakBonus) / drawdownPenalty
  );

  return {
    wallet: wallet ?? "",
    ras,
    pnlPct,
    tradeCount: N,
    streakDays,
    maxDrawdownPct: maxDrawdown * 100,
    eligible: true,
  };
}

/**
 * Update the streak for a wallet given the day it last traded and today's date string (YYYY-MM-DD).
 * Returns new streakDays.
 */
export function computeStreak(
  currentStreak: number,
  lastActiveDay: string | null,
  todayDay: string
): number {
  if (!lastActiveDay) return 1;

  const last  = new Date(lastActiveDay).getTime();
  const today = new Date(todayDay).getTime();
  const diffDays = Math.round((today - last) / 86_400_000);

  if (diffDays === 0) return currentStreak;       // same day — no change
  if (diffDays === 1) return currentStreak + 1;   // consecutive — extend
  return 1;                                        // gap — reset
}
