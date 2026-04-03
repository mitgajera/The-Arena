use anchor_lang::prelude::*;
use crate::state::*;
use crate::instructions::create_competition::ArenaError;

/// Called by the trusted indexer to assign a wallet to a bracket slot.
#[derive(Accounts)]
#[instruction(competition_id: u64, round: u8, slot_index: u16)]
pub struct AssignBracketSlot<'info> {
    #[account(
        init,
        payer = indexer_signer,
        space = BracketSlot::LEN,
        seeds = [
            b"bracket_slot",
            competition_id.to_le_bytes().as_ref(),
            round.to_le_bytes().as_ref(),
            slot_index.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub bracket_slot: Account<'info, BracketSlot>,

    /// CHECK: authority verified against INDEXER_PUBKEY constant in program.
    #[account(mut, constraint = indexer_signer.key() == crate::INDEXER_PUBKEY @ ArenaError::UnauthorizedIndexer)]
    pub indexer_signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_assign_bracket_slot(
    ctx: Context<AssignBracketSlot>,
    competition_id: u64,
    round: u8,
    slot_index: u16,
    participant: Pubkey,
    match_start: i64,
    match_end: i64,
) -> Result<()> {
    let slot = &mut ctx.accounts.bracket_slot;
    slot.competition_id = competition_id;
    slot.round = round;
    slot.slot_index = slot_index;
    slot.participant = Some(participant);
    slot.ras_score = 0;
    slot.match_start = match_start;
    slot.match_end = match_end;
    slot.advanced = false;
    slot.eliminated = false;
    slot.bump = ctx.bumps.bracket_slot;

    Ok(())
}

/// Called by the trusted indexer once a match window has expired.
#[derive(Accounts)]
pub struct AdvanceBracket<'info> {
    #[account(mut)]
    pub p1_slot: Account<'info, BracketSlot>,

    #[account(mut)]
    pub p2_slot: Account<'info, BracketSlot>,

    /// Next round's winner slot — must already be initialised by a prior assign_bracket_slot call.
    #[account(mut)]
    pub winner_slot: Account<'info, BracketSlot>,

    #[account(
        init,
        payer = indexer_signer,
        space = MatchRecord::LEN,
        seeds = [
            b"match_record",
            p1_slot.competition_id.to_le_bytes().as_ref(),
            p1_slot.round.to_le_bytes().as_ref(),
            p1_slot.slot_index.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub match_record: Account<'info, MatchRecord>,

    /// CHECK: authority verified against INDEXER_PUBKEY.
    #[account(mut, constraint = indexer_signer.key() == crate::INDEXER_PUBKEY @ ArenaError::UnauthorizedIndexer)]
    pub indexer_signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_advance_bracket(
    ctx: Context<AdvanceBracket>,
    p1_ras: u64,
    p2_ras: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let p1 = &mut ctx.accounts.p1_slot;
    let p2 = &mut ctx.accounts.p2_slot;

    require!(now >= p1.match_end, ArenaError::MatchNotEnded);

    let p1_wallet = p1.participant.unwrap_or_default();
    let p2_wallet = p2.participant.unwrap_or_default();

    let winner_wallet = if p1_ras >= p2_ras { p1_wallet } else { p2_wallet };
    let loser_wallet  = if p1_ras >= p2_ras { p2_wallet } else { p1_wallet };

    p1.ras_score = p1_ras;
    p2.ras_score = p2_ras;

    if winner_wallet == p1_wallet {
        p1.advanced = true;
        p2.eliminated = true;
    } else {
        p2.advanced = true;
        p1.eliminated = true;
    }

    // Write winner into next slot
    ctx.accounts.winner_slot.participant = Some(winner_wallet);

    // Write immutable match record
    let record = &mut ctx.accounts.match_record;
    record.competition_id = p1.competition_id;
    record.round = p1.round;
    record.slot_index = p1.slot_index;
    record.p1 = p1_wallet;
    record.p2 = p2_wallet;
    record.p1_ras = p1_ras;
    record.p2_ras = p2_ras;
    record.winner = winner_wallet;
    record.resolved_at = now;
    record.bump = ctx.bumps.match_record;

    emit!(MatchResolved {
        competition_id: p1.competition_id,
        round: p1.round,
        slot_index: p1.slot_index,
        winner: winner_wallet,
        loser: loser_wallet,
        p1_ras,
        p2_ras,
    });

    // NOTE: Consolation raffle ticket issuance is stubbed here.
    // When Adrena provides the raffle CPI interface, call it for `loser_wallet`.
    msg!(
        "RAFFLE_STUB: issue consolation ticket to {}",
        loser_wallet.to_string()
    );

    Ok(())
}

#[event]
pub struct MatchResolved {
    pub competition_id: u64,
    pub round: u8,
    pub slot_index: u16,
    pub winner: Pubkey,
    pub loser: Pubkey,
    pub p1_ras: u64,
    pub p2_ras: u64,
}
