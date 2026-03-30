use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    // ─── Factory ─────────────────────────────────────────────────────────────
    #[msg("Asset is already registered in this factory")]
    AssetAlreadyRegistered,

    #[msg("Factory has reached the maximum number of registered assets")]
    FactoryFull,

    // ─── Vault ───────────────────────────────────────────────────────────────
    #[msg("Vault is paused")]
    VaultPaused,

    #[msg("Deposit amount is below the vault minimum")]
    DepositTooSmall,

    #[msg("Deposit amount exceeds the vault maximum")]
    DepositTooLarge,

    #[msg("Vault has insufficient asset tokens for this redemption")]
    InsufficientVaultFunds,

    // ─── NAV ─────────────────────────────────────────────────────────────────
    #[msg("NAV must be greater than zero")]
    InvalidNav,

    #[msg("NAV change exceeds the 50% maximum per update")]
    NavChangeTooLarge,

    // ─── Compliance ──────────────────────────────────────────────────────────
    #[msg("Wallet does not hold an active compliance credential")]
    CredentialNotActive,

    #[msg("Compliance credential has expired")]
    CredentialExpired,

    #[msg("Credential wallet does not match the depositor")]
    CredentialWalletMismatch,

    #[msg("Credential is already revoked")]
    CredentialAlreadyRevoked,

    // ─── Math ────────────────────────────────────────────────────────────────
    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Share amount must be greater than zero")]
    ZeroShares,

    #[msg("Receiver wallet does not hold an active compliance credential")]
    ReceiverCredentialNotActive,

    #[msg("Receiver compliance credential has expired")]
    ReceiverCredentialExpired,

    #[msg("Share token mint does not match this vault")]
    WrongShareMint,

    #[msg("Credential account is not owned by the oragami-vault program")]
    WrongCredentialProgram,

    #[msg("Credential PDA does not match expected derivation")]
    InvalidCredentialPda,

    #[msg("Travel Rule data required for this deposit")]
    TravelRuleRequired,

    #[msg("Travel Rule data does not match this deposit")]
    InvalidTravelRule,

    #[msg("Travel Rule data already consumed")]
    TravelRuleAlreadyConsumed,
}
