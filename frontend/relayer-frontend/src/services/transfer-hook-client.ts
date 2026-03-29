/**
 * cVAULT-TRADE Transfer Hook Client
 * 
 * TypeScript client for interacting with the cVAULT-TRADE transfer hook program
 * which enforces compliance on every token transfer.
 */

import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAccount } from '@solana/spl-token';

export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID || '3K8V8s8gQtvJVZxW8Z9DvLU4MgginGBx5Yvptb7o6dmT'
);

export const COMPLIANCE_CONFIG_SEED = 'compliance';
export const WHITELIST_SEED = 'whitelist';

/**
 * Get the compliance configuration PDA
 */
export function getComplianceConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(COMPLIANCE_CONFIG_SEED)],
    TRANSFER_HOOK_PROGRAM_ID
  );
  return pda;
}

export function getWhitelistPda(walletAddress: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(WHITELIST_SEED), walletAddress.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID
  );
  return pda;
}

/**
 * Initialize compliance configuration
 * This should be called once during program setup
 */
export async function initializeCompliance(
  connection: Connection,
  payer: any,
  authority: PublicKey
): Promise<string> {
  const compliancePda = getComplianceConfigPda();
  
  // In production, this would create a transaction with the initialize instruction
  // For now, return the PDA so frontend can check if it's initialized
  console.log('Compliance Config PDA:', compliancePda.toString());
  
  // The actual transaction would be built using Anchor's IDL
  // This is a placeholder for the demo
  return compliancePda.toString();
}

/**
 * Add a wallet to the whitelist
 */
export interface AddWhitelistParams {
  walletAddress: PublicKey;
  kycCompliant: boolean;
  amlClear: boolean;
  travelRuleCompliant: boolean;
  expiryDays: number;
}

export async function addToWhitelist(
  connection: Connection,
  payer: any,
  params: AddWhitelistParams
): Promise<string> {
  const whitelistPda = getWhitelistPda(params.walletAddress);
  console.log('Whitelist Entry PDA:', whitelistPda.toString());
  
  // In production, this would submit the actual transaction
  return whitelistPda.toString();
}

/**
 * Remove a wallet from the whitelist
 */
export async function removeFromWhitelist(
  connection: Connection,
  payer: any,
  walletAddress: PublicKey
): Promise<string> {
  const whitelistPda = getWhitelistPda(walletAddress);
  console.log('Removing from whitelist:', whitelistPda.toString());
  
  return whitelistPda.toString();
}

/**
 * Check if a wallet is whitelisted
 */
export async function isWalletWhitelisted(
  connection: Connection,
  walletAddress: PublicKey
): Promise<boolean> {
  const whitelistPda = getWhitelistPda(walletAddress);
  
  try {
    const accountInfo = await connection.getAccountInfo(whitelistPda);
    return accountInfo !== null;
  } catch (error) {
    console.error('Error checking whitelist:', error);
    return false;
  }
}

/**
 * Update compliance settings
 */
export interface UpdateComplianceParams {
  allowTransfers?: boolean;
  minKycLevel?: number;
  complianceOracle?: PublicKey;
}

export async function updateCompliance(
  connection: Connection,
  payer: any,
  params: UpdateComplianceParams
): Promise<string> {
  console.log('Updating compliance settings:', params);
  // In production, this would submit the actual transaction
  return 'compliance_updated';
}

/**
 * Check transfer compliance before executing
 * This is called by the frontend before any cVAULT-TRADE transfer
 */
export interface TransferComplianceCheck {
  canTransfer: boolean;
  sourceWhitelisted: boolean;
  destWhitelisted: boolean;
  reason?: string;
}

export async function checkTransferCompliance(
  connection: Connection,
  sourceAddress: PublicKey,
  destAddress: PublicKey
): Promise<TransferComplianceCheck> {
  const [sourceWhitelisted, destWhitelisted] = await Promise.all([
    isWalletWhitelisted(connection, sourceAddress),
    isWalletWhitelisted(connection, destAddress),
  ]);
  
  // In production, this would also check the compliance config
  // For demo purposes, we allow transfers if both wallets are whitelisted
  return {
    canTransfer: sourceWhitelisted && destWhitelisted,
    sourceWhitelisted,
    destWhitelisted,
    reason: !sourceWhitelisted 
      ? 'Source wallet not whitelisted' 
      : !destWhitelisted 
        ? 'Destination wallet not whitelisted' 
        : undefined,
  };
}

/**
 * Get token account balance
 */
export async function getTokenBalance(
  connection: Connection,
  tokenAccountAddress: PublicKey
): Promise<number> {
  try {
    const accountInfo = await connection.getTokenAccountBalance(tokenAccountAddress);
    return parseFloat(accountInfo.value.amount);
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

/**
 * Create a transfer instruction with compliance check
 * 
 * In production, this would build the actual transfer with the transfer hook
 * For demo, we return the compliance check result
 */
export interface CreateTransferParams {
  source: PublicKey;
  destination: PublicKey;
  amount: number;
  mint: PublicKey;
  authority: any;
}

export async function createCompliantTransfer(
  connection: Connection,
  params: CreateTransferParams
): Promise<{ success: boolean; transaction?: Transaction; reason?: string }> {
  // First check compliance
  const compliance = await checkTransferCompliance(
    connection,
    params.source,
    params.destination
  );
  
  if (!compliance.canTransfer) {
    return {
      success: false,
      reason: compliance.reason,
    };
  }
  
  // In production, this would build and return the actual transaction
  // For demo, we just return success
  return {
    success: true,
    reason: 'Compliance check passed',
  };
}