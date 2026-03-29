pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

// These glob re-exports make all context structs visible to the #[program] macro.
// The `handler` name ambiguity warning is harmless — handlers are called via
// explicit module paths inside the program block below.
pub use instructions::admin::*;
pub use instructions::credential::*;
pub use instructions::deposit::*;
pub use instructions::initialize::*;
pub use instructions::redeem::*;
pub use instructions::register_asset::*;
pub use instructions::set_nav::*;
pub use instructions::transfer_shares::*;

declare_id!("6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D");

#[program]
pub mod multi_asset_vault {
    use super::*;
    use crate::instructions::{admin, credential, deposit, initialize, redeem, register_asset, set_nav, transfer_shares};

    // ── Factory ───────────────────────────────────────────────────────────────

    pub fn initialize_factory(ctx: Context<InitializeFactory>, fee_bps: u16) -> Result<()> {
        initialize::handler(ctx, fee_bps)
    }

    // ── Asset management ──────────────────────────────────────────────────────

    pub fn register_asset(
        ctx: Context<RegisterAsset>,
        ticker: [u8; 8],
        nav_price_bps: u64,
        min_deposit: u64,
        max_deposit: u64,
    ) -> Result<()> {
        register_asset::handler(ctx, ticker, nav_price_bps, min_deposit, max_deposit)
    }

    pub fn set_nav(ctx: Context<SetNav>, nav_price_bps: u64) -> Result<()> {
        set_nav::handler(ctx, nav_price_bps)
    }

    pub fn pause_vault(ctx: Context<PauseVault>, paused: bool) -> Result<()> {
        admin::handler(ctx, paused)
    }

    // ── Compliance ────────────────────────────────────────────────────────────

    pub fn issue_credential(
        ctx: Context<IssueCredential>,
        institution_name: [u8; 64],
        jurisdiction: [u8; 4],
        tier: u8,
        kyc_level: u8,
        aml_coverage: u8,
        expires_at: i64,
    ) -> Result<()> {
        credential::issue_handler(ctx, institution_name, jurisdiction, tier, kyc_level, aml_coverage, expires_at)
    }

    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        credential::revoke_handler(ctx)
    }

    // ── Vault operations ──────────────────────────────────────────────────────

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit::handler(ctx, amount)
    }

    pub fn redeem(ctx: Context<Redeem>, share_amount: u64) -> Result<()> {
        redeem::handler(ctx, share_amount)
    }

    /// Transfer share tokens between two credentialed institutions.
    /// Both sender and receiver must hold active credentials.
    /// The underlying asset stays in the vault — only the share changes hands.
    pub fn transfer_shares(ctx: Context<TransferShares>, amount: u64) -> Result<()> {
        transfer_shares::handler(ctx, amount)
    }
}
