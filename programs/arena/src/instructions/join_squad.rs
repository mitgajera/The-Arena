use anchor_lang::prelude::*;
use crate::state::*;
use crate::instructions::create_competition::ArenaError;

#[derive(Accounts)]
pub struct JoinSquad<'info> {
    #[account(
        seeds = [b"competition", squad.competition_id.to_le_bytes().as_ref()],
        bump = competition.bump,
        constraint = competition.status == CompetitionStatus::Active @ ArenaError::CompetitionNotActive,
    )]
    pub competition: Account<'info, Competition>,

    #[account(
        mut,
        constraint = squad.member_count < Squad::MAX_MEMBERS @ ArenaError::SquadFull,
    )]
    pub squad: Account<'info, Squad>,

    #[account(
        init,
        payer = wallet,
        space = Membership::LEN,
        seeds = [b"membership", squad.key().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub membership: Account<'info, Membership>,

    /// TradeProof certifying this wallet has traded on Adrena.
    #[account(
        seeds = [b"trade_proof", wallet.key().as_ref()],
        bump = trade_proof.bump,
        constraint = trade_proof.wallet == wallet.key() @ ArenaError::InvalidTradeProof,
    )]
    pub trade_proof: Account<'info, TradeProof>,

    #[account(mut)]
    pub wallet: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_join_squad(ctx: Context<JoinSquad>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        ctx.accounts.trade_proof.is_valid(now),
        ArenaError::InvalidTradeProof
    );

    let squad = &mut ctx.accounts.squad;
    squad.member_count += 1;

    let membership = &mut ctx.accounts.membership;
    membership.squad = squad.key();
    membership.wallet = ctx.accounts.wallet.key();
    membership.joined_at = now;
    membership.ras_contribution = 0;
    membership.bump = ctx.bumps.membership;

    emit!(MemberJoined {
        squad: squad.key(),
        wallet: ctx.accounts.wallet.key(),
        member_count: squad.member_count,
    });

    Ok(())
}

#[event]
pub struct MemberJoined {
    pub squad: Pubkey,
    pub wallet: Pubkey,
    pub member_count: u8,
}
