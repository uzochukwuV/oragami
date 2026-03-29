import { PublicKey } from '@solana/web3.js';

// API — oragami-backend (NestJS on port 3210)
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3210';

// Solana
export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta';

// Vault program — deployed on devnet
export const VAULT_PROGRAM_ID = new PublicKey('ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP');
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID || '3K8V8s8gQtvJVZxW8Z9DvLU4MgginGBx5Yvptb7o6dmT'
);

// PDA seeds — must match the Rust contract exactly
export const VAULT_STATE_SEED = 'vault_state';
export const CVAULT_MINT_SEED = 'cvault_mint';
export const VAULT_TOKEN_SEED = 'vault_token_account';
export const RWA_ASSET_REGISTRY_SEED = 'rwa_asset_registry';
export const VAULT_MANDATE_SEED = 'vault_mandate';

// NAV denominator — 10000 = $1.00
export const NAV_BPS_DENOMINATOR = 10_000;

// Devnet USDC mint
export const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

// Solstice devnet mints (confirmed from SOLICTICE.md)
export const USX_DEVNET_MINT = new PublicKey('7QC4zjrKA6XygpXPQCKSS9BmAsEFDJR6awiHSdgLcDvS');
export const EUSX_DEVNET_MINT = new PublicKey('Gkt9h4QWpPBDtbaF5HvYKCc87H5WCRTUtMf77HdTGHBt');

// Basket composition weights (for display)
export const BASKET_WEIGHTS = {
  XAU: 50,  // Gold 50%
  CHF: 30,  // CHF/USD 30%
  USX: 20,  // Solstice USX yield 20%
} as const;
