/**
 * scripts/init-vault.ts
 * Initializes the oragami-vault program on devnet.
 * Run: npx ts-node -r tsconfig-paths/register scripts/init-vault.ts
 */

import 'dotenv/config';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN, Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const KEYPAIR_JSON = process.env.VAULT_AUTHORITY_KEYPAIR!;
const PROGRAM_ID = new PublicKey(process.env.VAULT_PROGRAM_ID!);

// Devnet USDC
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

const VAULT_STATE_SEED = Buffer.from('vault_state');
const CVAULT_MINT_SEED = Buffer.from('cvault_mint');
const VAULT_TOKEN_SEED = Buffer.from('vault_token_account');

async function main() {
  console.log('\n=== Oragami Vault — Initialize on Devnet ===\n');

  const secretKey = Uint8Array.from(JSON.parse(KEYPAIR_JSON));
  const authority = Keypair.fromSecretKey(secretKey);
  console.log(`Authority: ${authority.publicKey.toBase58()}`);

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Balance:   ${(balance / 1e9).toFixed(4)} SOL\n`);

  const idlPath = path.join(__dirname, '../src/solana/oragami_vault.idl.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

  const provider = new AnchorProvider(
    connection,
    new Wallet(authority),
    { commitment: 'confirmed' },
  );
  const program = new Program(idl as Idl, provider);

  const [vaultStatePda] = PublicKey.findProgramAddressSync([VAULT_STATE_SEED], PROGRAM_ID);
  const [cvaultMintPda] = PublicKey.findProgramAddressSync([CVAULT_MINT_SEED], PROGRAM_ID);
  const [vaultTokenPda] = PublicKey.findProgramAddressSync([VAULT_TOKEN_SEED], PROGRAM_ID);

  console.log(`vault_state: ${vaultStatePda.toBase58()}`);
  console.log(`cvault_mint: ${cvaultMintPda.toBase58()}`);
  console.log(`vault_token: ${vaultTokenPda.toBase58()}\n`);

  // Check if already initialized
  const vaultExists = await connection.getAccountInfo(vaultStatePda);
  if (vaultExists) {
    console.log('✓ vault_state already initialized.');

    // Read and display current state
    const vs = await (program.account as any).vaultState.fetch(vaultStatePda);
    console.log(`  navPriceBps:      ${vs.navPriceBps.toString()}`);
    console.log(`  apyBps:           ${vs.apyBps}`);
    console.log(`  usxAllocationBps: ${vs.usxAllocationBps}`);
    console.log(`  paused:           ${vs.paused}`);
    console.log(`  totalDeposits:    ${vs.totalDeposits.toString()}`);
    console.log('\n✓ Vault is ready. NAV crank will update on-chain.\n');
    return;
  }

  console.log('Calling initialize_vault...');
  const tx = await (program.methods as any)
    .initializeVault({
      treasury: authority.publicKey,
      authority: authority.publicKey,
      operator: PublicKey.default,
      minDeposit: new BN(1_000_000),
      maxDeposit: new BN(1_000_000_000_000),
      usxAllocationBps: 7000,
      apyBps: 500,
      cvaultTradeMint: PublicKey.default,
      secondaryMarketEnabled: false,
    })
    .accounts({
      vaultState: vaultStatePda,
      cvaultMint: cvaultMintPda,
      tokenAccount: vaultTokenPda,
      depositMint: USDC_MINT,
      payer: authority.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log(`✓ vault_state initialized | tx=${tx}`);
  console.log('\n✓ Done. Restart the backend — NAV crank will now update on-chain.\n');
}

main().catch((err) => {
  console.error('\n✗ Failed:', err?.message ?? err);
  process.exit(1);
});
