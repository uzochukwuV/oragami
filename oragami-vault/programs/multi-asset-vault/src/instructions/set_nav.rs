use anchor_lang::prelude::*;
use crate::constants::{ASSET_VAULT_SEED, FACTORY_SEED, MAX_NAV_CHANGE_BPS, NAV_BPS_DENOMINATOR};
use crate::error::VaultError;
use crate::state::{AssetVault, Factory};

// ─── Instruction: set_nav ─────────────────────────────────────────────────────
//
// Authority-only. Called by the backend crank after fetching the live
// asset price from SIX Exchange (or any price feed).
//
// nav_price_bps: 10000 = 1:1 with asset token
//               10500 = 1 share redeems 1.05 asset tokens (5% appreciation)
//
// Hard-capped: max 50% change per update to prevent manipulation.

pub fn handler(ctx: Context<SetNav>, nav_price_bps: u64) -> Result<()> {
    require!(nav_price_bps > 0, VaultError::InvalidNav);

    let vault = &mut ctx.accounts.asset_vault;
    let current = vault.nav_price_bps;
    let max_change = current
        .checked_mul(MAX_NAV_CHANGE_BPS)
        .ok_or(VaultError::Overflow)?
        .checked_div(NAV_BPS_DENOMINATOR)
        .ok_or(VaultError::Overflow)?;

    require!(
        nav_price_bps >= current.saturating_sub(max_change)
            && nav_price_bps <= current.saturating_add(max_change),
        VaultError::NavChangeTooLarge
    );

    let old_nav = vault.nav_price_bps;
    vault.nav_price_bps = nav_price_bps;

    emit!(NavUpdated {
        asset_mint: vault.asset_mint,
        old_nav_bps: old_nav,
        new_nav_bps: nav_price_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "NAV updated: asset={} {} → {} bps",
        vault.asset_mint,
        old_nav,
        nav_price_bps
    );
    Ok(())
}

#[derive(Accounts)]
pub struct SetNav<'info> {
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

// ─── Event ────────────────────────────────────────────────────────────────────

#[event]
pub struct NavUpdated {
    pub asset_mint: Pubkey,
    pub old_nav_bps: u64,
    pub new_nav_bps: u64,
    pub timestamp: i64,
}
