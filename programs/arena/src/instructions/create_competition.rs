use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateCompetition<'info> {
    #[account(
        init,
        payer = admin,
        space = Competition::LEN,
        seeds = [b"competition", id.to_le_bytes().as_ref()],
        bump,
    )]
    pub competition: Account<'info, Competition>,

    #[account(
        init_if_needed,
        payer = admin,
        space = CompetitionCounter::LEN,
        seeds = [b"competition_counter"],
        bump,
    )]
    pub counter: Account<'info, CompetitionCounter>,

    /// Admin multisig signer — must match ADMIN_PUBKEY constant.
    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_competition(
    ctx: Context<CreateCompetition>,
    id: u64,
    period_start: i64,
    period_end: i64,
    gladiator_bracket_size: u8,
    gladiator_entry_stake_adx: u64,
    squad_creation_cost_adx: u64,
) -> Result<()> {
    require!(
        gladiator_bracket_size == 32
            || gladiator_bracket_size == 64
            || gladiator_bracket_size == 128,
        ArenaError::InvalidBracketSize
    );
    require!(period_end > period_start, ArenaError::InvalidPeriod);

    let counter = &mut ctx.accounts.counter;
    // First time initialisation
    if counter.next_id == 0 {
        counter.bump = ctx.bumps.counter;
    }
    require!(id == counter.next_id, ArenaError::InvalidCompetitionId);
    counter.next_id += 1;

    let competition = &mut ctx.accounts.competition;
    competition.id = id;
    competition.period_start = period_start;
    competition.period_end = period_end;
    competition.gladiator_bracket_size = gladiator_bracket_size;
    competition.gladiator_entry_stake_adx = gladiator_entry_stake_adx;
    competition.squad_creation_cost_adx = squad_creation_cost_adx;
    competition.status = CompetitionStatus::Active;
    competition.prize_pool_lamports = 0;
    competition.bump = ctx.bumps.competition;

    emit!(CompetitionCreated {
        id,
        period_start,
        period_end,
    });

    Ok(())
}

#[event]
pub struct CompetitionCreated {
    pub id: u64,
    pub period_start: i64,
    pub period_end: i64,
}

#[error_code]
pub enum ArenaError {
    #[msg("Bracket size must be 32, 64, or 128")]
    InvalidBracketSize,
    #[msg("period_end must be after period_start")]
    InvalidPeriod,
    #[msg("Competition ID does not match counter")]
    InvalidCompetitionId,
    #[msg("Competition is not active")]
    CompetitionNotActive,
    #[msg("Squad is full (max 5 members)")]
    SquadFull,
    #[msg("Wallet has not traded on Adrena recently")]
    NoTradeHistory,
    #[msg("Trade proof has expired or is invalid")]
    InvalidTradeProof,
    #[msg("Squad creator cannot leave while other members remain")]
    CreatorCannotLeave,
    #[msg("Only the trusted indexer signer may call this instruction")]
    UnauthorizedIndexer,
    #[msg("Slot is already occupied")]
    SlotOccupied,
    #[msg("Match has not ended yet")]
    MatchNotEnded,
    #[msg("Insufficient ADX balance")]
    InsufficientFunds,
    #[msg("Name exceeds 32 bytes")]
    NameTooLong,
    #[msg("Wallet is already a member of this squad")]
    AlreadyMember,
}
