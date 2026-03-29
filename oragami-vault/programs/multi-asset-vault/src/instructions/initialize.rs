use anchor_lang::prelude::*;
use crate::constants::FACTORY_SEED;
use crate::state::Factory;

// ─── Instruction: initialize_factory ─────────────────────────────────────────
//
// Called once by the deployer. Creates the Factory PDA that owns all
// asset vaults. The authority can register assets, set NAV, and issue
// compliance credentials.

pub fn handler(ctx: Context<InitializeFactory>, fee_bps: u16) -> Result<()> {
    let factory = &mut ctx.accounts.factory;
    factory.bump = ctx.bumps.factory;
    factory.authority = ctx.accounts.authority.key();
    factory.fee_bps = fee_bps;
    factory.registered_assets = Vec::new();

    msg!(
        "Factory initialized. Authority: {} Fee: {} bps",
        factory.authority,
        factory.fee_bps
    );
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFactory<'info> {
    #[account(
        init,
        payer = authority,
        space = Factory::SIZE,
        seeds = [FACTORY_SEED],
        bump
    )]
    pub factory: Account<'info, Factory>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
