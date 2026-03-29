import type { Asset } from '@/types/transaction';
import { PublicKey } from '@solana/web3.js';

// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Solana Network Configuration
export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'testnet' | 'mainnet-beta';

// Vault Program Constants
export const VAULT_PROGRAM_ID = new PublicKey('ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP');
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID || '3K8V8s8gQtvJVZxW8Z9DvLU4MgginGBx5Yvptb7o6dmT'
);
export const VAULT_STATE_SEED = 'vault_state';
export const CVAULT_MINT_SEED = 'cvault_mint';
export const VAULT_TOKEN_SEED = 'vault_token_account';

/// NAV basis points denominator — 10000 = $1.00
export const NAV_BPS_DENOMINATOR = 10_000;

// Devnet USDC (from Solana SPL Token registry)
export const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

// USX Token (Solstice stablecoin - devnet address)
export const USX_DEVNET_MINT = new PublicKey('USXgR2w7qDE3pLVqVgJbVWqJrJQ9pDq9qVJqJrJQ9pD');

// Theme Colors (also in tailwind.config.ts)
export const COLORS = {
  background: '#0b0f14',
  panel: '#111722',
  border: '#1f2a3a',
  primary: '#7c3aed',
  primaryDark: '#5b21b6',
} as const;

// Available Assets
export const ASSETS: Asset[] = [
  {
    id: 'usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    description: 'High Volume (Safe)',
  },
  {
    id: 'sol',
    symbol: 'SOL',
    name: 'Solana',
    description: 'Native Token',
  },
  {
    id: 'usdt',
    symbol: 'USDT',
    name: 'Tether',
    description: 'Stablecoin',
  },
];

// Transfer Mode Labels
export const MODE_LABELS = {
  public: {
    hint: 'Range Protocol: Clean',
    description: 'Standard transfer with compliance verification',
  },
  confidential: {
    hint: 'Will be encrypted via ElGamal',
    description: 'Privacy-preserving transfer with zero-knowledge proofs',
  },
} as const;
