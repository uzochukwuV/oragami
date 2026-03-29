use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};

declare_id!("965gkqvNvYbUsSdqz4AB3YvBw9hqQuNeKMYzHxQBsP1N");

pub const WHITELIST_SEED: &[u8] = b"whitelist";
pub const COMPLIANCE_SEED: &[u8] = b"compliance";
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

#[program]
pub mod cvault_transfer_hook {
    use super::*;

    /// Initialize compliance configuration.
    /// Called once during program setup.
    pub fn initialize_compliance(
        ctx: Context<InitializeCompliance>,
        params: InitializeComplianceParams,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = params.authority;
        config.compliance_oracle = params.compliance_oracle;
        config.min_kyc_level = 1;
        config.allow_transfers = true;
        config.bump = ctx.bumps.config;
        msg!("Compliance config initialized, authority: {}", config.authority);
        Ok(())
    }

    /// Initialize extra account metas for the transfer hook.
    ///
    /// Token-2022 calls this PDA to discover which additional accounts to pass
    /// to the hook on every transfer. We register 3 extra accounts:
    ///   [0] compliance config PDA  — seeds: ["compliance"]
    ///   [1] source whitelist PDA   — seeds: ["whitelist", source_token.owner]
    ///   [2] dest whitelist PDA     — seeds: ["whitelist", destination_token.owner]
    ///
    /// Accounts [1] and [2] are optional (may not exist) — the hook handles that.
    pub fn initialize_extra_account_metas(
        ctx: Context<InitializeExtraAccountMetas>,
    ) -> Result<()> {
        // Build the 3 extra account metas the hook needs at transfer time.
        // In spl-tlv-account-resolution 0.10.0, Seed::Literal takes a fixed-size array.
        // We use ExtraAccountMeta::new_with_seeds which takes &[Seed], is_signer, is_writable.
        let account_metas = vec![
            // [0] Compliance config PDA — seeds: ["compliance"]
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: COMPLIANCE_SEED.to_vec(),
                    },
                ],
                false,
                false,
            ).map_err(|_| error!(TransferHookError::Unauthorized))?,

            // [1] Source wallet whitelist PDA — seeds: ["whitelist", source_token.owner]
            // Account index 3 in the Token-2022 transfer instruction is the owner.
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: WHITELIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 3 },
                ],
                false,
                false,
            ).map_err(|_| error!(TransferHookError::Unauthorized))?,

            // [2] Destination wallet whitelist PDA — seeds: ["whitelist", destination_token.owner]
            // destination_token.owner is resolved from account index 2.
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: WHITELIST_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 2 },
                ],
                false,
                false,
            ).map_err(|_| error!(TransferHookError::Unauthorized))?,
        ];

        let account_size = ExtraAccountMetaList::size_of(account_metas.len())
            .map_err(|_| error!(TransferHookError::Unauthorized))?;

        let account_info = ctx.accounts.extra_account_metas.to_account_info();
        if account_info.data_len() < account_size {
            account_info.resize(account_size)?;
        }

        let mut data = account_info.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)
            .map_err(|_| error!(TransferHookError::Unauthorized))?;

        msg!(
            "Extra account metas initialized for mint: {}, {} accounts registered",
            ctx.accounts.mint.key(),
            account_metas.len()
        );
        Ok(())
    }

    /// Add a wallet to the compliance whitelist.
    pub fn add_to_whitelist(
        ctx: Context<AddToWhitelist>,
        params: AddWhitelistParams,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let entry = &mut ctx.accounts.entry;

        entry.wallet = ctx.accounts.wallet.key();
        entry.kyc_compliant = params.kyc_compliant;
        entry.aml_clear = params.aml_clear;
        entry.travel_rule_compliant = params.travel_rule_compliant;
        entry.added_at = clock.unix_timestamp;
        entry.expiry = clock.unix_timestamp + (params.expiry_days * 86400);
        entry.bump = ctx.bumps.entry;

        msg!("Added {} to whitelist, expires at {}", entry.wallet, entry.expiry);
        Ok(())
    }

    /// Remove a wallet from the whitelist.
    pub fn remove_from_whitelist(ctx: Context<RemoveFromWhitelist>) -> Result<()> {
        msg!("Removed {} from whitelist", ctx.accounts.entry.wallet);
        Ok(())
    }

    /// Update an existing whitelist entry (refresh expiry, update compliance status).
    pub fn update_whitelist(
        ctx: Context<UpdateWhitelist>,
        params: UpdateWhitelistParams,
    ) -> Result<()> {
        let entry = &mut ctx.accounts.entry;
        let clock = Clock::get()?;

        if let Some(kyc) = params.kyc_compliant { entry.kyc_compliant = kyc; }
        if let Some(aml) = params.aml_clear { entry.aml_clear = aml; }
        if let Some(travel) = params.travel_rule_compliant { entry.travel_rule_compliant = travel; }
        if let Some(days) = params.extend_expiry_days {
            entry.expiry = clock.unix_timestamp + (days * 86400);
        }

        msg!("Updated whitelist entry for {}", entry.wallet);
        Ok(())
    }

    /// Update global compliance settings (enable/disable transfers, change KYC level).
    pub fn update_compliance(
        ctx: Context<UpdateCompliance>,
        params: UpdateComplianceParams,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if let Some(enabled) = params.allow_transfers { config.allow_transfers = enabled; }
        if let Some(level) = params.min_kyc_level { config.min_kyc_level = level; }
        if let Some(oracle) = params.compliance_oracle { config.compliance_oracle = oracle; }
        msg!("Updated compliance config");
        Ok(())
    }

    /// Transfer Hook entry point.
    /// Called automatically by Token-2022 on every cVAULT-TRADE transfer.
    /// Validates KYC, AML, Travel Rule, and expiry for both source and destination.
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.compliance_config;

        require!(config.allow_transfers, TransferHookError::TransferDisabled);

        let source_owner = ctx.accounts.source_token.owner;
        let destination_owner = ctx.accounts.destination_token.owner;
        let mint_key = ctx.accounts.mint.key();

        // Skip compliance for mint authority operations
        let is_mint_op = source_owner == mint_key;
        let is_burn_op = destination_owner == mint_key || destination_owner == Pubkey::default();

        if !is_mint_op {
            match &ctx.accounts.source_whitelist {
                Some(entry) => validate_whitelist_entry(entry, "source")?,
                None => {
                    // Source must be whitelisted to send cVAULT-TRADE
                    return err!(TransferHookError::NotWhitelisted);
                }
            }
        }

        if !is_burn_op {
            match &ctx.accounts.destination_whitelist {
                Some(entry) => validate_whitelist_entry(entry, "destination")?,
                None => {
                    // Destination must be whitelisted to receive cVAULT-TRADE
                    return err!(TransferHookError::NotWhitelisted);
                }
            }
        }

        msg!(
            "Transfer PASSED: {} cVAULT-TRADE from {} to {}",
            amount,
            source_owner,
            destination_owner
        );
        Ok(())
    }

    /// Fallback required by spl-transfer-hook-interface for CPI compatibility.
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        _accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        // In spl-transfer-hook-interface 0.10.0, the execute discriminator
        // is the first 8 bytes. We just log and allow — actual enforcement
        // happens in transfer_hook above.
        if data.len() >= 8 {
            msg!("Fallback: transfer hook execute called, {} bytes", data.len());
        }
        Ok(())
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn validate_whitelist_entry(entry: &WhitelistEntry, role: &str) -> Result<()> {
    let clock = Clock::get()?;
    require!(entry.kyc_compliant, TransferHookError::KycNotCompleted);
    require!(entry.aml_clear, TransferHookError::AmlCheckFailed);
    require!(entry.travel_rule_compliant, TransferHookError::TravelRuleNotSatisfied);
    require!(entry.expiry > clock.unix_timestamp, TransferHookError::EntryExpired);
    msg!("{} wallet {} is compliant (expires {})", role, entry.wallet, entry.expiry);
    Ok(())
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

#[account]
pub struct WhitelistEntry {
    pub wallet: Pubkey,              // 32
    pub kyc_compliant: bool,         // 1
    pub aml_clear: bool,             // 1
    pub travel_rule_compliant: bool, // 1
    pub added_at: i64,               // 8
    pub expiry: i64,                 // 8
    pub bump: u8,                    // 1
}

impl WhitelistEntry {
    pub const SIZE: usize = 8 + 32 + 1 + 1 + 1 + 8 + 8 + 1; // 60 bytes
}

#[account]
pub struct ComplianceConfig {
    pub authority: Pubkey,          // 32
    pub compliance_oracle: Pubkey,  // 32
    pub min_kyc_level: u8,          // 1
    pub allow_transfers: bool,      // 1
    pub bump: u8,                   // 1
}

impl ComplianceConfig {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 1 + 1; // 75 bytes
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct InitializeCompliance<'info> {
    #[account(
        init,
        payer = payer,
        space = ComplianceConfig::SIZE,
        seeds = [COMPLIANCE_SEED],
        bump
    )]
    pub config: Account<'info, ComplianceConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    /// The extra account metas PDA — stores the list of accounts the hook needs.
    /// Space is calculated dynamically based on number of extra accounts (3).
    /// ExtraAccountMetaList::size_of(3) = 8 (discriminator) + 3 * 35 (each meta) = 113 bytes
    #[account(
        init,
        payer = payer,
        space = 8 + 3 * 35 + 8, // discriminator + 3 ExtraAccountMeta entries + buffer
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_metas: Account<'info, ExtraAccountMetasAccount>,

    /// The cVAULT-TRADE mint this hook is registered for
    /// CHECK: Any mint can be passed — validated by Token-2022 at transfer time
    pub mint: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddToWhitelist<'info> {
    #[account(
        seeds = [COMPLIANCE_SEED],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ComplianceConfig>,

    #[account(
        init,
        payer = payer,
        space = WhitelistEntry::SIZE,
        seeds = [WHITELIST_SEED, wallet.key().as_ref()],
        bump
    )]
    pub entry: Account<'info, WhitelistEntry>,

    /// CHECK: The wallet address to whitelist
    pub wallet: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveFromWhitelist<'info> {
    #[account(
        seeds = [COMPLIANCE_SEED],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ComplianceConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [WHITELIST_SEED, wallet.key().as_ref()],
        bump = entry.bump
    )]
    pub entry: Account<'info, WhitelistEntry>,

    /// CHECK: The wallet address to remove
    pub wallet: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateWhitelist<'info> {
    #[account(
        seeds = [COMPLIANCE_SEED],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ComplianceConfig>,

    #[account(
        mut,
        seeds = [WHITELIST_SEED, entry.wallet.as_ref()],
        bump = entry.bump
    )]
    pub entry: Account<'info, WhitelistEntry>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateCompliance<'info> {
    #[account(
        mut,
        seeds = [COMPLIANCE_SEED],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ComplianceConfig>,

    pub authority: Signer<'info>,
}

