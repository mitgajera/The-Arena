use anchor_lang::prelude::*;

/// Immutable record written after a bracket match resolves.
/// Seeds: ["match_record", competition_id.to_le_bytes(), round.to_le_bytes(), slot_index.to_le_bytes()]
#[account]
pub struct MatchRecord {
    pub competition_id: u64,
    pub round: u8,
    /// Slot index of p1 (p2 = slot_index + 1 if even, slot_index - 1 if odd)
    pub slot_index: u16,
    pub p1: Pubkey,
    pub p2: Pubkey,
    pub p1_ras: u64,
    pub p2_ras: u64,
    pub winner: Pubkey,
    pub resolved_at: i64,
    pub bump: u8,
}

impl MatchRecord {
    // 8 + 8 + 1 + 2 + 32 + 32 + 8 + 8 + 32 + 8 + 1
    pub const LEN: usize = 8 + 8 + 1 + 2 + 32 + 32 + 8 + 8 + 32 + 8 + 1;
}
