/**
 * Vault Operation Service
 * Integrates compliance checking with vault operations (deposit/redeem)
 * Uses Anchor framework for real on-chain contract interactions
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { checkWalletRisk } from './risk-check';
import {
  API_BASE_URL,
  VAULT_PROGRAM_ID,
  VAULT_STATE_SEED,
  CVAULT_MINT_SEED,
  VAULT_TOKEN_SEED,
  RWA_ASSET_REGISTRY_SEED,
  SOLANA_RPC_URL,
} from '@/lib/constants';
import oragamiVaultIdl from '@/lib/idl/oragami_vault.json';

// ============================================================================
// Types
// ============================================================================

export interface VaultOperationRequest {
  operation: 'deposit' | 'redeem';
  amount: number;
  tokenMint?: string;
  fromAddress: string;
  toAddress: string;
  nonce: string;
}

export interface VaultOperationResponse {
  success: boolean;
  transaction?: string;
  signature?: string;
  error?: string;
}

export interface VaultState {
  bump: number;
  cvaultMint: PublicKey;
  cvaultTradeMint: PublicKey;
  vaultTokenAccount: PublicKey;
  treasury: PublicKey;
  authority: PublicKey;
  minDeposit: BN;
  maxDeposit: BN;
  usxAllocationBps: number;
  paused: boolean;
  totalDeposits: BN;
  totalSupply: BN;
  lastYieldClaim: BN;
  secondaryMarketEnabled: boolean;
  navPriceBps: BN; // NAV in basis points: 10000 = $1.00, 10430 = $1.043
}

/** Convert raw nav_price_bps to a human-readable USD price string */
export function navBpsToPrice(navPriceBps: BN | number): string {
  const bps = typeof navPriceBps === 'number' ? navPriceBps : navPriceBps.toNumber();
  return (bps / 10_000).toFixed(4);
}

/** Calculate how many cVAULT tokens a USDC deposit will mint at current NAV */
export function calcCvaultFromUsdc(usdcAmount: number, navPriceBps: number): number {
  return Math.floor((usdcAmount * 10_000) / navPriceBps);
}

/** Calculate how much USDC a cVAULT redemption returns at current NAV */
export function calcUsdcFromCvault(cvaultAmount: number, navPriceBps: number): number {
  return Math.floor((cvaultAmount * navPriceBps) / 10_000);
}

export interface VaultPDAs {
  vaultState: PublicKey;
  cvaultMint: PublicKey;
  vaultTokenAccount: PublicKey;
}

// ============================================================================
// PDA Derivation
// ============================================================================

/**
 * Derive all PDAs for the vault program
 */
export function deriveVaultPDAs(): VaultPDAs {
  const [vaultState] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_STATE_SEED)],
    VAULT_PROGRAM_ID
  );

  const [cvaultMint] = PublicKey.findProgramAddressSync(
    [Buffer.from(CVAULT_MINT_SEED)],
    VAULT_PROGRAM_ID
  );

  const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_TOKEN_SEED)],
    VAULT_PROGRAM_ID
  );

  return { vaultState, cvaultMint, vaultTokenAccount };
}

/** PDA: ["rwa_asset_registry", vault_state] — must exist before `setNav`. */
export function deriveRwaAssetRegistryPda(vaultState: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(RWA_ASSET_REGISTRY_SEED), vaultState.toBuffer()],
    VAULT_PROGRAM_ID
  );
  return pda;
}

// ============================================================================
// Program Connection
// ============================================================================

/**
 * Get the Anchor program instance for the vault
 */
export function getVaultProgram(wallet: any): Program<Idl> {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  return new Program(oragamiVaultIdl as Idl, provider);
}

/**
 * Get the connection instance
 */
export function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

// ============================================================================
// Vault State Queries
// ============================================================================

/**
 * Fetch the current vault state from the on-chain account
 */
export async function fetchVaultState(wallet: any): Promise<VaultState | null> {
  try {
    const program = getVaultProgram(wallet);
    const { vaultState } = deriveVaultPDAs();

    const account = await (program.account as any).vaultState.fetch(vaultState);
    return account as VaultState;
  } catch (error) {
    console.error('Failed to fetch vault state:', error);
    return null;
  }
}

/**
 * Get vault TVL (Total Value Locked)
 */
export async function getVaultTVL(wallet: any): Promise<number> {
  const state = await fetchVaultState(wallet);
  if (!state) return 0;
  return state.totalDeposits.toNumber();
}

/**
 * Check if the vault is paused
 */
export async function isVaultPaused(wallet: any): Promise<boolean> {
  const state = await fetchVaultState(wallet);
  return state?.paused ?? false;
}

// ============================================================================
// Compliance Check
// ============================================================================

/**
 * Pre-flight compliance check before any vault operation
 * This must pass before the transaction is signed and submitted
 */
