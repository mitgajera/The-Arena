use anchor_lang::prelude::*;

#[account]
pub struct BracketSlot {
    pub competition_id: u64,
    /// 0 = first round (R64), 1 = R32, etc.
    pub round: u8,
    /// Position in this round's slot array
    pub slot_index: u16,
    /// None if TBD (bye or not yet assigned)
    pub participant: Option<Pubkey>,
    /// RAS snapshot when match closed
    pub ras_score: u64,
    pub match_start: i64,
    pub match_end: i64,
    pub advanced: bool,
    pub eliminated: bool,
    pub bump: u8,
}

impl BracketSlot {
    // 8 + 8 + 1 + 2 + 1+32 + 8 + 8 + 8 + 1 + 1 + 1
    pub const LEN: usize = 8 + 8 + 1 + 2 + (1 + 32) + 8 + 8 + 8 + 1 + 1 + 1;
}

/// Created when a wallet pays the gladiator entry fee.
/// Seeds: ["gladiator_entry", competition_id.to_le_bytes(), wallet.as_ref()]
#[account]
pub struct GladiatorEntry {
    pub competition_id: u64,
    pub wallet: Pubkey,
    pub paid_at: i64,
    pub bump: u8,
}

impl GladiatorEntry {
    pub const LEN: usize = 8 + 8 + 32 + 8 + 1;
}
