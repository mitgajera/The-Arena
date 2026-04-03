use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("ArenaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

// Replace with the actual trusted indexer keypair public key after generating keys/indexer.json.
pub const INDEXER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");

// Replace with the admin multisig public key before deploying to mainnet.
pub const ADMIN_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");

#[program]
pub mod arena {
    use super::*;

    // Competition lifecycle

    pub fn create_competition(
        ctx: Context<CreateCompetition>,
        id: u64,
        period_start: i64,
        period_end: i64,
        gladiator_bracket_size: u8,
        gladiator_entry_stake_adx: u64,
        squad_creation_cost_adx: u64,
    ) -> Result<()> {
        instructions::handle_create_competition(
            ctx,
            id,
            period_start,
            period_end,
            gladiator_bracket_size,
            gladiator_entry_stake_adx,
            squad_creation_cost_adx,
        )
    }

    // Squad management

    pub fn create_squad(
        ctx: Context<CreateSquad>,
        competition_id: u64,
        name_bytes: [u8; 32],
    ) -> Result<()> {
        instructions::handle_create_squad(ctx, competition_id, name_bytes)
    }

    pub fn join_squad(ctx: Context<JoinSquad>) -> Result<()> {
        instructions::handle_join_squad(ctx)
    }

    pub fn leave_squad(ctx: Context<LeaveSquad>) -> Result<()> {
        instructions::handle_leave_squad(ctx)
    }

    // Gladiator tournament

    pub fn register_gladiator(
        ctx: Context<RegisterGladiator>,
        competition_id: u64,
    ) -> Result<()> {
        instructions::handle_register_gladiator(ctx, competition_id)
    }

    pub fn assign_bracket_slot(
        ctx: Context<AssignBracketSlot>,
        competition_id: u64,
        round: u8,
        slot_index: u16,
        participant: Pubkey,
        match_start: i64,
        match_end: i64,
    ) -> Result<()> {
        instructions::handle_assign_bracket_slot(
            ctx,
            competition_id,
            round,
            slot_index,
            participant,
            match_start,
            match_end,
        )
    }

    pub fn advance_bracket(
        ctx: Context<AdvanceBracket>,
        p1_ras: u64,
        p2_ras: u64,
    ) -> Result<()> {
        instructions::handle_advance_bracket(ctx, p1_ras, p2_ras)
    }

    // Score updates (indexer authority)

    pub fn update_squad_ras(
        ctx: Context<UpdateSquadRas>,
        ras_score: u64,
        tier: SquadTier,
    ) -> Result<()> {
        instructions::handle_update_squad_ras(ctx, ras_score, tier)
    }

    pub fn update_member_ras(
        ctx: Context<UpdateMemberRas>,
        ras_contribution: u64,
    ) -> Result<()> {
        instructions::handle_update_member_ras(ctx, ras_contribution)
    }

    pub fn write_trade_proof(
        ctx: Context<WriteTradeProof>,
        wallet: Pubkey,
        last_trade_at: i64,
        trade_count_30d: u32,
    ) -> Result<()> {
        instructions::handle_write_trade_proof(ctx, wallet, last_trade_at, trade_count_30d)
    }

    // Settlement

    pub fn settle_prizes(ctx: Context<SettlePrizes>, vault_bump: u8) -> Result<()> {
        instructions::handle_settle_prizes(ctx, vault_bump)
    }
}
