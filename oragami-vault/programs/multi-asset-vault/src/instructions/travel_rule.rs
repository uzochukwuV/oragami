use anchor_lang::prelude::*;
use crate::constants::{TRAVEL_RULE_SEED, TRAVEL_RULE_THRESHOLD};
use crate::error::VaultError;
use crate::state::TravelRuleData;

pub fn handler(ctx: Context<InitTravelRule>, amount: u64, _nonce_hash: [u8; 32]) -> Result<()> {
    require!(amount >= TRAVEL_RULE_THRESHOLD, VaultError::DepositTooSmall);

    let tr = &mut ctx.accounts.travel_rule_data;
    tr.bump = ctx.bumps.travel_rule_data;
    tr.payer = ctx.accounts.payer.key();
    tr.amount = amount;
    tr.submitted_at = Clock::get()?.unix_timestamp;
    tr.consumed = false;
    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce_hash: [u8; 32])]
pub struct InitTravelRule<'info> {
    #[account(
        init,
        payer = payer,
        space = TravelRuleData::SIZE,
        seeds = [TRAVEL_RULE_SEED, payer.key().as_ref(), &nonce_hash],
        bump
    )]
    pub travel_rule_data: Account<'info, TravelRuleData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
