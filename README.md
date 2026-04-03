# The Arena - Adrena Trading Competition Module

A trading competition module for [Adrena](https://app.adrena.xyz), the Solana perpetual DEX. Built for the **Adrena × Autonom: Trading Competition Design & Development** bounty.

---

## What Is The Arena?

The Arena adds two parallel competition tracks on top of Adrena's existing P&L leaderboard, quests, streaks, and raffles:

| Track | Mechanic | Who It's For |
|-------|----------|--------------|
| **Squad Wars** | 5-player teams compete on aggregate RAS score, tiered by collateral | Social / team traders |
| **Gladiator Mode** | Single-elimination bracket, 64 players, 1v1 RAS duels | Competitive solos |

Both tracks use **RAS (Risk-Adjusted Score)** - a composite metric that rewards consistent, disciplined trading over lucky single trades or bot-spamming.

---

## RAS Formula

```
RAS = (PnL% × log(1+N)/log(10) × StreakBonus) / DrawdownPenalty
```

| Component | Effect |
|-----------|--------|
| `PnL%` | Net realized PnL ÷ avg collateral × 100 |
| `log(1+N)/log(10)` | Trade count multiplier - rewards volume but log-scaled to deter bots |
| `StreakBonus = 1 + min(days × 0.05, 0.50)` | Up to +50% for 10 consecutive trading days |
| `DrawdownPenalty = 1 + MaxDrawdown%` | Penalizes peak-to-trough losses - rewards risk management |

**Eligibility gates:** ≥ 5 trades, ≥ 4 hours total holding time, positions ≥ $50 notional, no sub-60s wash trades.

---

## Architecture

```
┌─────────────────────────────────┐
│  Adrena Positions (on-chain)    │
└────────────────┬────────────────┘
                 │ read
        ┌────────▼────────┐
        │  Indexer / Scorer│  TypeScript · Node 20
        │  (poller + RAS) │
        └────────┬────────┘
                 │ write
     ┌───────────▼──────────┐
     │  Postgres (Drizzle)  │  Source of truth for scores
     └───────────┬──────────┘
                 │ read
     ┌───────────▼──────────┐      ┌────────────────┐
     │  Fastify REST API    │◄─────│  Next.js UI    │
     │  /api/v1/...         │      │  (Arena Tab)   │
     └──────────────────────┘      └────────────────┘
                 │ CPI
     ┌───────────▼──────────┐
     │  Arena Solana Program│  Anchor · Rust
     │  (on-chain state)    │
     └──────────────────────┘
```

The system reads Adrena's position accounts - it does **not** rewrite trading logic.

---

## Repo Structure

```
arena/
├── programs/arena/        # Anchor program (Rust)
│   └── src/
│       ├── lib.rs
│       ├── instructions/  # 9 instructions
│       └── state/         # 7 account types
├── indexer/               # Off-chain scorer (TypeScript)
│   └── src/
│       ├── poller.ts      # Adrena position event listener
│       ├── ras.ts         # RAS computation engine
│       ├── squad_aggregator.ts
│       ├── bracket_engine.ts
│       └── schema.ts      # Drizzle DB schema
├── api/                   # REST API (Fastify)
│   └── src/
│       ├── server.ts
│       └── routes/        # squads, scores, gladiator, health
├── frontend/              # Next.js components
│   └── components/Arena/  # ArenaTab, SquadLeaderboard, GladiatorBracket, RasCalculator
├── tests/                 # ras.test.ts, bracket.test.ts, program.test.ts
├── scripts/               # seed_devnet, run_test_competition, deploy
├── Anchor.toml
├── arena_config.toml
└── .env.example
```

---

## Quick Start

### Prerequisites

- Rust + `cargo-build-sbf` (Solana 1.18.x)
- Anchor CLI 0.30.x
- Node.js 20+
- Postgres 15+
- Solana CLI with a funded devnet wallet

### 1. Install

```bash
cd programs/arena && cargo build-sbf
cd ../../indexer && npm install
cd ../api && npm install
cd ../frontend && npm install
```

### 2. Configure

```bash
cp .env.example .env
# Fill in DATABASE_URL, RPC_URL, WS_URL, ADRENA_PROGRAM_ID
```

### 3. Database

```bash
cd indexer && npx drizzle-kit push
```

### 4. Deploy program (devnet)

```bash
anchor build
anchor deploy --provider.cluster devnet

# Update ARENA_PROGRAM_ID in .env and lib.rs INDEXER_PUBKEY / ADMIN_PUBKEY
ts-node scripts/deploy.ts --cluster devnet
```

### 5. Seed test data

```bash
ts-node scripts/seed_devnet.ts
```

### 6. Run services

```bash
# Terminal 1 - indexer
cd indexer && npm start

# Terminal 2 - API
cd api && npm start

# Terminal 3 - frontend
cd frontend && npm run dev
```

### 7. Run tests

```bash
# Unit tests (RAS + bracket)
cd indexer && npm test

# Anchor program tests
anchor test
```

### 8. Run test competition

```bash
ts-node scripts/run_test_competition.ts
# Outputs a JSON report at the end
```

---

## API Reference

Base: `GET /api/v1/`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/squads?competition_id=1&tier=gold` | Squad leaderboard |
| GET | `/squads/:onchain_pubkey` | Squad detail |
| POST | `/squads/create` | Returns unsigned tx for wallet to sign |
| GET | `/scores?competition_id=1&wallet=ABC` | Wallet RAS breakdown |
| GET | `/gladiator/bracket?competition_id=1` | Full bracket state |
| GET | `/gladiator/my-match?competition_id=1&wallet=ABC` | Current match for a wallet |
| GET | `/health` | Service health + indexer lag |

---

## On-Chain Program

### Instructions

| Instruction | Authority |
|-------------|-----------|
| `create_competition` | Admin |
| `create_squad` | Any wallet (with TradeProof) |
| `join_squad` | Any wallet (with TradeProof) |
| `leave_squad` | Member |
| `register_gladiator` | Any wallet (with TradeProof) |
| `assign_bracket_slot` | Indexer signer |
| `advance_bracket` | Indexer signer |
| `update_squad_ras` | Indexer signer |
| `write_trade_proof` | Indexer signer |
| `settle_prizes` | Admin |

### Prize Distribution

```
Total pool (entry fees)
  ├── 20% → Treasury
  ├── 35% → Gladiator champion
  ├── 10% each → Top 4 finalists
  └── remaining → Squad tier prizes (proportional RAS within each tier)
```

---

## Abuse Prevention

| Attack | Mitigation |
|--------|------------|
| Wash trading | Sub-60s positions excluded; sub-$50 notional excluded |
| Cross-wallet wash | Log-scaling trade count (N) diminishes returns from fake volume |
| Sandbagging | Drawdown penalty punishes oscillating strategies |
| Sybil bots | TradeProof PDA requires prior Adrena activity; entry stake on Gladiator mode |
| Bracket manipulation | VRF seed for bracket assignment; indexer is a trusted keypair, not anonymous |
| Score gaming in final moments | Bracket uses RAS snapshot at match end, not live reads |

---

## Integration with Adrena

Before mainnet deployment, confirm with the Adrena team:

1. **Adrena Program ID** (mainnet + devnet)
2. **Position account layout** - field offsets for `owner`, `opened_at`, `closed_at`, `realized_pnl`, `collateral`, `size`, `side`
3. **Streak system** - is `streak_days` stored on-chain per wallet? PDA seed?
4. **Raffle CPI** - interface for consolation ticket issuance (stubbed in `advance_bracket.rs`)
5. **ADX token mint** - for entry fee collection
6. **Existing indexer** - can we subscribe to their event stream instead of polling?
7. **Frontend integration** - standalone Next.js page or drop-in component to existing repo?

---

## Out of Scope (v1)

- On-chain raffle CPI (stubbed - emits event)
- Trophy NFT minting via Metaplex (stubbed - logs message)
- Squad chat (compressed account messages)
- Mobile app
- Cross-competition seasonal leaderboard

---

## License

MIT
