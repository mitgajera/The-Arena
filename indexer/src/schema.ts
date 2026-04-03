import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  bigint,
  timestamp,
  date,
  unique,
} from "drizzle-orm/pg-core";

export const competitions = pgTable("competitions", {
  id: serial("id").primaryKey(),
  onchainPubkey: text("onchain_pubkey").notNull(),
  periodStart: integer("period_start").notNull(),
  periodEnd: integer("period_end").notNull(),
  bracketSize: integer("bracket_size").notNull(),
  entryStakeAdx: bigint("entry_stake_adx", { mode: "number" }),
  status: text("status").notNull().default("active"), // active | ended | settling
  createdAt: timestamp("created_at").defaultNow(),
});

export const squads = pgTable("squads", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id").references(() => competitions.id),
  onchainPubkey: text("onchain_pubkey").notNull().unique(),
  creatorWallet: text("creator_wallet").notNull(),
  name: text("name").notNull(),
  tier: text("tier").notNull(), // bronze | silver | gold | diamond
  rasScore: real("ras_score").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: serial("id").primaryKey(),
    squadId: integer("squad_id").references(() => squads.id),
    wallet: text("wallet").notNull(),
    joinedAt: timestamp("joined_at").defaultNow(),
    rasContribution: real("ras_contribution").default(0),
  },
  (t) => ({
    uniq: unique().on(t.squadId, t.wallet),
  })
);

export const positionEvents = pgTable("position_events", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id").references(() => competitions.id),
  wallet: text("wallet").notNull(),
  openTime: integer("open_time").notNull(),
  closeTime: integer("close_time").notNull(),
  collateralUsd: real("collateral_usd").notNull(),
  realizedPnlUsd: real("realized_pnl_usd").notNull(),
  side: text("side").notNull(), // long | short
  notionalUsd: real("notional_usd").notNull(),
  txSignature: text("tx_signature").notNull().unique(),
  washFlagged: boolean("wash_flagged").default(false),
});

export const rasScores = pgTable(
  "ras_scores",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id").references(() => competitions.id),
    wallet: text("wallet").notNull(),
    ras: real("ras").notNull(),
    pnlPct: real("pnl_pct"),
    tradeCount: integer("trade_count"),
    streakDays: integer("streak_days"),
    maxDrawdownPct: real("max_drawdown_pct"),
    eligible: boolean("eligible").default(true),
    ineligibilityReason: text("ineligibility_reason"),
    computedAt: timestamp("computed_at").defaultNow(),
  },
  (t) => ({
    uniq: unique().on(t.competitionId, t.wallet),
  })
);

export const bracketSlots = pgTable(
  "bracket_slots",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id").references(() => competitions.id),
    round: integer("round").notNull(), // 0 = first round
    slotIndex: integer("slot_index").notNull(),
    wallet: text("wallet"), // null if TBD / bye
    rasAtClose: real("ras_at_close"),
    matchStart: integer("match_start"),
    matchEnd: integer("match_end"),
    status: text("status").default("pending"), // pending | live | complete | eliminated
  },
  (t) => ({
    uniq: unique().on(t.competitionId, t.round, t.slotIndex),
  })
);

export const streakCache = pgTable("streak_cache", {
  wallet: text("wallet").primaryKey(),
  streakDays: integer("streak_days").notNull().default(0),
  lastActiveDay: date("last_active_day"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Competition = typeof competitions.$inferSelect;
export type Squad = typeof squads.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type PositionEvent = typeof positionEvents.$inferSelect;
export type RasScore = typeof rasScores.$inferSelect;
export type BracketSlot = typeof bracketSlots.$inferSelect;
export type StreakCache = typeof streakCache.$inferSelect;
