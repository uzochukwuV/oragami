use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, TokenAccount, Token};

declare_id!("ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP");

// ============================================================================
// SEEDS
// ============================================================================

pub const CVAULT_MINT_SEED: &[u8] = b"cvault_mint";
pub const VAULT_STATE_SEED: &[u8] = b"vault_state";
pub const VAULT_TOKEN_SEED: &[u8] = b"vault_token_account";
pub const COMPLIANCE_CREDENTIAL_SEED: &[u8] = b"credential";
pub const TRAVEL_RULE_SEED: &[u8] = b"travel_rule";
pub const VAULT_USX_ACCOUNT_SEED: &[u8] = b"vault_usx_account";
pub const VAULT_EUSX_ACCOUNT_SEED: &[u8] = b"vault_eusx_account";

// ============================================================================
// CONSTANTS
// ============================================================================

/// NAV stored as basis points relative to 1 USDC.
/// 10000 = $1.0000 | 10430 = $1.0430
pub const NAV_BPS_DENOMINATOR: u64 = 10_000;

/// Minimum deposit requiring Travel Rule compliance (1000 USDC, 6 decimals)
pub const TRAVEL_RULE_THRESHOLD: u64 = 1_000_000_000;

/// Seconds in a day
pub const SECONDS_IN_DAY: u64 = 24 * 60 * 60;

/// Compliance credential status codes
pub const CREDENTIAL_STATUS_PENDING: u8 = 0;
pub const CREDENTIAL_STATUS_ACTIVE: u8 = 1;
pub const CREDENTIAL_STATUS_RESTRICTED: u8 = 2;
pub const CREDENTIAL_STATUS_REVOKED: u8 = 3;

// ============================================================================
// PROGRAM
// ============================================================================

#[program]
pub mod oragami_vault {
    use super::*;

