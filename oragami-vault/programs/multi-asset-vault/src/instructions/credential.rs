use anchor_lang::prelude::*;
use crate::constants::{CREDENTIAL_ACTIVE, CREDENTIAL_REVOKED, CREDENTIAL_SEED, FACTORY_SEED};
use crate::error::VaultError;
use crate::state::{ComplianceCredential, Factory};

// ─── Instruction: issue_credential ───────────────────────────────────────────
//
// Authority-only. Issues a soulbound KYC/AML credential to an institution
// wallet. The wallet cannot deposit into any vault until this exists and
// is active.

pub fn issue_handler(
    ctx: Context<IssueCredential>,
    institution_name: [u8; 64],
    jurisdiction: [u8; 4],
    tier: u8,
    kyc_level: u8,
    aml_coverage: u8,
    expires_at: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(expires_at > now, VaultError::CredentialExpired);

    let cred = &mut ctx.accounts.credential;
    cred.bump = ctx.bumps.credential;
    cred.wallet = ctx.accounts.wallet.key();
    cred.institution_name = institution_name;
    cred.jurisdiction = jurisdiction;
    cred.tier = tier;
    cred.kyc_level = kyc_level;
    cred.aml_coverage = aml_coverage;
    cred.attestation_hash = [0u8; 32];
    cred.issued_at = now;
    cred.expires_at = expires_at;
    cred.status = CREDENTIAL_ACTIVE;

    msg!(
        "Credential issued: wallet={} tier={} kyc={} jurisdiction={:?}",
        cred.wallet,
        tier,
        kyc_level,
        jurisdiction
    );
    Ok(())
}

// ─── Instruction: revoke_credential ──────────────────────────────────────────

pub fn revoke_handler(ctx: Context<RevokeCredential>) -> Result<()> {
    let cred = &mut ctx.accounts.credential;
    require!(
        cred.status != CREDENTIAL_REVOKED,
        VaultError::CredentialAlreadyRevoked
    );
    cred.status = CREDENTIAL_REVOKED;
    msg!("Credential revoked: wallet={}", cred.wallet);
    Ok(())
}

// ─── Contexts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(
    institution_name: [u8; 64],
    jurisdiction: [u8; 4],
    tier: u8,
    kyc_level: u8,
    aml_coverage: u8,
    expires_at: i64
)]
pub struct IssueCredential<'info> {
    #[account(
        seeds = [FACTORY_SEED],
        bump = factory.bump,
        has_one = authority
    )]
    pub factory: Account<'info, Factory>,

    #[account(
        init,
        payer = authority,
        space = ComplianceCredential::SIZE,
        seeds = [CREDENTIAL_SEED, wallet.key().as_ref()],
        bump
    )]
    pub credential: Account<'info, ComplianceCredential>,

    /// CHECK: the wallet receiving the credential — no data read, just used as seed
    pub wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(
        seeds = [FACTORY_SEED],
        bump = factory.bump,
        has_one = authority
    )]
    pub factory: Account<'info, Factory>,

    #[account(
        mut,
        seeds = [CREDENTIAL_SEED, credential.wallet.as_ref()],
        bump = credential.bump
    )]
    pub credential: Account<'info, ComplianceCredential>,

    #[account(mut)]
    pub authority: Signer<'info>,
}
