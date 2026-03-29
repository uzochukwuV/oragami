/**
 * Solstice USX Yield Integration
 *
 * Handles yield routing from vault deposits to Solstice USX
 * for delta-neutral yield generation.
 *
 * On devnet, uses simulated yield rates.
 * On mainnet, would integrate with actual Solstice protocol.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getMint } from '@solana/spl-token';
import { SOLANA_RPC_URL, USX_DEVNET_MINT, API_BASE_URL } from '@/lib/constants';

// ============================================================================
// Constants
// ============================================================================

export const USX_MINT_ADDRESS = USX_DEVNET_MINT;

// Solstice yield vault program address (devnet placeholder)
export const SOLSTICE_YIELD_VAULT_ADDRESS = new PublicKey(
  'SoLst1ceY1e1dVau1tT3xGK9XQDqVjG1qGjvMaVQDq'
);

// Solstice program ID (devnet)
export const SOLSTICE_PROGRAM_ID = new PublicKey(
  'SoLst1ce111111111111111111111111111111111111'
);

// ============================================================================
// Types
// ============================================================================

export interface YieldVaultConfig {
  usxMint: PublicKey;
  yieldVault: PublicKey;
  vaultUsxAccount: PublicKey;
  allocationBps: number;
}

export interface YieldClaimResult {
  amountClaimed: number;
  timestamp: number;
  signature: string;
}

export interface YieldState {
  totalYieldEarned: number;
  lastClaimTimestamp: number;
  pendingYield: number;
  currentApy: number;
}

export interface YieldProjection {
  apy: number;
  dailyYield: number;
  monthlyYield: number;
  yearlyYield: number;
}

// ============================================================================
// Connection Helper
// ============================================================================

function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

// ============================================================================
// USX Token Operations
// ============================================================================

/**
 * Get USX token account balance for a wallet
 */
export async function getUsxBalance(
  walletPublicKey: PublicKey
): Promise<number> {
  try {
    const connection = getConnection();

    // Find the associated token account for USX
    const { getAssociatedTokenAddress } = await import('@solana/spl-token');
    const ata = await getAssociatedTokenAddress(USX_MINT_ADDRESS, walletPublicKey);

    const account = await getAccount(connection, ata);
    const mintInfo = await getMint(connection, USX_MINT_ADDRESS);

    return Number(account.amount) / Math.pow(10, mintInfo.decimals);
  } catch (error) {
    // Account doesn't exist or other error
    console.log('USX balance query failed (expected on devnet):', error);
    return 0;
  }
}

/**
 * Get USX mint info
 */
export async function getUsxMintInfo(): Promise<{
  decimals: number;
  supply: number;
  mintAuthority: PublicKey | null;
} | null> {
  try {
    const connection = getConnection();
    const mintInfo = await getMint(connection, USX_MINT_ADDRESS);

    return {
      decimals: mintInfo.decimals,
      supply: Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals),
      mintAuthority: mintInfo.mintAuthority,
    };
  } catch (error) {
    console.log('USX mint info query failed:', error);
    return null;
  }
}

// ============================================================================
// Yield Vault Operations
// ============================================================================

/**
 * Initialize USX allocation for the vault
 */
export async function initializeYieldVault(
  connection: Connection,
  payer: any,
  vaultAddress: PublicKey,
  config: YieldVaultConfig
): Promise<{ usxTokenAccount: string; signature: string }> {
  console.log('Initializing yield vault for:', vaultAddress.toString());
  console.log('USX allocation:', config.allocationBps / 100, '%');

  // Derive the USX token account PDA for the vault
  const [usxAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_usx'), vaultAddress.toBuffer()],
    vaultAddress
  );

  // In production, this would create the token account and initialize config
  // For devnet, return the derived address
  return {
    usxTokenAccount: usxAccount.toString(),
    signature: 'init_yield_signature_' + Date.now(),
  };
}

/**
 * Allocate a portion of deposits to USX
 */
export interface AllocateToYieldParams {
  depositAmount: number;
  allocationBps: number;
  vaultUsxAccount: PublicKey;
  vaultAuthority: any;
}

export async function allocateToYield(
  connection: Connection,
  params: AllocateToYieldParams
): Promise<{ usxAmount: number; signature: string }> {
  const allocationAmount = (params.depositAmount * params.allocationBps) / 10000;

  console.log(`Allocating ${allocationAmount} to USX (${params.allocationBps / 100}%)`);

  // In production:
  // 1. Swap the allocated portion to USX
  // 2. Deposit into Solstice yield vault
  // 3. Track the receipt token

  return {
    usxAmount: allocationAmount,
    signature: 'allocate_yield_signature_' + Date.now(),
  };
}

/**
 * Claim accumulated yield from USX
 */
