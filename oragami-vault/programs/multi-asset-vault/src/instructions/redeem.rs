use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use crate::constants::{ASSET_VAULT_SEED, NAV_BPS_DENOMINATOR};
use crate::error::VaultError;
use crate::state::AssetVault;

pub fn handler(ctx: Context<Redeem>, share_amount: u64) -> Result<()> {
    require!(!ctx.accounts.asset_vault.paused, VaultError::VaultPaused);
    require!(share_amount > 0, VaultError::ZeroShares);

    let vault = &ctx.accounts.asset_vault;
    let nav = vault.nav_price_bps;

    let asset_amount = share_amount
        .checked_mul(nav)
        .ok_or(VaultError::Overflow)?
        .checked_div(NAV_BPS_DENOMINATOR)
        .ok_or(VaultError::Overflow)?;

    require!(
        ctx.accounts.vault_token_account.amount >= asset_amount,
        VaultError::InsufficientVaultFunds
    );

    let token_program_id = ctx.accounts.token_program.key();

    // ── Burn share tokens ─────────────────────────────────────────────────────
    token::burn(
        CpiContext::new(
            token_program_id,
            Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.redeemer_share_account.to_account_info(),
                authority: ctx.accounts.redeemer.to_account_info(),
            },
        ),
        share_amount,
    )?;

    // ── Transfer asset tokens: vault → redeemer ───────────────────────────────
    let asset_mint_key = ctx.accounts.asset_vault.asset_mint;
    let vault_bump = ctx.accounts.asset_vault.bump;
    let seeds: &[&[u8]] = &[ASSET_VAULT_SEED, asset_mint_key.as_ref(), &[vault_bump]];
    let signer = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            token_program_id,
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.redeemer_asset_account.to_account_info(),
                authority: ctx.accounts.asset_vault.to_account_info(),
            },
            signer,
        ),
        asset_amount,
    )?;

    // ── State update ──────────────────────────────────────────────────────────
    let vault = &mut ctx.accounts.asset_vault;
    vault.total_deposits = vault.total_deposits.saturating_sub(asset_amount);
    vault.total_supply = vault
        .total_supply
        .checked_sub(share_amount)
        .ok_or(VaultError::Overflow)?;

    emit!(RedeemMade {
        redeemer: ctx.accounts.redeemer.key(),
        asset_mint: vault.asset_mint,
        shares_burned: share_amount,
        asset_amount_returned: asset_amount,
        nav_bps: nav,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "Redeem: {} shares → {} asset tokens at NAV {} bps (redeemer: {})",
        share_amount, asset_amount, nav,
        ctx.accounts.redeemer.key()
    );
    Ok(())
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(
        mut,
        seeds = [ASSET_VAULT_SEED, asset_vault.asset_mint.as_ref()],
        bump = asset_vault.bump
    )]
    pub asset_vault: Account<'info, AssetVault>,

    #[account(mut, address = asset_vault.share_mint)]
    pub share_mint: Account<'info, Mint>,

    #[account(mut, address = asset_vault.vault_token_account)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub redeemer_share_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub redeemer_asset_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub redeemer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[event]
pub struct RedeemMade {
    pub redeemer: Pubkey,
    pub asset_mint: Pubkey,
    pub shares_burned: u64,
    pub asset_amount_returned: u64,
    pub nav_bps: u64,
    pub timestamp: i64,
}