    // -----------------------------------------------------------------------
    // VAULT INITIALIZATION
    // -----------------------------------------------------------------------

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        params: InitializeVaultParams,
    ) -> Result<()> {
        let vs = &mut ctx.accounts.vault_state;
        vs.bump = ctx.bumps.vault_state;
        vs.cvault_mint = ctx.accounts.cvault_mint.key();
        vs.cvault_trade_mint = params.cvault_trade_mint;
        vs.vault_token_account = ctx.accounts.token_account.key();
        vs.treasury = params.treasury;
        vs.authority = params.authority;
        vs.min_deposit = params.min_deposit;
        vs.max_deposit = params.max_deposit;
        vs.usx_allocation_bps = params.usx_allocation_bps;
        vs.apy_bps = params.apy_bps;
        vs.paused = false;
        vs.total_deposits = 0;
        vs.total_supply = 0;
        vs.pending_yield = 0;
        vs.last_yield_claim = Clock::get()?.unix_timestamp;
        vs.secondary_market_enabled = params.secondary_market_enabled;
        vs.nav_price_bps = NAV_BPS_DENOMINATOR; // 1:1 at launch
        // USX accounts set via register_usx_accounts after initialization
        vs.usx_mint = Pubkey::default();
        vs.eusx_mint = Pubkey::default();
        vs.vault_usx_account = Pubkey::default();
        vs.vault_eusx_account = Pubkey::default();
        msg!(
            "Vault initialized. NAV: {} bps. APY: {} bps. USX alloc: {} bps.",
            vs.nav_price_bps,
            vs.apy_bps,
            vs.usx_allocation_bps
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // NAV MANAGEMENT
    // -----------------------------------------------------------------------

    /// Called by authority after each SIX price feed update.
    /// nav_price_bps: 10430 means 1 cVAULT = $1.0430 USDC.
    /// Hard-capped: max 50% change per update to prevent manipulation.
    pub fn set_nav(ctx: Context<SetNav>, params: SetNavParams) -> Result<()> {
        require!(params.nav_price_bps > 0, ErrorCode::InvalidNav);
        let current = ctx.accounts.vault_state.nav_price_bps;
        let max_change = current / 2;
        require!(
            params.nav_price_bps >= current.saturating_sub(max_change)
                && params.nav_price_bps <= current + max_change,
            ErrorCode::NavChangeTooLarge
        );
        ctx.accounts.vault_state.nav_price_bps = params.nav_price_bps;
        emit!(NavUpdated {
            nav_price_bps: params.nav_price_bps,
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!(
            "NAV updated to {} bps (${}.{:04})",
            params.nav_price_bps,
            params.nav_price_bps / NAV_BPS_DENOMINATOR,
            params.nav_price_bps % NAV_BPS_DENOMINATOR
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // COMPLIANCE CREDENTIAL INSTRUCTIONS
    // -----------------------------------------------------------------------

    /// Issue a soulbound compliance credential for an institution wallet.
    /// Only the vault authority may call this.
    /// Seeds: ["credential", wallet] — one per institution, non-transferable.
    pub fn issue_credential(
        ctx: Context<IssueCredential>,
        params: IssueCredentialParams,
    ) -> Result<()> {
        require!(
            params.expires_at > params.issued_at,
            ErrorCode::InvalidCredential
        );
        let cred = &mut ctx.accounts.credential;
        cred.bump = ctx.bumps.credential;
        cred.wallet = params.wallet;
        cred.institution_name = params.institution_name;
        cred.jurisdiction = params.jurisdiction;
        cred.tier = params.tier;
        cred.kyc_level = params.kyc_level;
        cred.aml_coverage = params.aml_coverage;
        cred.attestation_hash = params.attestation_hash;
        cred.issued_at = params.issued_at;
        cred.expires_at = params.expires_at;
        cred.status = CREDENTIAL_STATUS_ACTIVE;
        msg!(
            "Credential issued for wallet {} (tier={}, kyc={}, jurisdiction={:?})",
            params.wallet,
            params.tier,
            params.kyc_level,
            params.jurisdiction
        );
        Ok(())
    }

    /// Revoke a compliance credential. Only authority may call.
    /// Sets status to Revoked; the account remains on-chain as an audit record.
    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        let cred = &mut ctx.accounts.credential;
        require!(
            cred.status != CREDENTIAL_STATUS_REVOKED,
            ErrorCode::InvalidCredential
        );
        cred.status = CREDENTIAL_STATUS_REVOKED;
        msg!("Credential revoked for wallet: {}", cred.wallet);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // DEPOSIT (with credential gate + travel-rule gate)
    // -----------------------------------------------------------------------

    /// Deposit USDC into the vault. Mints cVAULT at current NAV.
    ///
    /// On-chain compliance gates (executed in order):
    ///   1. Credential must exist, be Active, and not expired.
    ///   2. If amount >= TRAVEL_RULE_THRESHOLD, a TravelRuleData PDA must be
    ///      supplied (pre-initialised by the caller via init_travel_rule).
    ///   3. Vault must not be paused, deposit within min/max bounds.
    pub fn deposit(ctx: Context<Deposit>, params: DepositParams) -> Result<()> {
        // --- Vault guards ---
        require!(!ctx.accounts.vault_state.paused, ErrorCode::VaultPaused);
        require!(
            params.amount >= ctx.accounts.vault_state.min_deposit,
            ErrorCode::DepositTooSmall
        );
        require!(
            params.amount <= ctx.accounts.vault_state.max_deposit,
            ErrorCode::DepositTooLarge
        );

        // --- Credential gate ---
        let cred = &ctx.accounts.investor_credential;
        let now = Clock::get()?.unix_timestamp;
        require!(
            cred.status == CREDENTIAL_STATUS_ACTIVE,
            ErrorCode::ComplianceCheckFailed
        );
        require!(cred.expires_at > now, ErrorCode::CredentialExpired);
        // Ensure the credential belongs to this depositor
        require!(
            cred.wallet == ctx.accounts.payer.key(),
            ErrorCode::ComplianceCheckFailed
        );

        // --- Travel Rule gate ---
        if params.amount >= TRAVEL_RULE_THRESHOLD {
            let tr = ctx.accounts
                .travel_rule_data
                .as_ref()
                .ok_or(ErrorCode::TravelRuleRequired)?;
            // Verify the travel rule record covers this exact deposit amount
            require!(tr.amount == params.amount, ErrorCode::InvalidTravelRule);
            // Verify the payer matches the travel rule originator
            require!(tr.payer == ctx.accounts.payer.key(), ErrorCode::InvalidTravelRule);
        }

        // --- USDC transfer user → vault ---
        let nav = ctx.accounts.vault_state.nav_price_bps;
        let token_program = ctx.accounts.token_program.to_account_info();

        let transfer_cpi = CpiContext::new(
            token_program.clone(),
            token::Transfer {
                from: ctx.accounts.payer_deposit_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        token::transfer(transfer_cpi, params.amount)?;

        // --- Mint cVAULT at NAV ---
        // cvault = usdc * 10000 / nav_bps   (floor division)
        let cvault_amount = params
            .amount
            .checked_mul(NAV_BPS_DENOMINATOR)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(nav)
            .ok_or(ErrorCode::Overflow)?;
        require!(cvault_amount > 0, ErrorCode::DepositTooSmall);

        let seeds = &[VAULT_STATE_SEED, &[ctx.accounts.vault_state.bump]];
        let signer = &[seeds.as_ref()];
        let mint_cpi = CpiContext::new_with_signer(
            token_program.clone(),
            token::MintTo {
                mint: ctx.accounts.cvault_mint.to_account_info(),
                to: ctx.accounts.payer_cvault_account.to_account_info(),
                authority: ctx.accounts.vault_state.to_account_info(),
            },
            signer,
        );
        token::mint_to(mint_cpi, cvault_amount)?;

        // --- State update ---
        let vs = &mut ctx.accounts.vault_state;
        vs.total_deposits = vs
            .total_deposits
            .checked_add(params.amount)
            .ok_or(ErrorCode::Overflow)?;
        vs.total_supply = vs
            .total_supply
            .checked_add(cvault_amount)
            .ok_or(ErrorCode::Overflow)?;

        emit!(DepositMade {
            payer: ctx.accounts.payer.key(),
            usdc_amount: params.amount,
            cvault_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!(
            "Deposit: {} USDC at NAV {} bps -> {} cVAULT (payer: {})",
            params.amount,
            nav,
            cvault_amount,
            ctx.accounts.payer.key()
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // TRAVEL RULE — PRE-DEPOSIT INITIALISATION
    // -----------------------------------------------------------------------

    /// Initialise a TravelRuleData PDA before a large deposit.
    /// Seeds: ["travel_rule", payer, nonce_hash]
    /// The caller supplies off-chain KYC/AML data for the deposit.
    /// Must be called before deposit() when amount >= TRAVEL_RULE_THRESHOLD.
    pub fn init_travel_rule(
        ctx: Context<InitTravelRule>,
        params: InitializeTravelRuleParams,
    ) -> Result<()> {
        require!(
            params.amount >= TRAVEL_RULE_THRESHOLD,
            ErrorCode::InvalidTravelRule
        );
        let tr = &mut ctx.accounts.travel_rule_data;
        tr.bump = ctx.bumps.travel_rule_data;
        tr.originator_name = params.originator_name;
        tr.originator_account = params.originator_account;
        tr.beneficiary_name = params.beneficiary_name;
        tr.compliance_hash = params.compliance_hash;
        tr.amount = params.amount;
        tr.submitted_at = Clock::get()?.unix_timestamp;
        tr.payer = ctx.accounts.payer.key();
        msg!(
            "Travel Rule data submitted for {} USDC (payer: {})",
            params.amount,
            ctx.accounts.payer.key()
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // REDEEM
    // -----------------------------------------------------------------------

    /// Burn cVAULT, receive USDC at current NAV.
    /// No credential check on redemption — institutions may exit any time.
    pub fn redeem(ctx: Context<Redeem>, params: RedeemParams) -> Result<()> {
        require!(!ctx.accounts.vault_state.paused, ErrorCode::VaultPaused);

        let nav = ctx.accounts.vault_state.nav_price_bps;
        // usdc = cvault * nav / 10000  (floor division)
        let usdc_amount = params
            .cvault_amount
            .checked_mul(nav)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(NAV_BPS_DENOMINATOR)
            .ok_or(ErrorCode::Overflow)?;

        require!(
            ctx.accounts.vault_token_account.amount >= usdc_amount,
            ErrorCode::InsufficientVaultFunds
        );

        let token_program = ctx.accounts.token_program.to_account_info();

        // Burn cVAULT
        let burn_cpi = CpiContext::new(
            token_program.clone(),
            token::Burn {
                mint: ctx.accounts.cvault_mint.to_account_info(),
                from: ctx.accounts.redeemer_cvault_account.to_account_info(),
                authority: ctx.accounts.redeemer.to_account_info(),
            },
        );
        token::burn(burn_cpi, params.cvault_amount)?;

        // Return USDC
        let seeds = &[VAULT_STATE_SEED, &[ctx.accounts.vault_state.bump]];
        let signer = &[seeds.as_ref()];
        let transfer_cpi = CpiContext::new_with_signer(
            token_program.clone(),
            token::Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.redeemer_deposit_account.to_account_info(),
                authority: ctx.accounts.vault_state.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_cpi, usdc_amount)?;

        let vs = &mut ctx.accounts.vault_state;
        vs.total_deposits = vs.total_deposits.saturating_sub(usdc_amount);
        vs.total_supply = vs
            .total_supply
            .checked_sub(params.cvault_amount)
            .ok_or(ErrorCode::Overflow)?;

        msg!(
            "Redeem: {} cVAULT at NAV {} bps → {} USDC",
            params.cvault_amount,
            nav,
            usdc_amount
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // SECONDARY MARKET (cVAULT ↔ cVAULT-TRADE)
    // -----------------------------------------------------------------------

    pub fn convert_to_tradeable(
        ctx: Context<ConvertToTradeable>,
        params: ConvertToTradeableParams,
    ) -> Result<()> {
        require!(!ctx.accounts.vault_state.paused, ErrorCode::VaultPaused);
        require!(
            ctx.accounts.vault_state.secondary_market_enabled,
            ErrorCode::SecondaryMarketDisabled
        );

        let token_program = ctx.accounts.token_program.to_account_info();

        let burn_cpi = CpiContext::new(
            token_program.clone(),
            token::Burn {
                mint: ctx.accounts.cvault_mint.to_account_info(),
                from: ctx.accounts.user_cvault_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::burn(burn_cpi, params.amount)?;

        let seeds = &[VAULT_STATE_SEED, &[ctx.accounts.vault_state.bump]];
        let signer = &[seeds.as_ref()];
        let mint_cpi = CpiContext::new_with_signer(
            token_program.clone(),
            token::MintTo {
                mint: ctx.accounts.cvault_trade_mint.to_account_info(),
                to: ctx.accounts.user_cvault_trade_account.to_account_info(),
                authority: ctx.accounts.vault_state.to_account_info(),
            },
            signer,
        );
        token::mint_to(mint_cpi, params.amount)?;

        msg!("Converted {} cVAULT → cVAULT-TRADE", params.amount);
        Ok(())
    }

    pub fn redeem_tradeable(
        ctx: Context<RedeemTradeable>,
        params: RedeemTradeableParams,
    ) -> Result<()> {
        require!(!ctx.accounts.vault_state.paused, ErrorCode::VaultPaused);

        let nav = ctx.accounts.vault_state.nav_price_bps;
        let token_program = ctx.accounts.token_program.to_account_info();

        // Burn cVAULT-TRADE
        let burn_cpi = CpiContext::new(
            token_program.clone(),
            token::Burn {
                mint: ctx.accounts.cvault_trade_mint.to_account_info(),
                from: ctx.accounts.user_cvault_trade_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::burn(burn_cpi, params.amount)?;

        let seeds = &[VAULT_STATE_SEED, &[ctx.accounts.vault_state.bump]];
        let signer = &[seeds.as_ref()];

        if params.redeem_to_cvault {
            // Re-wrap 1:1 back to cVAULT
            let mint_cpi = CpiContext::new_with_signer(
                token_program.clone(),
                token::MintTo {
                    mint: ctx.accounts.cvault_mint.to_account_info(),
                    to: ctx.accounts.user_cvault_account.to_account_info(),
                    authority: ctx.accounts.vault_state.to_account_info(),
                },
                signer,
            );
            token::mint_to(mint_cpi, params.amount)?;
            // total_supply: trade tokens removed, cvault tokens added → net zero.
            // No change to total_supply needed.
            msg!("Re-wrapped {} cVAULT-TRADE → cVAULT", params.amount);
        } else {
            // Redeem for USDC at NAV
            let usdc_amount = params
                .amount
                .checked_mul(nav)
                .ok_or(ErrorCode::Overflow)?
                .checked_div(NAV_BPS_DENOMINATOR)
                .ok_or(ErrorCode::Overflow)?;

            require!(
                ctx.accounts.vault_token_account.amount >= usdc_amount,
                ErrorCode::InsufficientVaultFunds
            );

            let transfer_cpi = CpiContext::new_with_signer(
                token_program.clone(),
                token::Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.user_destination.to_account_info(),
                    authority: ctx.accounts.vault_state.to_account_info(),
                },
                signer,
            );
            token::transfer(transfer_cpi, usdc_amount)?;

            let vs = &mut ctx.accounts.vault_state;
            vs.total_deposits = vs
                .total_deposits
                .checked_sub(usdc_amount)
                .ok_or(ErrorCode::Overflow)?;
            vs.total_supply = vs
                .total_supply
                .checked_sub(params.amount)
                .ok_or(ErrorCode::Overflow)?;

            msg!(
                "Redeemed {} cVAULT-TRADE → {} USDC at NAV {} bps",
                params.amount,
                usdc_amount,
                nav
            );
        }

        Ok(())
    }

    // -----------------------------------------------------------------------
    // YIELD — ON-CHAIN ACCRUAL
    // -----------------------------------------------------------------------

    /// Called daily by the backend crank.
    /// Accumulates yield into vault_state.pending_yield.
    ///
    /// Formula:
    ///   daily_yield = total_deposits
    ///                 * usx_allocation_bps / 10000
    ///                 * apy_bps           / 10000
    ///                 / 365
    ///   accrued     = daily_yield * days_elapsed
    ///
    /// Only the vault authority may call this.
    /// No-ops if < 1 day has elapsed since last call.
    pub fn process_yield(ctx: Context<ProcessYield>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault_state.authority,
            ErrorCode::YieldNotAuthorized
        );
        let vs = &mut ctx.accounts.vault_state;
        let now = Clock::get()?.unix_timestamp;

        let days_elapsed = if now > vs.last_yield_claim {
            ((now - vs.last_yield_claim) as u64) / SECONDS_IN_DAY
        } else {
            0
        };

        if days_elapsed == 0 {
            msg!("process_yield: no full day elapsed, skipping.");
            return Ok(());
        }

        // daily_yield = total_deposits * usx_alloc/10000 * apy/10000 / 365
        let daily_yield = vs
            .total_deposits
            .checked_mul(vs.usx_allocation_bps as u64)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::Overflow)?
            .checked_mul(vs.apy_bps as u64)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(365)
            .ok_or(ErrorCode::Overflow)?;

        let accrued = daily_yield
            .checked_mul(days_elapsed)
            .ok_or(ErrorCode::Overflow)?;

        vs.pending_yield = vs
            .pending_yield
            .checked_add(accrued)
            .ok_or(ErrorCode::Overflow)?;
        // Advance by exactly the days processed so sub-day remainder carries forward.
        vs.last_yield_claim = vs.last_yield_claim
            + (days_elapsed as i64) * (SECONDS_IN_DAY as i64);

        msg!(
            "process_yield: {} days elapsed | daily_yield={} | accrued={} | pending_yield={}",
            days_elapsed,
            daily_yield,
            accrued,
            vs.pending_yield
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // REGISTER USX ACCOUNTS (authority-only, called once after initialize_vault)
    // -----------------------------------------------------------------------

    /// Register the real Solstice devnet USX/eUSX mint addresses and vault ATAs.
    /// Called once by the authority after initialize_vault.
    /// Devnet addresses:
    ///   USX:  7QC4zjrKA6XygpXPQCKSS9BmAsEFDJR6awiHSdgLcDvS
    ///   eUSX: Gkt9h4QWpPBDtbaF5HvYKCc87H5WCRTUtMf77HdTGHBt
    pub fn register_usx_accounts(
        ctx: Context<RegisterUsxAccounts>,
        params: RegisterUsxAccountsParams,
    ) -> Result<()> {
        let vs = &mut ctx.accounts.vault_state;
        vs.usx_mint = params.usx_mint;
        vs.eusx_mint = params.eusx_mint;
        vs.vault_usx_account = params.vault_usx_account;
        vs.vault_eusx_account = params.vault_eusx_account;
        msg!(
            "USX accounts registered. USX={} eUSX={}",
            params.usx_mint,
            params.eusx_mint
        );
        Ok(())
    }

    /// Distribute accrued yield.
    /// Resets pending_yield to zero and emits YieldDistributed event.
    /// The actual Solstice CPI (USDC → USX → eUSX) is executed off-chain
    /// by the backend crank using the Solstice instructions API, then
    /// this instruction is called to record the distribution on-chain.
    pub fn distribute_yield(ctx: Context<DistributeYield>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault_state.authority,
            ErrorCode::YieldNotAuthorized
        );

        let vs = &mut ctx.accounts.vault_state;

        if vs.pending_yield == 0 {
            msg!("distribute_yield: no pending yield.");
            return Ok(());
        }

        let yield_amount = vs.pending_yield;
        vs.pending_yield = 0;
        vs.last_yield_claim = Clock::get()?.unix_timestamp;

        emit!(YieldDistributed {
            usdc_yield: yield_amount,
            timestamp: vs.last_yield_claim,
        });

        msg!("distribute_yield: {} USDC yield distributed", yield_amount);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // ADMIN
    // -----------------------------------------------------------------------

    pub fn set_pause(ctx: Context<SetPause>, params: SetPauseParams) -> Result<()> {
        ctx.accounts.vault_state.paused = params.paused;
        msg!("Vault paused: {}", params.paused);
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        params: UpdateConfigParams,
    ) -> Result<()> {
        let vs = &mut ctx.accounts.vault_state;
        if let Some(m) = params.min_deposit {
            vs.min_deposit = m;
        }
        if let Some(m) = params.max_deposit {
            vs.max_deposit = m;
        }
        if let Some(b) = params.usx_allocation_bps {
            require!(b <= 10_000, ErrorCode::InvalidAllocation);
            vs.usx_allocation_bps = b;
        }
        if let Some(a) = params.apy_bps {
            vs.apy_bps = a;
        }
        if let Some(enabled) = params.secondary_market_enabled {
            vs.secondary_market_enabled = enabled;
        }
        msg!("Config updated");
        Ok(())
    }

    /// Legacy yield-sync stub kept for backward compatibility with
    /// existing clients. Simply refreshes the timestamp.
    pub fn sync_yield(ctx: Context<SyncYield>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.vault_state.authority,
            ErrorCode::YieldNotAuthorized
        );
        ctx.accounts.vault_state.last_yield_claim = Clock::get()?.unix_timestamp;
        msg!(
            "Yield state synced at {}",
            ctx.accounts.vault_state.last_yield_claim
        );
        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

/// Central vault state. Single PDA: seeds = ["vault_state"].
///
/// SIZE breakdown (8 discriminator + fields):
///   1 bump + 32*5 (mints/accounts/keys) + 8*2 (min/max dep) +
///   2 (usx_alloc_bps) + 2 (apy_bps) + 1 (paused) + 8*4 (totals/yield/nav) +
///   1 (secondary_mkt) + 32 (mock_usx_mint)
///   = 8 + 1 + 160 + 16 + 2 + 2 + 1 + 32 + 1 + 8 + 32 = 265
#[account]
pub struct VaultState {
    pub bump: u8,                       // 1
    pub cvault_mint: Pubkey,            // 32
    pub cvault_trade_mint: Pubkey,      // 32
    pub vault_token_account: Pubkey,    // 32
    pub treasury: Pubkey,               // 32
    pub authority: Pubkey,              // 32
    pub min_deposit: u64,               // 8
    pub max_deposit: u64,               // 8
    pub usx_allocation_bps: u16,        // 2   — e.g. 8000 = 80% to USX/SIX
    pub apy_bps: u16,                   // 2   — e.g. 500 = 5.00% APY
    pub paused: bool,                   // 1
    pub total_deposits: u64,            // 8
    pub total_supply: u64,              // 8
    pub last_yield_claim: i64,          // 8
    pub pending_yield: u64,             // 8   — accrued, not yet distributed
    pub secondary_market_enabled: bool, // 1
    pub nav_price_bps: u64,             // 8   — 10000 = $1.00
    pub usx_mint: Pubkey,               // 32  — real Solstice devnet USX mint
    pub eusx_mint: Pubkey,              // 32  — real Solstice devnet eUSX mint
    pub vault_usx_account: Pubkey,      // 32  — vault's ATA for USX
    pub vault_eusx_account: Pubkey,     // 32  — vault's ATA for eUSX (yield position)
}

impl VaultState {
    // discriminator(8) + bump(1) + cvault_mint(32) + cvault_trade_mint(32)
    // + vault_token_account(32) + treasury(32) + authority(32)
    // + min_deposit(8) + max_deposit(8) + usx_allocation_bps(2) + apy_bps(2)
    // + paused(1) + total_deposits(8) + total_supply(8) + last_yield_claim(8)
    // + pending_yield(8) + secondary_market_enabled(1) + nav_price_bps(8)
    // + usx_mint(32) + eusx_mint(32) + vault_usx_account(32) + vault_eusx_account(32)
    // = 8+1+32+32+32+32+32+8+8+2+2+1+8+8+8+8+1+8+32+32+32+32 = 391
    pub const SIZE: usize = 8 + 1 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 1 + 8 + 8 + 8 + 8 + 1 + 8 + 32 + 32 + 32 + 32;
    // = 391 bytes
}

// -----------------------------------------------------------------------
// COMPLIANCE CREDENTIAL
// -----------------------------------------------------------------------

/// Soulbound on-chain compliance credential.
/// Seeds: ["credential", wallet]  → one PDA per institution wallet.
///
/// All string fields use fixed-size byte arrays (no heap) to keep the
/// account deterministic and cheap to load.
#[account]
pub struct ComplianceCredential {
    pub bump: u8,                     // 1
    pub wallet: Pubkey,               // 32  — the institution wallet this gates
    pub institution_name: [u8; 64],   // 64  — legal entity name (UTF-8, null-padded)
    pub jurisdiction: [u8; 4],        // 4   — ISO 3166 e.g. b"CH\0\0"
    pub tier: u8,                     // 1   — 1=retail 2=professional 3=institutional
    pub kyc_level: u8,                // 1   — 1=basic 2=enhanced 3=full
    pub aml_coverage: u8,             // 1   — 0–100 score
    pub attestation_hash: [u8; 32],   // 32  — SHA-256 of off-chain KYC docs
    pub issued_at: i64,               // 8
    pub expires_at: i64,              // 8
    pub status: u8,                   // 1   — 0=pending 1=active 2=restricted 3=revoked
}

impl ComplianceCredential {
    pub const SIZE: usize = 8 + 1 + 32 + 64 + 4 + 1 + 1 + 1 + 32 + 8 + 8 + 1;
    // = 161 bytes
}

// -----------------------------------------------------------------------
// TRAVEL RULE DATA
// -----------------------------------------------------------------------

/// FATF Travel Rule record for deposits >= 1 000 USDC.
/// Seeds: ["travel_rule", payer, nonce_hash]
/// Created by the depositor *before* calling deposit().
/// The nonce_hash prevents replay attacks across multiple deposits.
#[account]
pub struct TravelRuleData {
    pub bump: u8,                        // 1
    pub payer: Pubkey,                   // 32  — must match deposit payer
    pub originator_name: [u8; 64],       // 64  — full legal name, null-padded
    pub originator_account: [u8; 34],    // 34  — IBAN or account ref, null-padded
    pub beneficiary_name: [u8; 64],      // 64  — beneficiary legal name
    pub compliance_hash: [u8; 32],       // 32  — SHA-256 of full Travel Rule packet
    pub amount: u64,                     // 8   — must == deposit amount
    pub submitted_at: i64,               // 8
}

impl TravelRuleData {
    pub const SIZE: usize = 8 + 1 + 32 + 64 + 34 + 64 + 32 + 8 + 8;
    // = 251 bytes
}

// ============================================================================
// INSTRUCTION CONTEXTS
// ============================================================================

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = payer,
        space = VaultState::SIZE,
        seeds = [VAULT_STATE_SEED],
        bump
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = vault_state,
        seeds = [CVAULT_MINT_SEED],
        bump
    )]
    pub cvault_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        token::mint = deposit_mint,
        token::authority = vault_state,
        seeds = [VAULT_TOKEN_SEED],
        bump
    )]
    pub token_account: Account<'info, TokenAccount>,

    /// USDC mint (or any accepted deposit token)
    pub deposit_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetNav<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(address = vault_state.authority)]
    pub authority: Signer<'info>,
}

// -----------------------------------------------------------------------
// COMPLIANCE CREDENTIAL CONTEXTS
// -----------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(params: IssueCredentialParams)]
pub struct IssueCredential<'info> {
    #[account(
        init,
        payer = authority,
        space = ComplianceCredential::SIZE,
        seeds = [COMPLIANCE_CREDENTIAL_SEED, params.wallet.as_ref()],
        bump
    )]
    pub credential: Account<'info, ComplianceCredential>,

    #[account(seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    /// Only the vault authority may issue credentials
    #[account(mut, address = vault_state.authority)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(
        mut,
        seeds = [COMPLIANCE_CREDENTIAL_SEED, credential.wallet.as_ref()],
        bump = credential.bump
    )]
    pub credential: Account<'info, ComplianceCredential>,

    #[account(seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(address = vault_state.authority)]
    pub authority: Signer<'info>,
}

// -----------------------------------------------------------------------
// TRAVEL RULE CONTEXT
// -----------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(params: InitializeTravelRuleParams)]
pub struct InitTravelRule<'info> {
    #[account(
        init,
        payer = payer,
        space = TravelRuleData::SIZE,
        seeds = [TRAVEL_RULE_SEED, payer.key().as_ref(), &params.nonce_hash],
        bump
    )]
    pub travel_rule_data: Account<'info, TravelRuleData>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// -----------------------------------------------------------------------
// DEPOSIT CONTEXT
// -----------------------------------------------------------------------

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(mut, address = vault_state.cvault_mint)]
    pub cvault_mint: Account<'info, Mint>,

    #[account(mut, seeds = [VAULT_TOKEN_SEED], bump)]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Depositor's USDC token account
    #[account(mut)]
    pub payer_deposit_account: Account<'info, TokenAccount>,

    /// Depositor's cVAULT token account (receives minted tokens)
    #[account(mut)]
    pub payer_cvault_account: Account<'info, TokenAccount>,

    /// On-chain credential PDA for this depositor.
    /// Seeds verified implicitly: ["credential", payer.key()]
    #[account(
        seeds = [COMPLIANCE_CREDENTIAL_SEED, payer.key().as_ref()],
        bump = investor_credential.bump
    )]
    pub investor_credential: Account<'info, ComplianceCredential>,

    /// Optional travel rule PDA — required iff amount >= TRAVEL_RULE_THRESHOLD.
    /// Payer ownership and amount integrity are verified inside the instruction
    /// handler (tr.payer == payer and tr.amount == params.amount).
    pub travel_rule_data: Option<Account<'info, TravelRuleData>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// -----------------------------------------------------------------------
// REDEEM CONTEXT
// -----------------------------------------------------------------------

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(mut, address = vault_state.cvault_mint)]
    pub cvault_mint: Account<'info, Mint>,

    #[account(mut, seeds = [VAULT_TOKEN_SEED], bump)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub redeemer_cvault_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub redeemer_deposit_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub redeemer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// -----------------------------------------------------------------------
// SECONDARY MARKET CONTEXTS
// -----------------------------------------------------------------------

#[derive(Accounts)]
pub struct ConvertToTradeable<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(mut, address = vault_state.cvault_mint)]
    pub cvault_mint: Account<'info, Mint>,

    #[account(mut, address = vault_state.cvault_trade_mint)]
    pub cvault_trade_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_cvault_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_cvault_trade_account: Account<'info, TokenAccount>,

    /// The user burning their own cVAULT tokens.
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RedeemTradeable<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(mut, address = vault_state.cvault_trade_mint)]
    pub cvault_trade_mint: Account<'info, Mint>,

    #[account(mut, address = vault_state.cvault_mint)]
    pub cvault_mint: Account<'info, Mint>,

    #[account(mut, seeds = [VAULT_TOKEN_SEED], bump)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_cvault_trade_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_cvault_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_destination: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// -----------------------------------------------------------------------
