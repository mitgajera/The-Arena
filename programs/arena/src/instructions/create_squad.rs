use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::instructions::create_competition::ArenaError;

#[derive(Accounts)]
#[instruction(competition_id: u64, name_bytes: [u8; 32])]
pub struct CreateSquad<'info> {
    #[account(
        seeds = [b"competition", competition_id.to_le_bytes().as_ref()],
        bump = competition.bump,
        constraint = competition.status == CompetitionStatus::Active @ ArenaError::CompetitionNotActive,
    )]
    pub competition: Account<'info, Competition>,

    #[account(
        init,
        payer = creator,
        space = Squad::LEN,
        seeds = [b"squad", competition_id.to_le_bytes().as_ref(), creator.key().as_ref()],
        bump,
    )]
    pub squad: Account<'info, Squad>,

    /// Creator's membership account (first member).
    #[account(
        init,
        payer = creator,
        space = Membership::LEN,
        seeds = [b"membership", squad.key().as_ref(), creator.key().as_ref()],
        bump,
    )]
    pub membership: Account<'info, Membership>,

    /// TradeProof PDA written by the indexer, certifying this wallet has traded.
    #[account(
        seeds = [b"trade_proof", creator.key().as_ref()],
        bump = trade_proof.bump,
        constraint = trade_proof.wallet == creator.key() @ ArenaError::InvalidTradeProof,
    )]
    pub trade_proof: Account<'info, TradeProof>,

    /// Creator's ADX token account (source of squad creation fee).
    #[account(mut, constraint = creator_ata.owner == creator.key())]
    pub creator_ata: Account<'info, TokenAccount>,

    /// Program vault ATA that collects fees.
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_squad(
    ctx: Context<CreateSquad>,
    competition_id: u64,
    name_bytes: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // Validate trade proof freshness (7-day window)
    require!(
        ctx.accounts.trade_proof.is_valid(now),
        ArenaError::InvalidTradeProof
    );

    // Transfer squad creation fee to vault
    let cost = ctx.accounts.competition.squad_creation_cost_adx;
    if cost > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.creator_ata.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            cost,
        )?;
    }

    let squad = &mut ctx.accounts.squad;
    squad.competition_id = competition_id;
    squad.creator = ctx.accounts.creator.key();
    squad.name = name_bytes;
    squad.member_count = 1;
    squad.tier = SquadTier::Bronze;
    squad.ras_score = 0;
    squad.created_at = now;
    squad.bump = ctx.bumps.squad;

    let membership = &mut ctx.accounts.membership;
    membership.squad = squad.key();
    membership.wallet = ctx.accounts.creator.key();
    membership.joined_at = now;
    membership.ras_contribution = 0;
    membership.bump = ctx.bumps.membership;

    emit!(SquadCreated {
        squad: squad.key(),
        creator: ctx.accounts.creator.key(),
        competition_id,
    });

    Ok(())
}

#[event]
pub struct SquadCreated {
    pub squad: Pubkey,
    pub creator: Pubkey,
    pub competition_id: u64,
}
