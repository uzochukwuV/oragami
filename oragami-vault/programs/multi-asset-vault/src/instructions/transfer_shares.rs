use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::{
    ASSET_VAULT_SEED, CREDENTIAL_ACTIVE, CREDENTIAL_SEED, ORAGAMI_VAULT_PROGRAM_ID,
};
use crate::error::VaultError;
use crate::state::{AssetVault, ComplianceCredential};

// ─── Instruction: transfer_shares ────────────────────────────────────────────
//
// Transfers VAULT-GOLD (or any share token) from one credentialed institution
// to another. The vault acts as the compliance layer — both sender and receiver
// must hold active, non-expired credentials before the transfer executes.
//
// The underlying asset (GOLD-mock) never moves — it stays in the vault PDA.
// Only the share token changes hands. The vault remains custodian throughout.
//
// This is the on-chain equivalent of a central counterparty settlement:
//   Institution A sells position → Institution B buys position
//   Vault validates both sides → transfer executes at current NAV
//   Full audit trail via TransferMade event

pub fn handler(ctx: Context<TransferShares>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::ZeroShares);
    require!(!ctx.accounts.asset_vault.paused, VaultError::VaultPaused);

    let now = Clock::get()?.unix_timestamp;

    // ── Sender credential check ───────────────────────────────────────────────
    let expected_sender_credential_pda = Pubkey::find_program_address(
        &[CREDENTIAL_SEED, ctx.accounts.sender.key().as_ref()],
        &ORAGAMI_VAULT_PROGRAM_ID,
    )
    .0;
    require!(
        ctx.accounts.sender_credential.key() == expected_sender_credential_pda,
        VaultError::InvalidCredentialPda
    );
    require!(
        *ctx.accounts.sender_credential.owner == ORAGAMI_VAULT_PROGRAM_ID,
        VaultError::WrongCredentialProgram
    );
    let sender_cred_data_ref = ctx.accounts.sender_credential.try_borrow_data()?;
    let mut sender_cred_data: &[u8] = &sender_cred_data_ref;
    let sender_cred = ComplianceCredential::try_deserialize(&mut sender_cred_data)?;
    require!(
        sender_cred.status == CREDENTIAL_ACTIVE,
        VaultError::CredentialNotActive
    );
    require!(sender_cred.expires_at > now, VaultError::CredentialExpired);
    require!(
        sender_cred.wallet == ctx.accounts.sender.key(),
        VaultError::CredentialWalletMismatch
    );

    // ── Receiver credential check ─────────────────────────────────────────────
    let receiver_wallet = ctx.accounts.receiver_share_account.owner;
    let expected_receiver_credential_pda = Pubkey::find_program_address(
        &[CREDENTIAL_SEED, receiver_wallet.as_ref()],
        &ORAGAMI_VAULT_PROGRAM_ID,
    )
    .0;
    require!(
        ctx.accounts.receiver_credential.key() == expected_receiver_credential_pda,
        VaultError::InvalidCredentialPda
    );
    require!(
        *ctx.accounts.receiver_credential.owner == ORAGAMI_VAULT_PROGRAM_ID,
        VaultError::WrongCredentialProgram
    );
    let receiver_cred_data_ref = ctx.accounts.receiver_credential.try_borrow_data()?;
    let mut receiver_cred_data: &[u8] = &receiver_cred_data_ref;
    let receiver_cred = ComplianceCredential::try_deserialize(&mut receiver_cred_data)?;
    require!(
        receiver_cred.status == CREDENTIAL_ACTIVE,
        VaultError::ReceiverCredentialNotActive
    );
    require!(
        receiver_cred.expires_at > now,
        VaultError::ReceiverCredentialExpired
    );

    let token_program_id = ctx.accounts.token_program.key();

    // ── Transfer share tokens: sender → receiver ──────────────────────────────
    token::transfer(
        CpiContext::new(
            token_program_id,
            Transfer {
                from: ctx.accounts.sender_share_account.to_account_info(),
                to: ctx.accounts.receiver_share_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        ),
        amount,
    )?;

    emit!(TransferMade {
        asset_mint: ctx.accounts.asset_vault.asset_mint,
        sender: ctx.accounts.sender.key(),
        receiver: ctx.accounts.receiver_share_account.owner,
        share_amount: amount,
        nav_bps: ctx.accounts.asset_vault.nav_price_bps,
        timestamp: now,
    });

    msg!(
        "TransferShares: {} VAULT-{} from {} | nav={} bps",
        amount,
        String::from_utf8_lossy(&ctx.accounts.asset_vault.ticker)
            .trim_matches('\0'),
        ctx.accounts.sender.key(),
        ctx.accounts.asset_vault.nav_price_bps,
    );
    Ok(())
}

#[derive(Accounts)]
pub struct TransferShares<'info> {
    #[account(
        seeds = [ASSET_VAULT_SEED, asset_vault.asset_mint.as_ref()],
        bump = asset_vault.bump
    )]
    pub asset_vault: Account<'info, AssetVault>,

    /// Sender's share token account (e.g. their VAULT-GOLD ATA)
    #[account(
        mut,
        constraint = sender_share_account.mint == asset_vault.share_mint
            @ VaultError::WrongShareMint
    )]
    pub sender_share_account: Account<'info, TokenAccount>,

    /// Receiver's share token account — must already exist
    #[account(
        mut,
        constraint = receiver_share_account.mint == asset_vault.share_mint
            @ VaultError::WrongShareMint
    )]
    pub receiver_share_account: Account<'info, TokenAccount>,

    /// Sender's compliance credential
    /// CHECK: validated against oragami-vault credential PDA + owner in handler.
    #[account(
        seeds = [CREDENTIAL_SEED, sender.key().as_ref()],
        bump,
        seeds::program = ORAGAMI_VAULT_PROGRAM_ID
    )]
    pub sender_credential: UncheckedAccount<'info>,

    /// Receiver's compliance credential
    /// seeds = [b"credential", receiver_share_account.owner]
    /// CHECK: validated against oragami-vault credential PDA + owner in handler.
    #[account(
        seeds = [CREDENTIAL_SEED, receiver_share_account.owner.as_ref()],
        bump,
        seeds::program = ORAGAMI_VAULT_PROGRAM_ID
    )]
    pub receiver_credential: UncheckedAccount<'info>,

    #[account(mut)]
    pub sender: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ─── Event ────────────────────────────────────────────────────────────────────

#[event]
pub struct TransferMade {
    pub asset_mint: Pubkey,
    pub sender: Pubkey,
    pub receiver: Pubkey,
    pub share_amount: u64,
    pub nav_bps: u64,
    pub timestamp: i64,
}
