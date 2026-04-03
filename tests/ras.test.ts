import { computeRAS, TradeRecord } from "../indexer/src/ras";

const NOW = 1_700_000_000;
const PERIOD_START = NOW - 7 * 86_400;
const PERIOD_END   = NOW;

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    wallet: "walletA",
    openTime: NOW - 3600,
    closeTime: NOW,
    collateralUsd: 1000,
    realizedPnlUsd: 100,
    side: "long",
    notionalUsd: 10_000,
    ...overrides,
  };
}

function nTrades(n: number, overrides: Partial<TradeRecord> = {}): TradeRecord[] {
  return Array.from({ length: n }, (_, i) =>
    makeTrade({
      openTime: PERIOD_START + i * 1800,
      closeTime: PERIOD_START + i * 1800 + 900,
      ...overrides,
    })
  );
}

describe("computeRAS", () => {
  test("returns 0 for fewer than 5 trades", () => {
    const result = computeRAS(nTrades(4), PERIOD_START, PERIOD_END, 0);
    expect(result.eligible).toBe(false);
    expect(result.ras).toBe(0);
    expect(result.ineligibilityReason).toBe("min_trades");
  });

  test("returns 0 for < 4 hours total holding time", () => {
    // 10 trades, each 5 minutes = 50 min total
    const trades = nTrades(10, { openTime: NOW - 300, closeTime: NOW });
    const result = computeRAS(trades, PERIOD_START, PERIOD_END, 0);
    expect(result.eligible).toBe(false);
    expect(result.ineligibilityReason).toBe("min_holding");
  });

  test("wash trade exclusion: sub-60s trades removed from eligible count", () => {
    // 3 wash trades (< 60s) + 5 valid trades — should fail min_trades
    const washTrades = Array.from({ length: 3 }, (_, i) =>
      makeTrade({
        openTime: PERIOD_START + i * 200,
        closeTime: PERIOD_START + i * 200 + 30, // 30s hold
        notionalUsd: 1000,
      })
    );
    const validTrades = Array.from({ length: 4 }, (_, i) =>
      makeTrade({
        openTime: PERIOD_START + 10000 + i * 7200,
        closeTime: PERIOD_START + 10000 + i * 7200 + 3600,
      })
    );
    const result = computeRAS([...washTrades, ...validTrades], PERIOD_START, PERIOD_END, 0);
    expect(result.eligible).toBe(false);
    expect(result.ineligibilityReason).toBe("min_trades_after_filter");
  });

  test("max drawdown computation (monotone loss sequence)", () => {
    // All trades lose money — peak is initial 0, drawdown should be 0 (no gain to draw down from)
    const trades = Array.from({ length: 10 }, (_, i) =>
      makeTrade({
        openTime: PERIOD_START + i * 7200,
        closeTime: PERIOD_START + i * 7200 + 3600,
        realizedPnlUsd: -50,
      })
    );
    const result = computeRAS(trades, PERIOD_START, PERIOD_END, 0);
    // PnL is negative → RAS is 0 (floor)
    expect(result.ras).toBe(0);
  });

  test("max drawdown penalizes peak-to-trough correctly", () => {
    // Gain 500, then lose 250 → drawdown = 50%
    const trades: TradeRecord[] = [
      makeTrade({ openTime: PERIOD_START, closeTime: PERIOD_START + 7200, realizedPnlUsd: 500 }),
      makeTrade({ openTime: PERIOD_START + 7200, closeTime: PERIOD_START + 14400, realizedPnlUsd: -250 }),
      makeTrade({ openTime: PERIOD_START + 14400, closeTime: PERIOD_START + 21600, realizedPnlUsd: 100 }),
      makeTrade({ openTime: PERIOD_START + 21600, closeTime: PERIOD_START + 28800, realizedPnlUsd: 100 }),
      makeTrade({ openTime: PERIOD_START + 28800, closeTime: PERIOD_START + 36000, realizedPnlUsd: 100 }),
    ];
    const result = computeRAS(trades, PERIOD_START, PERIOD_END, 0);
    expect(result.maxDrawdownPct).toBeCloseTo(50, 0);
    expect(result.eligible).toBe(true);
  });

  test("streak bonus caps at 1.5 (10+ days)", () => {
    const trades = nTrades(20, {
      openTime: PERIOD_START,
      closeTime: PERIOD_START + 7200,
      realizedPnlUsd: 100,
    });
    const resultWith10d  = computeRAS(trades, PERIOD_START, PERIOD_END, 10);
    const resultWith100d = computeRAS(trades, PERIOD_START, PERIOD_END, 100);
    // Both should have same RAS since bonus caps at 0.50 (multiplier 1.50)
    expect(resultWith10d.ras).toBeCloseTo(resultWith100d.ras, 2);
  });

  test("negative PnL floors at 0", () => {
    const trades = nTrades(10, {
      openTime: PERIOD_START,
      closeTime: PERIOD_START + 3600,
      realizedPnlUsd: -100,
    });
    const result = computeRAS(trades, PERIOD_START, PERIOD_END, 5);
    expect(result.ras).toBe(0);
  });

  test("Trader A vs Trader B: A should win with higher RAS", () => {
    // Trader A: 22 trades, 30% PnL, 7 streak days, 8% drawdown
    const traderA: TradeRecord[] = Array.from({ length: 22 }, (_, i) =>
      makeTrade({
        wallet: "traderA",
        openTime: PERIOD_START + i * 7200,
        closeTime: PERIOD_START + i * 7200 + 3600,
        collateralUsd: 1000,
        realizedPnlUsd: 300 / 22,
        notionalUsd: 10_000,
      })
    );

    // Trader B: 8 trades, 40% PnL, 0 streak, 40% drawdown
    const traderBTrades: TradeRecord[] = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeTrade({
          wallet: "traderB",
          openTime: PERIOD_START + i * 7200,
          closeTime: PERIOD_START + i * 7200 + 3600,
          collateralUsd: 1000,
          realizedPnlUsd: 500 / 7,
          notionalUsd: 10_000,
        })
      ),
      makeTrade({
        wallet: "traderB",
        openTime: PERIOD_START + 7 * 7200,
        closeTime: PERIOD_START + 7 * 7200 + 3600,
        collateralUsd: 1000,
        realizedPnlUsd: -100, // causes drawdown
        notionalUsd: 10_000,
      }),
    ];

    const rasA = computeRAS(traderA, PERIOD_START, PERIOD_END, 7);
    const rasB = computeRAS(traderBTrades, PERIOD_START, PERIOD_END, 0);

    expect(rasA.eligible).toBe(true);
    expect(rasB.eligible).toBe(true);
    expect(rasA.ras).toBeGreaterThan(rasB.ras);
  });

  test("positions outside competition period are excluded", () => {
    const outOfPeriod = nTrades(10, {
      openTime: NOW + 86400,
      closeTime: NOW + 90000, // after period end
    });
    const result = computeRAS(outOfPeriod, PERIOD_START, PERIOD_END, 0);
    expect(result.eligible).toBe(false);
    expect(result.ineligibilityReason).toBe("min_trades");
  });
});
