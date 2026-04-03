use anchor_lang::prelude::*;
use crate::state::*;
use crate::instructions::create_competition::ArenaError;

#[derive(Accounts)]
pub struct LeaveSquad<'info> {
    #[account(mut)]
    pub squad: Account<'info, Squad>,

    /// Membership PDA to close — rent returned to the member.
    #[account(
        mut,
        seeds = [b"membership", squad.key().as_ref(), wallet.key().as_ref()],
        bump = membership.bump,
        constraint = membership.wallet == wallet.key(),
        close = wallet,
    )]
    pub membership: Account<'info, Membership>,

    #[account(mut)]
    pub wallet: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_leave_squad(ctx: Context<LeaveSquad>) -> Result<()> {
    let squad = &mut ctx.accounts.squad;
    let wallet = ctx.accounts.wallet.key();

    // Creator cannot leave while other members remain
    if squad.creator == wallet && squad.member_count > 1 {
        return err!(ArenaError::CreatorCannotLeave);
    }

    squad.member_count = squad.member_count.saturating_sub(1);

    emit!(MemberLeft {
        squad: squad.key(),
        wallet,
        member_count: squad.member_count,
    });

    Ok(())
}

#[event]
pub struct MemberLeft {
    pub squad: Pubkey,
    pub wallet: Pubkey,
    pub member_count: u8,
}
