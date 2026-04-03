use anchor_lang::prelude::*;
use crate::state::*;
use crate::instructions::create_competition::ArenaError;

/// Called every 5 minutes by the trusted indexer to push the latest RAS scores on-chain.
#[derive(Accounts)]
pub struct UpdateSquadRas<'info> {
    #[account(mut)]
    pub squad: Account<'info, Squad>,

    /// CHECK: authority verified against INDEXER_PUBKEY constant.
    #[account(constraint = indexer_signer.key() == crate::INDEXER_PUBKEY @ ArenaError::UnauthorizedIndexer)]
    pub indexer_signer: Signer<'info>,
}

pub fn handle_update_squad_ras(
    ctx: Context<UpdateSquadRas>,
    ras_score: u64,
    tier: SquadTier,
) -> Result<()> {
    let squad = &mut ctx.accounts.squad;
    squad.ras_score = ras_score;
    squad.tier = tier;

    emit!(SquadRasUpdated {
        squad: squad.key(),
        ras_score,
    });

    Ok(())
}

/// Updates a single member's ras_contribution within their Membership PDA.
#[derive(Accounts)]
pub struct UpdateMemberRas<'info> {
    #[account(mut)]
    pub membership: Account<'info, Membership>,

    #[account(constraint = indexer_signer.key() == crate::INDEXER_PUBKEY @ ArenaError::UnauthorizedIndexer)]
    pub indexer_signer: Signer<'info>,
}

pub fn handle_update_member_ras(
    ctx: Context<UpdateMemberRas>,
    ras_contribution: u64,
) -> Result<()> {
    ctx.accounts.membership.ras_contribution = ras_contribution;
    Ok(())
}

/// Writes a TradeProof PDA to certify that a wallet has traded on Adrena.
#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct WriteTradeProof<'info> {
    #[account(
        init_if_needed,
        payer = indexer_signer,
        space = TradeProof::LEN,
        seeds = [b"trade_proof", wallet.as_ref()],
        bump,
    )]
    pub trade_proof: Account<'info, TradeProof>,

    #[account(mut, constraint = indexer_signer.key() == crate::INDEXER_PUBKEY @ ArenaError::UnauthorizedIndexer)]
    pub indexer_signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_write_trade_proof(
    ctx: Context<WriteTradeProof>,
    wallet: Pubkey,
    last_trade_at: i64,
    trade_count_30d: u32,
) -> Result<()> {
    let proof = &mut ctx.accounts.trade_proof;
    proof.wallet = wallet;
    proof.last_trade_at = last_trade_at;
    proof.trade_count_30d = trade_count_30d;
    proof.bump = ctx.bumps.trade_proof;
    Ok(())
}

#[event]
pub struct SquadRasUpdated {
    pub squad: Pubkey,
    pub ras_score: u64,
}
