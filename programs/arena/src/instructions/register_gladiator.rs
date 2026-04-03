use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::instructions::create_competition::ArenaError;

#[derive(Accounts)]
#[instruction(competition_id: u64)]
pub struct RegisterGladiator<'info> {
    #[account(
        mut,
        seeds = [b"competition", competition_id.to_le_bytes().as_ref()],
        bump = competition.bump,
        constraint = competition.status == CompetitionStatus::Active @ ArenaError::CompetitionNotActive,
    )]
    pub competition: Account<'info, Competition>,

    #[account(
        init,
        payer = wallet,
        space = GladiatorEntry::LEN,
        seeds = [b"gladiator_entry", competition_id.to_le_bytes().as_ref(), wallet.key().as_ref()],
        bump,
    )]
    pub gladiator_entry: Account<'info, GladiatorEntry>,

    #[account(
        seeds = [b"trade_proof", wallet.key().as_ref()],
        bump = trade_proof.bump,
        constraint = trade_proof.wallet == wallet.key() @ ArenaError::InvalidTradeProof,
    )]
    pub trade_proof: Account<'info, TradeProof>,

    #[account(mut, constraint = wallet_ata.owner == wallet.key())]
    pub wallet_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub wallet: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_gladiator(
    ctx: Context<RegisterGladiator>,
    competition_id: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        ctx.accounts.trade_proof.is_valid(now),
        ArenaError::InvalidTradeProof
    );

    // Collect entry stake
    let stake = ctx.accounts.competition.gladiator_entry_stake_adx;
    if stake > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.wallet_ata.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.wallet.to_account_info(),
                },
            ),
            stake,
        )?;
    }

    // Accumulate into prize pool (tracked in lamports equivalent — actual distribution in ADX)
    ctx.accounts.competition.prize_pool_lamports += stake;

    let entry = &mut ctx.accounts.gladiator_entry;
    entry.competition_id = competition_id;
    entry.wallet = ctx.accounts.wallet.key();
    entry.paid_at = now;
    entry.bump = ctx.bumps.gladiator_entry;

    emit!(GladiatorRegistered {
        wallet: ctx.accounts.wallet.key(),
        competition_id,
        stake,
    });

    Ok(())
}

#[event]
pub struct GladiatorRegistered {
    pub wallet: Pubkey,
    pub competition_id: u64,
    pub stake: u64,
}
