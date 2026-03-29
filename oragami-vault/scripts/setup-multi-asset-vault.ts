/**
 * scripts/setup-multi-asset-vault.ts
 *
 * Run from the oragami-vault workspace root:
 *   npx ts-node scripts/setup-multi-asset-vault.ts
 *
 * What this does:
 *   1. Deploys multi-asset-vault program (if not already deployed)
 *   2. Creates GOLD-mock SPL mint  (6 decimals)
 *   3. Creates SILVER-mock SPL mint (6 decimals)
 *   4. Initializes the Factory PDA
 *   5. Registers GOLD vault  (VAULT-GOLD share token)
 *   6. Registers SILVER vault (VAULT-SILVER share token)
 *   7. Airdrops GOLD-mock + SILVER-mock tokens to the authority wallet (demo balance)
 *   8. Issues a demo ComplianceCredential for the authority wallet
 *   9. Prints a deployment manifest (save this — frontend needs the addresses)
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH =
  process.env.WALLET_PATH ?? "C:/solana-wallet/id.json";
const PROGRAM_ID = new PublicKey("6Mbzwuw8JdmmQ3uZGw2CepiRLRWo2DgCga5LUhmsha7D");

// NAV starting prices (basis points, 10000 = $1.00 per asset token)
// Gold: 1 VAULT-GOLD share starts at 1:1 with GOLD-mock
// Silver: 1 VAULT-SILVER share starts at 1:1 with SILVER-mock
const GOLD_INITIAL_NAV_BPS = BigInt(10_000);
const SILVER_INITIAL_NAV_BPS = BigInt(10_000);

const MIN_DEPOSIT = BigInt(1_000_000);
const MAX_DEPOSIT = BigInt(1_000_000_000_000);

const GOLD_AIRDROP = BigInt(10_000_000_000);
const SILVER_AIRDROP = BigInt(10_000_000_000);

// ─── Seeds ────────────────────────────────────────────────────────────────────

const FACTORY_SEED = Buffer.from("factory");
const ASSET_VAULT_SEED = Buffer.from("vault");
const SHARE_MINT_SEED = Buffer.from("share_mint");
const VAULT_TOKEN_SEED = Buffer.from("vault_token");
const CREDENTIAL_SEED = Buffer.from("credential");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function strToBytes(s: string, len: number): number[] {
  const buf = Buffer.alloc(len, 0);
  Buffer.from(s, "utf-8").copy(buf);
  return Array.from(buf);
}

function deriveFactoryPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([FACTORY_SEED], PROGRAM_ID);
}

function deriveVaultPda(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ASSET_VAULT_SEED, assetMint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveShareMintPda(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SHARE_MINT_SEED, assetMint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveVaultTokenPda(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_TOKEN_SEED, assetMint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveCredentialPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CREDENTIAL_SEED, wallet.toBuffer()],
    PROGRAM_ID
  );
}

async function accountExists(
  connection: Connection,
  pubkey: PublicKey
): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey);
  return info !== null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   Oragami Multi-Asset Vault — Devnet Setup Script   ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // ── 1. Connect + load wallet ───────────────────────────────────────────────
  const connection = new Connection(RPC_URL, "confirmed");
  const authority = loadKeypair(WALLET_PATH);
  console.log(`Authority: ${authority.publicKey.toBase58()}`);

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Balance:   ${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.5e9) {
    console.warn("⚠  Low balance — run: solana airdrop 2 --url devnet");
  }

  // ── 2. Load IDL + create program client ───────────────────────────────────
  const idlPath = path.join(__dirname, "../target/idl/multi_asset_vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider) as anchor.Program;

  // ── 3. Create GOLD-mock mint ───────────────────────────────────────────────
  console.log("\n── Step 1: Create mock asset mints ──────────────────────");

  // Check if we already have a saved manifest (idempotent re-runs)
  const manifestPath = path.join(__dirname, "../multi-asset-manifest.json");
  let savedMints: { goldMint?: string; silverMint?: string } = {};
  if (fs.existsSync(manifestPath)) {
    savedMints = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  }

  let goldMint: PublicKey;
  if (savedMints.goldMint) {
    goldMint = new PublicKey(savedMints.goldMint);
    console.log(`GOLD-mock mint (existing): ${goldMint.toBase58()}`);
  } else {
    goldMint = await createMint(
      connection,
      authority,
      authority.publicKey, // mint authority
      null,                // freeze authority
      6                    // decimals
    );
    console.log(`GOLD-mock mint (created):  ${goldMint.toBase58()}`);
  }

  let silverMint: PublicKey;
  if (savedMints.silverMint) {
    silverMint = new PublicKey(savedMints.silverMint);
    console.log(`SILVER-mock mint (existing): ${silverMint.toBase58()}`);
  } else {
    silverMint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      6
    );
    console.log(`SILVER-mock mint (created):  ${silverMint.toBase58()}`);
  }

  // ── 4. Initialize Factory ─────────────────────────────────────────────────
  console.log("\n── Step 2: Initialize Factory ───────────────────────────");
  const [factoryPda] = deriveFactoryPda();
  console.log(`Factory PDA: ${factoryPda.toBase58()}`);

  if (await accountExists(connection, factoryPda)) {
    console.log("Factory already initialized — skipping.");
  } else {
    await (program.methods as any)
      .initializeFactory(10) // 10 bps = 0.10% fee
      .accounts({
        factory: factoryPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Factory initialized ✓");
  }

  // ── 5. Register GOLD vault ────────────────────────────────────────────────
  console.log("\n── Step 3: Register asset vaults ────────────────────────");

  const [goldVaultPda] = deriveVaultPda(goldMint);
  const [goldShareMint] = deriveShareMintPda(goldMint);
  const [goldVaultToken] = deriveVaultTokenPda(goldMint);

  if (await accountExists(connection, goldVaultPda)) {
    console.log("GOLD vault already registered — skipping.");
  } else {
    const goldTicker = strToBytes("GOLD\0\0\0\0", 8);
    await (program.methods as any)
      .registerAsset(
        goldTicker,
        new anchor.BN(GOLD_INITIAL_NAV_BPS.toString()),
        new anchor.BN(MIN_DEPOSIT.toString()),
        new anchor.BN(MAX_DEPOSIT.toString())
      )
      .accounts({
        factory: factoryPda,
        assetVault: goldVaultPda,
        shareMint: goldShareMint,
        vaultTokenAccount: goldVaultToken,
        assetMint: goldMint,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log(`GOLD vault registered ✓  share_mint=${goldShareMint.toBase58()}`);
  }

  // ── 6. Register SILVER vault ──────────────────────────────────────────────
  const [silverVaultPda] = deriveVaultPda(silverMint);
  const [silverShareMint] = deriveShareMintPda(silverMint);
  const [silverVaultToken] = deriveVaultTokenPda(silverMint);

  if (await accountExists(connection, silverVaultPda)) {
    console.log("SILVER vault already registered — skipping.");
  } else {
    const silverTicker = strToBytes("SILVER\0\0", 8);
    await (program.methods as any)
      .registerAsset(
        silverTicker,
        new anchor.BN(SILVER_INITIAL_NAV_BPS.toString()),
        new anchor.BN(MIN_DEPOSIT.toString()),
        new anchor.BN(MAX_DEPOSIT.toString())
      )
      .accounts({
        factory: factoryPda,
        assetVault: silverVaultPda,
        shareMint: silverShareMint,
        vaultTokenAccount: silverVaultToken,
        assetMint: silverMint,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    console.log(`SILVER vault registered ✓  share_mint=${silverShareMint.toBase58()}`);
  }

  // ── 7. Airdrop mock tokens to authority ───────────────────────────────────
  console.log("\n── Step 4: Airdrop mock tokens to authority wallet ──────");

  const authorityGoldAta = await getOrCreateAssociatedTokenAccount(
    connection, authority, goldMint, authority.publicKey
  );
  await mintTo(
    connection, authority, goldMint,
    authorityGoldAta.address, authority, GOLD_AIRDROP
  );
  console.log(`Minted ${Number(GOLD_AIRDROP) / 1e6} GOLD-mock to authority ✓`);

  const authoritySilverAta = await getOrCreateAssociatedTokenAccount(
    connection, authority, silverMint, authority.publicKey
  );
  await mintTo(
    connection, authority, silverMint,
    authoritySilverAta.address, authority, SILVER_AIRDROP
  );
  console.log(`Minted ${Number(SILVER_AIRDROP) / 1e6} SILVER-mock to authority ✓`);

  // ── 8. Issue demo credential for authority wallet ─────────────────────────
  console.log("\n── Step 5: Issue demo compliance credential ─────────────");

  const [credentialPda] = deriveCredentialPda(authority.publicKey);

  if (await accountExists(connection, credentialPda)) {
    console.log("Credential already exists — skipping.");
  } else {
    const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    await (program.methods as any)
      .issueCredential(
        strToBytes("Oragami Demo Institution", 64),
        strToBytes("CH\0\0", 4),
        3,          // tier: institutional
        3,          // kyc_level: full
        95,         // aml_coverage: 95/100
        new anchor.BN(expiresAt)
      )
      .accounts({
        factory: factoryPda,
        credential: credentialPda,
        wallet: authority.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`Credential issued ✓  pda=${credentialPda.toBase58()}`);
  }

  // ── 9. Write deployment manifest ──────────────────────────────────────────
  const manifest = {
    network: "devnet",
    programId: PROGRAM_ID.toBase58(),
    authority: authority.publicKey.toBase58(),
    factoryPda: factoryPda.toBase58(),
    goldMint: goldMint.toBase58(),
    goldVaultPda: goldVaultPda.toBase58(),
    goldShareMint: goldShareMint.toBase58(),
    goldVaultTokenAccount: goldVaultToken.toBase58(),
    silverMint: silverMint.toBase58(),
    silverVaultPda: silverVaultPda.toBase58(),
    silverShareMint: silverShareMint.toBase58(),
    silverVaultTokenAccount: silverVaultToken.toBase58(),
    credentialPda: credentialPda.toBase58(),
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║                 Deployment Manifest                 ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`\nManifest saved to: ${manifestPath}`);
  console.log("\n✓ Setup complete. Copy the manifest addresses into your .env.local\n");
}

main().catch((err) => {
  console.error("\n✗ Setup failed:", err);
  process.exit(1);
});
