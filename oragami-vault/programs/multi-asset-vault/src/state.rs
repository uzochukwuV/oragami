use anchor_lang::prelude::*;
use crate::constants::MAX_ASSETS;

// ─── Factory ──────────────────────────────────────────────────────────────────
//
// Single PDA: seeds = [b"factory"]
// Created once by the authority. Tracks all registered asset mints.

#[account]
pub struct Factory {
    pub bump: u8,
    /// Wallet that can register assets, set NAV, issue credentials
    pub authority: Pubkey,
    /// Fee taken on deposit in basis points (e.g. 10 = 0.10%)
    pub fee_bps: u16,
    /// Mints of all registered asset vaults (gold-mock, silver-mock, ...)
    pub registered_assets: Vec<Pubkey>,
}

impl Factory {
    // 8 discriminator + 1 bump + 32 authority + 2 fee_bps
    // + 4 vec len prefix + 32 * MAX_ASSETS
    pub const SIZE: usize = 8 + 1 + 32 + 2 + 4 + (32 * MAX_ASSETS);
}

// ─── AssetVault ───────────────────────────────────────────────────────────────
//
// One PDA per asset: seeds = [b"vault", asset_mint]
// Holds deposited asset tokens. Issues share tokens at NAV.

#[account]
pub struct AssetVault {
    pub bump: u8,
    /// The SPL token this vault accepts (e.g. GOLD-mock mint)
    pub asset_mint: Pubkey,
    /// The share token this vault mints (e.g. VAULT-GOLD mint)
    /// seeds = [b"share_mint", asset_mint]
    pub share_mint: Pubkey,
    /// PDA token account holding deposited asset tokens
    /// seeds = [b"vault_token", asset_mint]
    pub vault_token_account: Pubkey,
    /// NAV in basis points: 10000 = 1:1, 10500 = 1 share = 1.05 asset tokens
    pub nav_price_bps: u64,
    /// Total asset tokens deposited (raw, 6 decimals)
    pub total_deposits: u64,
    /// Total share tokens in circulation
    pub total_supply: u64,
    /// Minimum deposit in asset token raw units
    pub min_deposit: u64,
    /// Maximum deposit in asset token raw units
    pub max_deposit: u64,
    /// Human-readable ticker, e.g. b"GOLD\0\0\0\0"
    pub ticker: [u8; 8],
    /// If true, deposits >= TRAVEL_RULE_THRESHOLD require TravelRuleData PDA.
    pub travel_rule_required: bool,
    pub paused: bool,
}

impl AssetVault {
    pub const SIZE: usize =
        8   // discriminator
        + 1  // bump
        + 32 // asset_mint
        + 32 // share_mint
        + 32 // vault_token_account
        + 8  // nav_price_bps
        + 8  // total_deposits
        + 8  // total_supply
        + 8  // min_deposit
        + 8  // max_deposit
        + 8  // ticker
        + 1  // travel_rule_required
        + 1; // paused
        // = 155 bytes
}

// ─── TravelRuleData ───────────────────────────────────────────────────────────
//
// Per-deposit Travel Rule payload, single-use.
// Seeds = [b"travel_rule", payer, nonce_hash]

#[account]
pub struct TravelRuleData {
    pub bump: u8,
    pub payer: Pubkey,
    pub amount: u64,
    pub submitted_at: i64,
    pub consumed: bool,
}

impl TravelRuleData {
    pub const SIZE: usize = 8 + 1 + 32 + 8 + 8 + 1;
}

// ─── ComplianceCredential ─────────────────────────────────────────────────────
//
// Soulbound per-wallet credential: seeds = [b"credential", wallet]
// Same structure as the original oragami-vault contract — institutions
// that are credentialed on the original vault are conceptually the same
// entities here. In production these would share a single credential program.

#[account]
pub struct ComplianceCredential {
    pub bump: u8,
    /// The institution wallet this credential gates
    pub wallet: Pubkey,
    /// Legal entity name, UTF-8 null-padded
    pub institution_name: [u8; 64],
    /// ISO 3166-1 alpha-2, e.g. b"CH\0\0"
    pub jurisdiction: [u8; 4],
    /// 1 = retail, 2 = professional, 3 = institutional
    pub tier: u8,
    /// 1 = basic, 2 = enhanced, 3 = full
    pub kyc_level: u8,
    /// 0–100 AML score
    pub aml_coverage: u8,
    /// SHA-256 of off-chain KYC docs (aligned with oragami-vault credential layout)
    pub attestation_hash: [u8; 32],
    pub issued_at: i64,
    pub expires_at: i64,
    /// 1 = active, 3 = revoked
    pub status: u8,
}

impl ComplianceCredential {
    pub const SIZE: usize =
        8   // discriminator
        + 1  // bump
        + 32 // wallet
        + 64 // institution_name
        + 4  // jurisdiction
        + 1  // tier
        + 1  // kyc_level
        + 1  // aml_coverage
        + 32 // attestation_hash
        + 8  // issued_at
        + 8  // expires_at
        + 1; // status
        // = 161 bytes
}
