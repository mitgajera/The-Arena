use anchor_lang::prelude::*;

#[account]
pub struct Membership {
    pub squad: Pubkey,
    pub wallet: Pubkey,
    pub joined_at: i64,
    /// This member's RAS contribution * 1000
    pub ras_contribution: u64,
    pub bump: u8,
}

impl Membership {
    // 8 + 32 + 32 + 8 + 8 + 1
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1;
}
