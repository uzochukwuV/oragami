use anchor_lang::prelude::*;

// ─── PDA Seeds ────────────────────────────────────────────────────────────────

#[constant]
pub const FACTORY_SEED: &[u8] = b"factory";

#[constant]
pub const ASSET_VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";

#[constant]
pub const VAULT_TOKEN_SEED: &[u8] = b"vault_token";

#[constant]
pub const CREDENTIAL_SEED: &[u8] = b"credential";

// ─── NAV ─────────────────────────────────────────────────────────────────────

/// NAV denominator — 10000 = $1.00, 10430 = $1.043
pub const NAV_BPS_DENOMINATOR: u64 = 10_000;

/// Max NAV change allowed per set_nav call (50%)
pub const MAX_NAV_CHANGE_BPS: u64 = 5_000;

// ─── Compliance ───────────────────────────────────────────────────────────────

/// Deposits >= this require Travel Rule (1000 tokens, 6 decimals)
pub const TRAVEL_RULE_THRESHOLD: u64 = 1_000_000_000;

/// Credential status codes
pub const CREDENTIAL_ACTIVE: u8 = 1;
pub const CREDENTIAL_REVOKED: u8 = 3;

// ─── Factory limits ───────────────────────────────────────────────────────────

/// Max number of registered asset vaults in the factory
pub const MAX_ASSETS: usize = 16;

/// Share token decimals (matches typical asset token precision)
pub const SHARE_DECIMALS: u8 = 6;