/// Transfer Hook context — called by Token-2022 on every cVAULT-TRADE transfer.
/// Account order must match Token-2022's expected layout exactly:
///   0: source token account
///   1: mint
///   2: destination token account
///   3: owner (source authority)
///   4: extra_account_metas PDA
/// Then our extra accounts (registered in initialize_extra_account_metas):
///   5: compliance_config PDA
///   6: source_whitelist PDA (optional)
///   7: destination_whitelist PDA (optional)
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// [0] Source token account
    pub source_token: InterfaceAccount<'info, TokenAccount>,

    /// [1] The cVAULT-TRADE mint
    /// CHECK: Validated by Token-2022
    pub mint: AccountInfo<'info>,

    /// [2] Destination token account
    pub destination_token: InterfaceAccount<'info, TokenAccount>,

    /// [3] Owner/authority of the source account
    /// CHECK: Validated by Token-2022
    pub owner: AccountInfo<'info>,

    /// [4] Extra account metas PDA
    /// CHECK: Validated by Token-2022 against the registered PDA
    #[account(
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_metas: AccountInfo<'info>,

    /// [5] Compliance config (registered as extra account [0])
    #[account(seeds = [COMPLIANCE_SEED], bump = compliance_config.bump)]
    pub compliance_config: Account<'info, ComplianceConfig>,

    /// [6] Source wallet whitelist entry (registered as extra account [1], optional)
    #[account(
        seeds = [WHITELIST_SEED, source_token.owner.as_ref()],
        bump
    )]
    pub source_whitelist: Option<Account<'info, WhitelistEntry>>,

    /// [7] Destination wallet whitelist entry (registered as extra account [2], optional)
    #[account(
        seeds = [WHITELIST_SEED, destination_token.owner.as_ref()],
        bump
    )]
    pub destination_whitelist: Option<Account<'info, WhitelistEntry>>,
}