export async function claimYield(
  _connection: Connection,
  vaultAddress: PublicKey,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _vaultAuthority: any
): Promise<YieldClaimResult> {
  const clock = Math.floor(Date.now() / 1000);

  console.log('Claiming yield for vault:', vaultAddress.toString());

  // Try to get real yield state from backend
  try {
    const response = await fetch(`${API_BASE_URL}/api/vault/tvl`);
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        return {
          amountClaimed: data.data.pending_yield || 0,
          timestamp: clock,
          signature: 'claim_yield_signature_' + Date.now(),
        };
      }
    }
  } catch {
    // Fall back to mock calculation
  }

  // Mock yield calculation (4-6% APY)
  const daysSinceLastClaim = 1;
  const apy = 0.05;
  const mockYield = (daysSinceLastClaim / 365) * apy * 1000000;

  return {
    amountClaimed: Math.floor(mockYield),
    timestamp: clock,
    signature: 'claim_yield_signature_' + Date.now(),
  };
}

/**
 * Get current yield state for the vault
 */
export async function getYieldState(
  _connection: Connection,
  _vaultAddress: PublicKey
): Promise<YieldState> {
  // Try to get real data from backend
  try {
    const response = await fetch(`${API_BASE_URL}/api/vault/tvl`);
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        const lastClaim = data.data.last_yield_claim || Math.floor(Date.now() / 1000) - 86400;
        return {
          totalYieldEarned: 50000,
          lastClaimTimestamp: lastClaim,
          pendingYield: data.data.pending_yield || 150,
          currentApy: 5.0,
        };
      }
    }
  } catch {
    // Fall back to mock state
  }

  return {
    totalYieldEarned: 50000,
    lastClaimTimestamp: Math.floor(Date.now() / 1000) - 86400,
    pendingYield: 150,
    currentApy: 5.0,
  };
}

/**
 * Calculate projected annual yield
 */
export async function getYieldProjection(
  connection: Connection,
  vaultTotalValue: number
): Promise<YieldProjection> {
  // Current USX yield rate (approximately 5% APY in 2026)
  const currentApy = 0.05;

  const dailyYield = (vaultTotalValue * currentApy) / 365;
  const monthlyYield = dailyYield * 30;
  const yearlyYield = dailyYield * 365;

  return {
    apy: currentApy * 100,
    dailyYield: Math.floor(dailyYield),
    monthlyYield: Math.floor(monthlyYield),
    yearlyYield: Math.floor(yearlyYield),
  };
}

/**
 * Get the current USX exchange rate
 */
export async function getUsxPrice(_connection: Connection): Promise<number> {
  // USX is designed to be 1:1 with USD
  // In production, could check DEX prices for depeg detection
  try {
    const response = await fetch(`${API_BASE_URL}/api/vault/quote/USX`);
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        return data.data.last || 1.0;
      }
    }
  } catch {
    // Fall back to 1:1
  }

  return 1.0;
}

/**
 * Check if Solstice yield vault is available
 */
export async function checkYieldVaultHealth(connection: Connection): Promise<boolean> {
  try {
    const accountInfo = await connection.getAccountInfo(SOLSTICE_YIELD_VAULT_ADDRESS);
    return accountInfo !== null;
  } catch (error) {
    console.error('Yield vault health check failed:', error);
    return false;
  }
}

/**
 * Rebalance yield allocation
 */
export interface RebalanceParams {
  newAllocationBps: number;
  vaultAddress: PublicKey;
  vaultAuthority: any;
}

export async function rebalanceYield(
  _connection: Connection,
  params: RebalanceParams
): Promise<{ success: boolean; signature?: string; reason?: string }> {
  if (params.newAllocationBps > 10000) {
    return {
      success: false,
      reason: 'Allocation cannot exceed 100%',
    };
  }

  console.log(`Rebalancing yield to ${params.newAllocationBps / 100}%`);

  // In production:
  // 1. Withdraw from current allocation if reducing
  // 2. Reallocate to new percentage
  // 3. Update vault config on-chain

  return {
    success: true,
    signature: 'rebalance_signature_' + Date.now(),
  };
}

/**
 * Get USX yield history
 */
export async function getYieldHistory(
  days: number = 30
): Promise<{ date: string; apy: number; yieldEarned: number }[]> {
  const history: { date: string; apy: number; yieldEarned: number }[] = [];
  const baseApy = 5.0;

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const variance = (Math.random() - 0.5) * 1.0; // ±0.5% APY variance
    const apy = baseApy + variance;
    const dailyYield = (1000000 * (apy / 100)) / 365;

    history.push({
      date: date.toISOString().split('T')[0],
      apy: Math.round(apy * 100) / 100,
      yieldEarned: Math.floor(dailyYield),
    });
  }

  return history;
}
