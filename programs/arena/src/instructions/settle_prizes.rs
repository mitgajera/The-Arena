use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::instructions::create_competition::ArenaError;

/// Called by admin once the competition period has ended to distribute prizes.
/// Prize split:
///   - 20% treasury
///   - 35% → gladiator champion
///   - 10% each → top-4 gladiator finalists
///   - remaining → proportional squad RAS split within each tier
#[derive(Accounts)]
pub struct SettlePrizes<'info> {
    #[account(
        mut,
        seeds = [b"competition", competition.id.to_le_bytes().as_ref()],
        bump = competition.bump,
        constraint = competition.status == CompetitionStatus::Ended @ ArenaError::CompetitionNotActive,
    )]
    pub competition: Account<'info, Competition>,

    /// Program ADX vault (source of all prize transfers).
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    /// Treasury ATA (receives 20%).
    #[account(mut)]
    pub treasury_ata: Account<'info, TokenAccount>,

    /// Champion wallet ATA (receives 35%).
    #[account(mut)]
    pub champion_ata: Account<'info, TokenAccount>,

    /// Admin signer — must match ADMIN_PUBKEY constant.
    #[account(constraint = admin.key() == crate::ADMIN_PUBKEY @ ArenaError::UnauthorizedIndexer)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_settle_prizes(
    ctx: Context<SettlePrizes>,
    vault_bump: u8,
) -> Result<()> {
    let total = ctx.accounts.vault.amount;
    require!(total > 0, ArenaError::InsufficientFunds);

    let treasury_share = total * 20 / 100;
    let champion_share = total * 35 / 100;

    // Build vault signer seeds for CPI
    let competition_id_bytes = ctx.accounts.competition.id.to_le_bytes();
    let vault_seeds: &[&[u8]] = &[
        b"vault",
        competition_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    // Transfer treasury share
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.treasury_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        treasury_share,
    )?;

    // Transfer champion share
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.champion_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        champion_share,
    )?;

    // Mark competition as settling — squad-tier prizes distributed in a
    // separate batched instruction once squad rankings are final.
    ctx.accounts.competition.status = CompetitionStatus::Settling;

    emit!(PrizesSettled {
        competition_id: ctx.accounts.competition.id,
        total,
        treasury_share,
        champion_share,
    });

    // NOTE: Trophy NFT minting (Metaplex) is stubbed.
    msg!("TROPHY_STUB: mint winner NFT");

    Ok(())
}

#[event]
pub struct PrizesSettled {
    pub competition_id: u64,
    pub total: u64,
    pub treasury_share: u64,
    pub champion_share: u64,
}