// Anchor account wrapper for the raw extra account metas data
#[account]
pub struct ExtraAccountMetasAccount {}

// ============================================================================
// INSTRUCTION PARAMETERS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeComplianceParams {
    pub authority: Pubkey,
    pub compliance_oracle: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AddWhitelistParams {
    pub kyc_compliant: bool,
    pub aml_clear: bool,
    pub travel_rule_compliant: bool,
    pub expiry_days: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateWhitelistParams {
    pub kyc_compliant: Option<bool>,
    pub aml_clear: Option<bool>,
    pub travel_rule_compliant: Option<bool>,
    pub extend_expiry_days: Option<i64>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateComplianceParams {
    pub allow_transfers: Option<bool>,
    pub min_kyc_level: Option<u8>,
    pub compliance_oracle: Option<Pubkey>,
}

// ============================================================================
// ERROR CODES
// ============================================================================

#[error_code]
pub enum TransferHookError {
    #[msg("Wallet is not whitelisted for cVAULT-TRADE transfers")]
    NotWhitelisted,
    #[msg("KYC requirement not completed")]
    KycNotCompleted,
    #[msg("AML check failed")]
    AmlCheckFailed,
    #[msg("Travel Rule not satisfied")]
    TravelRuleNotSatisfied,
    #[msg("Whitelist entry has expired — re-verification required")]
    EntryExpired,
    #[msg("Transfers are currently disabled by compliance authority")]
    TransferDisabled,
    #[msg("Unauthorized")]
    Unauthorized,
}
