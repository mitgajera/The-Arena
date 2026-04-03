use anchor_lang::prelude::*;

#[account]
pub struct Competition {
    /// Auto-increment competition ID
    pub id: u64,
    /// Unix timestamp — competition window start
    pub period_start: i64,
    /// Unix timestamp — competition window end
    pub period_end: i64,
    /// Gladiator bracket size: 32, 64, or 128
    pub gladiator_bracket_size: u8,
    /// Entry stake in ADX lamports (6 decimals)
    pub gladiator_entry_stake_adx: u64,
    /// Squad creation cost in ADX lamports
    pub squad_creation_cost_adx: u64,
    pub status: CompetitionStatus,
    /// Accumulated lamports from entry fees
    pub prize_pool_lamports: u64,
    pub bump: u8,
}

impl Competition {
    // 8 discriminator + fields
    pub const LEN: usize = 8 + 8 + 8 + 8 + 1 + 8 + 8 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CompetitionStatus {
    Active,
    Ended,
    Settling,
}

/// Global counter for auto-incrementing competition IDs.
/// Seeds: ["competition_counter"]
#[account]
pub struct CompetitionCounter {
    pub next_id: u64,
    pub bump: u8,
}

impl CompetitionCounter {
    pub const LEN: usize = 8 + 8 + 1;
}
