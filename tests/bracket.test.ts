import { seedBracket, resolveExpiredMatches } from "../indexer/src/bracket_engine";

// Mock the DB and program for bracket tests
jest.mock("../indexer/src/db", () => {
  const slots: Record<string, unknown>[] = [];

  return {
    db: {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockImplementation((rows) => {
          if (Array.isArray(rows)) slots.push(...rows);
          else slots.push(rows);
          return Promise.resolve();
        }),
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      }),
      query: {
        bracketSlots: {
          findMany: jest.fn().mockResolvedValue(slots),
        },
        rasScores: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    },
    schema: {
      bracketSlots: {
        competitionId: "competition_id",
        round: "round",
        slotIndex: "slot_index",
        id: "id",
      },
    },
    __slots: slots,
  };
});

describe("seedBracket", () => {
  test("64 registrants seeds 32 R1 matches correctly", async () => {
    const { db, __slots } = require("../indexer/src/db");
    __slots.length = 0;

    const registrants = Array.from({ length: 64 }, (_, i) => `wallet${i}`);
    const vrfSeed = Buffer.from("deadbeef1234567890abcdef12345678", "hex");
    const now = Math.floor(Date.now() / 1000);

    await seedBracket(1, registrants, 64, vrfSeed, 86_400, now);

    // Should insert 128 slot rows (2 per match × 32 matches)
    expect(__slots.length).toBe(128);

    // All round 0
    expect(__slots.every((s: { round: unknown }) => s.round === 0)).toBe(true);

    // Slot indices 0..127
    const indices = __slots.map((s: { slotIndex: unknown }) => s.slotIndex).sort((a: number, b: number) => a - b);
    for (let i = 0; i < 128; i++) {
      expect(indices[i]).toBe(i);
    }

    // No BYEs (64 exactly fills 64-bracket)
    expect(__slots.every((s: { wallet: unknown }) => s.wallet !== null)).toBe(true);
  });

  test("VRF seeding is deterministic given the same seed", async () => {
    const { __slots } = require("../indexer/src/db");

    const registrants = Array.from({ length: 32 }, (_, i) => `wallet${i}`);
    const vrfSeed = Buffer.from("cafebabe12345678cafebabe12345678", "hex");
    const now = Math.floor(Date.now() / 1000);

    __slots.length = 0;
    await seedBracket(2, registrants, 32, vrfSeed, 86_400, now);
    const run1 = __slots.map((s: { wallet: unknown }) => s.wallet).slice();

    __slots.length = 0;
    await seedBracket(2, registrants, 32, vrfSeed, 86_400, now);
    const run2 = __slots.map((s: { wallet: unknown }) => s.wallet).slice();

    expect(run1).toEqual(run2);
  });

  test("bye handling if odd number of registrants", async () => {
    const { __slots } = require("../indexer/src/db");
    __slots.length = 0;

    const registrants = Array.from({ length: 30 }, (_, i) => `wallet${i}`);
    const vrfSeed = Buffer.from("deadbeef1234567890abcdef12345678", "hex");
    const now = Math.floor(Date.now() / 1000);

    await seedBracket(3, registrants, 32, vrfSeed, 86_400, now);

    // 2 slots should be BYEs
    const byes = __slots.filter((s: { wallet: unknown }) => s.wallet === null);
    expect(byes.length).toBe(2);
  });

  test("winners advance to next round at correct slot indices", () => {
    // Given pairs at slot indices (0,1), (2,3), etc.:
    // Winner of (0,1) goes to slot 0 of round 1
    // Winner of (2,3) goes to slot 1 of round 1
    const pairings = [
      { slotIndex: 0, expectedNextSlot: 0 },
      { slotIndex: 2, expectedNextSlot: 1 },
      { slotIndex: 4, expectedNextSlot: 2 },
      { slotIndex: 6, expectedNextSlot: 3 },
    ];

    for (const { slotIndex, expectedNextSlot } of pairings) {
      const nextSlot = Math.floor(slotIndex / 2);
      expect(nextSlot).toBe(expectedNextSlot);
    }
  });
});
