use anchor_lang::prelude::*;

/// Written by trusted indexer to certify a wallet has traded on Adrena.
/// Seeds: ["trade_proof", wallet.as_ref()]
#[account]
pub struct TradeProof {
    pub wallet: Pubkey,
    pub last_trade_at: i64,
    pub trade_count_30d: u32,
    pub bump: u8,
}

impl TradeProof {
    // 8 + 32 + 8 + 4 + 1
    pub const LEN: usize = 8 + 32 + 8 + 4 + 1;

    /// A trade proof is considered valid if it was updated within the last 7 days.
    pub fn is_valid(&self, now: i64) -> bool {
        self.trade_count_30d >= 1 && (now - self.last_trade_at) < 7 * 24 * 3600
    }
}
