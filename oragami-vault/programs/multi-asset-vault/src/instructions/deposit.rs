use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use crate::constants::{ASSET_VAULT_SEED, CREDENTIAL_ACTIVE, CREDENTIAL_SEED, NAV_BPS_DENOMINATOR};
use crate::error::VaultError;
use crate::state::{AssetVault, ComplianceCredential};

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    // ── Guards ────────────────────────────────────────────────────────────────
    let vault = &ctx.accounts.asset_vault;
    require!(!vault.paused, VaultError::VaultPaused);
    require!(amount >= vault.min_deposit, VaultError::DepositTooSmall);
    require!(amount <= vault.max_deposit, VaultError::DepositTooLarge);

    // ── Credential check ──────────────────────────────────────────────────────
    let cred = &ctx.accounts.credential;
    let now = Clock::get()?.unix_timestamp;
    require!(cred.status == CREDENTIAL_ACTIVE, VaultError::CredentialNotActive);
    require!(cred.expires_at > now, VaultError::CredentialExpired);
    require!(
        cred.wallet == ctx.accounts.depositor.key(),
        VaultError::CredentialWalletMismatch
    );

    // ── Compute shares ────────────────────────────────────────────────────────
    let nav = vault.nav_price_bps;
    let shares = amount
        .checked_mul(NAV_BPS_DENOMINATOR)
        .ok_or(VaultError::Overflow)?
        .checked_div(nav)
        .ok_or(VaultError::Overflow)?;
    require!(shares > 0, VaultError::ZeroShares);

    let token_program_id = ctx.accounts.token_program.key();

    // ── Transfer asset tokens: depositor → vault ──────────────────────────────
    token::transfer(
        CpiContext::new(
            token_program_id,
            Transfer {
                from: ctx.accounts.depositor_asset_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
    )?;

    // ── Mint share tokens: vault → depositor ──────────────────────────────────
    let asset_mint_key = ctx.accounts.asset_vault.asset_mint;
    let vault_bump = ctx.accounts.asset_vault.bump;
    let seeds: &[&[u8]] = &[ASSET_VAULT_SEED, asset_mint_key.as_ref(), &[vault_bump]];
    let signer = &[seeds];

    token::mint_to(
        CpiContext::new_with_signer(
            token_program_id,
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.depositor_share_account.to_account_info(),
                authority: ctx.accounts.asset_vault.to_account_info(),
            },
            signer,
        ),
        shares,
    )?;

    // ── State update ──────────────────────────────────────────────────────────
    let vault = &mut ctx.accounts.asset_vault;
    vault.total_deposits = vault
        .total_deposits
        .checked_add(amount)
        .ok_or(VaultError::Overflow)?;
    vault.total_supply = vault
        .total_supply
        .checked_add(shares)
        .ok_or(VaultError::Overflow)?;

    emit!(DepositMade {
        depositor: ctx.accounts.depositor.key(),
        asset_mint: vault.asset_mint,
        asset_amount: amount,
        shares_minted: shares,
        nav_bps: nav,
        timestamp: now,
    });

    msg!(
        "Deposit: {} asset tokens → {} shares at NAV {} bps (depositor: {})",
        amount, shares, nav,
        ctx.accounts.depositor.key()
    );
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
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
    pub depositor_asset_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub depositor_share_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [CREDENTIAL_SEED, depositor.key().as_ref()],
        bump = credential.bump
    )]
    pub credential: Account<'info, ComplianceCredential>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[event]
pub struct DepositMade {
    pub depositor: Pubkey,
    pub asset_mint: Pubkey,
    pub asset_amount: u64,
    pub shares_minted: u64,
    pub nav_bps: u64,
    pub timestamp: i64,
}
