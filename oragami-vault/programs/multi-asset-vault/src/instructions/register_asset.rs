use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use crate::constants::{
    ASSET_VAULT_SEED, FACTORY_SEED, SHARE_DECIMALS, SHARE_MINT_SEED, VAULT_TOKEN_SEED,
};
use crate::error::VaultError;
use crate::state::{AssetVault, Factory};
use anchor_spl::token::TokenAccount;

// ─── Instruction: register_asset ─────────────────────────────────────────────
//
// Authority-only. Creates:
//   - AssetVault PDA  [b"vault", asset_mint]
//   - Share mint PDA  [b"share_mint", asset_mint]  (e.g. VAULT-GOLD)
//   - Vault token account PDA [b"vault_token", asset_mint]
//
// After this call the vault is live and accepts deposits.

pub fn handler(
    ctx: Context<RegisterAsset>,
    ticker: [u8; 8],
    nav_price_bps: u64,
    min_deposit: u64,
    max_deposit: u64,
) -> Result<()> {
    require!(nav_price_bps > 0, VaultError::InvalidNav);

    let asset_mint_key = ctx.accounts.asset_mint.key();

    // Record in factory registry
    let factory = &mut ctx.accounts.factory;
    require!(
        !factory.registered_assets.contains(&asset_mint_key),
        VaultError::AssetAlreadyRegistered
    );
    require!(
        factory.registered_assets.len() < crate::constants::MAX_ASSETS,
        VaultError::FactoryFull
    );
    factory.registered_assets.push(asset_mint_key);

    // Initialise vault state
    let vault = &mut ctx.accounts.asset_vault;
    vault.bump = ctx.bumps.asset_vault;
    vault.asset_mint = asset_mint_key;
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.vault_token_account = ctx.accounts.vault_token_account.key();
    vault.nav_price_bps = nav_price_bps;
    vault.total_deposits = 0;
    vault.total_supply = 0;
    vault.min_deposit = min_deposit;
    vault.max_deposit = max_deposit;
    vault.ticker = ticker;
    vault.paused = false;

    msg!(
        "Asset registered: mint={} ticker={} nav={} bps",
        asset_mint_key,
        String::from_utf8_lossy(&ticker),
        nav_price_bps
    );
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterAsset<'info> {
    #[account(
        mut,
        seeds = [FACTORY_SEED],
        bump = factory.bump,
        has_one = authority
    )]
    pub factory: Account<'info, Factory>,

    #[account(
        init,
        payer = authority,
        space = AssetVault::SIZE,
        seeds = [ASSET_VAULT_SEED, asset_mint.key().as_ref()],
        bump
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Share token mint — minted by the vault PDA as authority
    /// seeds = [b"share_mint", asset_mint]
    #[account(
        init,
        payer = authority,
        mint::decimals = SHARE_DECIMALS,
        mint::authority = asset_vault,
        seeds = [SHARE_MINT_SEED, asset_mint.key().as_ref()],
        bump
    )]
    pub share_mint: Account<'info, Mint>,

    /// Vault's token account for holding deposited asset tokens
    /// seeds = [b"vault_token", asset_mint]
    #[account(
        init,
        payer = authority,
        token::mint = asset_mint,
        token::authority = asset_vault,
        seeds = [VAULT_TOKEN_SEED, asset_mint.key().as_ref()],
        bump
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// The asset SPL mint (e.g. GOLD-mock)
    pub asset_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
