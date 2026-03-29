/**
 * Initialize Oragami Vault on Devnet
 * Run: npx ts-node --esm scripts/init-vault.ts
 */

import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, clusterApiUrl, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync } from 'fs';
import idl from '../src/lib/idl/oragami_vault.json' assert { type: 'json' };

const VAULT_PROGRAM_ID = new PublicKey('GRk6Qv4rAzWf1DiKPv5FLKPvGKkk8rEdNGDoK6VMf8sX');
const USDC_DEVNET_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

function loadWallet(): Keypair {
  // Try Windows solana-wallet path first
  for (const p of ['C:/solana-wallet/id.json', `${process.env.USERPROFILE}/.config/solana/id.json`]) {
    try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf-8')))); } catch {}
  }
  throw new Error('Wallet not found. Set SOLANA_WALLET env var or place keypair at C:/solana-wallet/id.json');
}

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const wallet = loadWallet();
  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('Balance:', (await connection.getBalance(wallet.publicKey)) / 1e9, 'SOL');

  const provider = new AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: 'confirmed' });
  const program = new Program(idl as Idl, VAULT_PROGRAM_ID, provider);

  const [vaultState] = PublicKey.findProgramAddressSync([Buffer.from('vault_state')], VAULT_PROGRAM_ID);
  const [cvaultMint] = PublicKey.findProgramAddressSync([Buffer.from('cvault_mint')], VAULT_PROGRAM_ID);
  const [tokenAccount] = PublicKey.findProgramAddressSync([Buffer.from('vault_token_account')], VAULT_PROGRAM_ID);

  // Check if already initialized
  try {
    const s = await (program.account as any).vaultState.fetch(vaultState);
    console.log('\nAlready initialized. NAV:', s.navPriceBps.toString(), 'bps | TVL:', s.totalDeposits.toString());
    return;
  } catch { console.log('Not initialized. Proceeding...'); }

  const cvaultTradeMint = Keypair.generate();
  console.log('cVAULT-TRADE mint:', cvaultTradeMint.publicKey.toBase58());

  const defaultPubkey = new PublicKey(Buffer.alloc(32));
  const tx = await program.methods
    .initializeVault({
      treasury: wallet.publicKey,
      authority: wallet.publicKey,
      operator: defaultPubkey,
      minDeposit: new BN(1_000_000),
      maxDeposit: new BN(100_000_000_000),
      usxAllocationBps: 7000,
      apyBps: 500,
      cvaultTradeMint: cvaultTradeMint.publicKey,
      secondaryMarketEnabled: true,
    })
    .accounts({
      vaultState,
      cvaultMint,
      tokenAccount,
      depositMint: USDC_DEVNET_MINT,
      payer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log('\nVault initialized!');
  console.log('Tx:', tx);
  console.log('Solscan: https://explorer.solana.com/tx/' + tx + '?cluster=devnet');
  console.log('\nSave cVAULT-TRADE keypair:', JSON.stringify(Array.from(cvaultTradeMint.secretKey)));
}

main().catch(e => { console.error(e); process.exit(1); });