export async function checkVaultCompliance(
  walletAddress: string
): Promise<{ compliant: boolean; reason?: string }> {
  try {
    const result = await checkWalletRisk(walletAddress);

    if (result.status === 'blocked') {
      return {
        compliant: false,
        reason: result.reason || 'Wallet failed compliance check',
      };
    }

    if (result.status === 'analyzed' && result.risk_score > 70) {
      return {
        compliant: false,
        reason: `High risk score: ${result.risk_score}`,
      };
    }

    return { compliant: true };
  } catch (error) {
    return {
      compliant: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Deposit Operation
// ============================================================================

/**
 * Execute a deposit into the vault
 * Transfers USDC from user to vault, mints cVAULT to user
 */
export async function depositToVault(
  wallet: any,
  amount: number,
  depositMint: PublicKey
): Promise<VaultOperationResponse> {
  try {
    const program = getVaultProgram(wallet);
    const connection = getConnection();
    const { vaultState, cvaultMint, vaultTokenAccount } = deriveVaultPDAs();

    const userPublicKey = wallet.publicKey;
    if (!userPublicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    const nonce = generateNonce();
    const amountBN = new BN(amount);

    // Get or create user's deposit token account (e.g., USDC)
    const payerDepositAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      depositMint,
      userPublicKey
    );

    // Get or create user's cVAULT token account
    const payerCvaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      cvaultMint,
      userPublicKey
    );

    // Execute the deposit instruction
    const tx = await program.methods
      .deposit({ amount: amountBN, nonce })
      .accounts({
        vaultState,
        cvaultMint,
        vaultTokenAccount,
        payerDepositAccount: payerDepositAccount.address,
        payerCvaultAccount: payerCvaultAccount.address,
        payer: userPublicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return {
      success: true,
      signature: tx,
    };
  } catch (error) {
    console.error('Deposit failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deposit failed',
    };
  }
}

// ============================================================================
// Redeem Operation
// ============================================================================

/**
 * Redeem cVAULT tokens for the underlying deposit token
 */
export async function redeemFromVault(
  wallet: any,
  cvaultAmount: number,
  depositMint: PublicKey
): Promise<VaultOperationResponse> {
  try {
    const program = getVaultProgram(wallet);
    const connection = getConnection();
    const { vaultState, cvaultMint, vaultTokenAccount } = deriveVaultPDAs();

    const userPublicKey = wallet.publicKey;
    if (!userPublicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    const nonce = generateNonce();
    const amountBN = new BN(cvaultAmount);

    // Get user's cVAULT token account
    const redeemerCvaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      cvaultMint,
      userPublicKey
    );

    // Get user's deposit token account (to receive underlying)
    const redeemerDepositAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      depositMint,
      userPublicKey
    );

    // Execute the redeem instruction
    const tx = await program.methods
      .redeem({ cvaultAmount: amountBN, nonce })
      .accounts({
        vaultState,
        cvaultMint,
        vaultTokenAccount,
        redeemerCvaultAccount: redeemerCvaultAccount.address,
        redeemerDepositAccount: redeemerDepositAccount.address,
        redeemer: userPublicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return {
      success: true,
      signature: tx,
    };
  } catch (error) {
    console.error('Redeem failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Redeem failed',
    };
  }
}

// ============================================================================
// Convert to Tradeable
// ============================================================================

/**
 * Convert cVAULT tokens to cVAULT-TRADE tokens for secondary market trading
 */
export async function convertToTradeable(
  wallet: any,
  amount: number
): Promise<VaultOperationResponse> {
  try {
    const program = getVaultProgram(wallet);
    const connection = getConnection();
    const { vaultState, cvaultMint } = deriveVaultPDAs();

    const userPublicKey = wallet.publicKey;
    if (!userPublicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Fetch vault state to get cvault_trade_mint
    const state = await fetchVaultState(wallet);
    if (!state) {
      return { success: false, error: 'Could not fetch vault state' };
    }

    const cvaultTradeMint = state.cvaultTradeMint;
    const amountBN = new BN(amount);

    // Get user's cVAULT account
    const userCvaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      cvaultMint,
      userPublicKey
    );

    // Get user's cVAULT-TRADE account
    const userCvaultTradeAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      cvaultTradeMint,
      userPublicKey
    );

    const tx = await program.methods
      .convertToTradeable({ amount: amountBN })
      .accounts({
        vaultState,
        cvaultMint,
        cvaultTradeMint,
        userCvaultAccount: userCvaultAccount.address,
        userCvaultTradeAccount: userCvaultTradeAccount.address,
        authority: userPublicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return {
      success: true,
      signature: tx,
    };
  } catch (error) {
    console.error('Convert to tradeable failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Conversion failed',
    };
  }
}

// ============================================================================
// Redeem Tradeable
// ============================================================================

/**
 * Redeem cVAULT-TRADE tokens
 * Can redeem back to cVAULT or directly to underlying assets
 */
export async function redeemTradeable(
  wallet: any,
  amount: number,
  redeemToCvault: boolean,
  depositMint: PublicKey
): Promise<VaultOperationResponse> {
  try {
    const program = getVaultProgram(wallet);
    const connection = getConnection();
    const { vaultState, cvaultMint, vaultTokenAccount } = deriveVaultPDAs();

    const userPublicKey = wallet.publicKey;
    if (!userPublicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Fetch vault state to get cvault_trade_mint
    const state = await fetchVaultState(wallet);
    if (!state) {
      return { success: false, error: 'Could not fetch vault state' };
    }

    const cvaultTradeMint = state.cvaultTradeMint;
    const amountBN = new BN(amount);

    // Get user's cVAULT-TRADE account
    const userCvaultTradeAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      cvaultTradeMint,
      userPublicKey
    );

    // Get user's cVAULT account
    const userCvaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      cvaultMint,
      userPublicKey
    );

    // Get user's destination account (for underlying assets)
    const userDestination = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      depositMint,
      userPublicKey
    );

    const tx = await program.methods
      .redeemTradeable({ amount: amountBN, redeemToCvault })
      .accounts({
        vaultState,
        cvaultTradeMint,
        cvaultMint,
        vaultTokenAccount,
        userCvaultTradeAccount: userCvaultTradeAccount.address,
        userCvaultAccount: userCvaultAccount.address,
        userDestination: userDestination.address,
        authority: userPublicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return {
      success: true,
      signature: tx,
    };
  } catch (error) {
    console.error('Redeem tradeable failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Redeem tradeable failed',
    };
  }
}

// ============================================================================
// Yield Operations
// ============================================================================

/**
 * Claim accumulated yield from the vault
 */
export async function claimVaultYield(
  wallet: any,
  amount: number,
  vaultUsxAccount: PublicKey
): Promise<VaultOperationResponse> {
  try {
    const program = getVaultProgram(wallet);
    const { vaultState } = deriveVaultPDAs();

    const userPublicKey = wallet.publicKey;
    if (!userPublicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    const amountBN = new BN(amount);

    const tx = await program.methods
      .claimYield({ amount: amountBN })
      .accounts({
        vaultState,
        vaultUsxAccount,
        authority: userPublicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return {
      success: true,
      signature: tx,
    };
  } catch (error) {
    console.error('Claim yield failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Claim yield failed',
    };
  }
}

/**
 * Sync vault yield state
 */
export async function syncVaultYield(
  wallet: any
): Promise<VaultOperationResponse> {
  try {
    const program = getVaultProgram(wallet);
    const { vaultState } = deriveVaultPDAs();

    const userPublicKey = wallet.publicKey;
    if (!userPublicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    const tx = await program.methods
      .syncYield()
      .accounts({
        vaultState,
        operator: userPublicKey,
      })
      .rpc();

    return {
      success: true,
      signature: tx,
    };
  } catch (error) {
    console.error('Sync yield failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Sync yield failed',
    };
  }
}

// ============================================================================
// Set NAV (operator — called by backend after SIX price update)
// ============================================================================

/**
 * Update the vault NAV price on-chain.
 * Callable by the vault operator (or authority when operator unset).
 * Requires `initializeRwaAssetRegistry` once. navPriceBps: 10000 = $1.00, 10430 = $1.043
 */
export async function setVaultNav(
  wallet: any,
  navPriceBps: number
): Promise<VaultOperationResponse> {
  try {
    const program = getVaultProgram(wallet);
    const { vaultState } = deriveVaultPDAs();
    const rwaAssetRegistry = deriveRwaAssetRegistryPda(vaultState);

    const userPublicKey = wallet.publicKey;
    if (!userPublicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    const tx = await program.methods
      .setNav({ navPriceBps: new BN(navPriceBps) })
      .accounts({
        vaultState,
        rwaAssetRegistry,
        operator: userPublicKey,
      })
      .rpc();

    return { success: true, signature: tx };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Set NAV failed',
    };
  }
}

// ============================================================================
// Legacy Backend API (for compliance-gated operations)
// ============================================================================

/**
 * Submit vault operation through the backend compliance relayer
 * This is used when the operation requires additional compliance verification
 */
export async function submitVaultOperation(
  request: VaultOperationRequest,
  signedMessage: string
): Promise<VaultOperationResponse> {
  const response = await fetch(`${API_BASE_URL}/vault-operation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      signature: signedMessage,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    return {
      success: false,
      error: error.error?.message || 'Operation failed',
    };
  }

  return response.json();
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a unique nonce for replay protection
 */
export function generateNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Format vault operation message for signing
 * Format: {from}:{to}:{amount}:{token}:{nonce}
 */
export function formatOperationMessage(
  fromAddress: string,
  toAddress: string,
  amount: number,
  tokenMint: string = 'SOL',
  nonce: string
): string {
  return `${fromAddress}:${toAddress}:${amount}:${tokenMint}:${nonce}`;
}

/**
 * Format a token amount for display (from raw units to human-readable)
 */
export function formatTokenAmount(rawAmount: BN | number, decimals: number = 6): string {
  const amount = typeof rawAmount === 'number' ? rawAmount : rawAmount.toNumber();
  return (amount / Math.pow(10, decimals)).toFixed(decimals);
}

/**
 * Parse a human-readable token amount to raw units
 */
export function parseTokenAmount(humanAmount: number, decimals: number = 6): BN {
  return new BN(Math.floor(humanAmount * Math.pow(10, decimals)));
}