// YIELD CONTEXTS
// -----------------------------------------------------------------------

#[derive(Accounts)]
pub struct ProcessYield<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(address = vault_state.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterUsxAccounts<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(address = vault_state.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DistributeYield<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(address = vault_state.authority)]
    pub authority: Signer<'info>,
}

// -----------------------------------------------------------------------
// ADMIN CONTEXTS
// -----------------------------------------------------------------------

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(address = vault_state.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(address = vault_state.authority)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SyncYield<'info> {
    #[account(mut, seeds = [VAULT_STATE_SEED], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,

    #[account(address = vault_state.authority)]
    pub authority: Signer<'info>,
}

// ============================================================================
// INSTRUCTION PARAMETERS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeVaultParams {
    pub treasury: Pubkey,
    pub authority: Pubkey,
    pub min_deposit: u64,
    pub max_deposit: u64,
    pub usx_allocation_bps: u16,
    pub apy_bps: u16,
    pub cvault_trade_mint: Pubkey,
    pub secondary_market_enabled: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetNavParams {
    /// NAV in basis points: 10000 = $1.00, 10430 = $1.043
    pub nav_price_bps: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct IssueCredentialParams {
    pub wallet: Pubkey,
    pub institution_name: [u8; 64],
    pub jurisdiction: [u8; 4],
    pub tier: u8,
    pub kyc_level: u8,
    pub aml_coverage: u8,
    pub attestation_hash: [u8; 32],
    pub issued_at: i64,
    pub expires_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeTravelRuleParams {
    pub originator_name: [u8; 64],
    pub originator_account: [u8; 34],
    pub beneficiary_name: [u8; 64],
    pub compliance_hash: [u8; 32],
    pub amount: u64,
    /// SHA-256 of a unique nonce; used as PDA seed to prevent replay attacks.
    pub nonce_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositParams {
    pub amount: u64,
    /// Client-supplied nonce for idempotency logging (not used in PDA seeds here)
    pub nonce: String,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RedeemParams {
    pub cvault_amount: u64,
    pub nonce: String,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetPauseParams {
    pub paused: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateConfigParams {
    pub min_deposit: Option<u64>,
    pub max_deposit: Option<u64>,
    pub usx_allocation_bps: Option<u16>,
    pub apy_bps: Option<u16>,
    pub secondary_market_enabled: Option<bool>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterUsxAccountsParams {
    pub usx_mint: Pubkey,
    pub eusx_mint: Pubkey,
    pub vault_usx_account: Pubkey,
    pub vault_eusx_account: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ConvertToTradeableParams {
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RedeemTradeableParams {
    pub amount: u64,
    pub redeem_to_cvault: bool,
}

// ============================================================================
// ERROR CODES
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Deposit amount below minimum")]
    DepositTooSmall,
    #[msg("Deposit amount above maximum")]
    DepositTooLarge,
    #[msg("Vault has insufficient USDC for this redemption")]
    InsufficientVaultFunds,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("USX allocation must be <= 10000 bps")]
    InvalidAllocation,
    #[msg("Secondary market trading is not enabled")]
    SecondaryMarketDisabled,
    #[msg("Compliance credential check failed")]
    ComplianceCheckFailed,
    #[msg("NAV must be greater than zero")]
    InvalidNav,
    #[msg("NAV change exceeds 50% maximum per update")]
    NavChangeTooLarge,
    #[msg("Credential is invalid or already revoked")]
    InvalidCredential,
    #[msg("Compliance credential has expired")]
    CredentialExpired,
    #[msg("Travel Rule data required for deposits >= 1000 USDC")]
    TravelRuleRequired,
    #[msg("Travel Rule data does not match this deposit")]
    InvalidTravelRule,
    #[msg("Only the vault authority may trigger yield processing")]
    YieldNotAuthorized,
}

// ============================================================================
// EVENTS (for backend indexing via connection.onLogs)
// ============================================================================

#[event]
pub struct YieldDistributed {
    pub usdc_yield: u64,
    pub timestamp: i64,
}

#[event]
pub struct NavUpdated {
    pub nav_price_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct DepositMade {
    pub payer: Pubkey,
    pub usdc_amount: u64,
    pub cvault_amount: u64,
    pub timestamp: i64,
}