use anchor_lang::prelude::*;

#[account]
pub struct Squad {
    pub competition_id: u64,
    pub creator: Pubkey,
    /// UTF-8, null-padded to 32 bytes
    pub name: [u8; 32],
    /// Current member count (max 5)
    pub member_count: u8,
    pub tier: SquadTier,
    /// RAS score * 1000 for integer precision
    pub ras_score: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Squad {
    // 8 + 8 + 32 + 32 + 1 + 1 + 8 + 8 + 1
    pub const LEN: usize = 8 + 8 + 32 + 32 + 1 + 1 + 8 + 8 + 1;
    pub const MAX_MEMBERS: u8 = 5;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SquadTier {
    Bronze,
    Silver,
    Gold,
    Diamond,
}
