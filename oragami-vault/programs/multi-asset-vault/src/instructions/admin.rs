use anchor_lang::prelude::*;
use crate::constants::{ASSET_VAULT_SEED, FACTORY_SEED};
use crate::state::{AssetVault, Factory};

// ─── Instruction: pause_vault ─────────────────────────────────────────────────
//
// Authority-only emergency stop for a specific asset vault.
// When paused, deposits are blocked. Redemptions remain open so
// institutions can always exit.

pub fn handler(ctx: Context<PauseVault>, paused: bool) -> Result<()> {
    ctx.accounts.asset_vault.paused = paused;
    msg!(
        "Vault {}: paused={}",
        ctx.accounts.asset_vault.asset_mint,
        paused
    );
    Ok(())
}

#[derive(Accounts)]
pub struct PauseVault<'info> {
    #[account(
        seeds = [FACTORY_SEED],
        bump = factory.bump,
        has_one = authority
    )]
    pub factory: Account<'info, Factory>,

    #[account(
        mut,
        seeds = [ASSET_VAULT_SEED, asset_vault.asset_mint.as_ref()],
        bump = asset_vault.bump
    )]
    pub asset_vault: Account<'info, AssetVault>,

    pub authority: Signer<'info>,
}
