import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN, Idl } from '@coral-xyz/anchor';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import idl from './multi_asset_vault.idl.json';

// Seeds — must match the Rust contract exactly
const FACTORY_SEED = Buffer.from('factory');
const ASSET_VAULT_SEED = Buffer.from('vault');
const SHARE_MINT_SEED = Buffer.from('share_mint');
const VAULT_TOKEN_SEED = Buffer.from('vault_token');
const CREDENTIAL_SEED = Buffer.from('credential');
const TRAVEL_RULE_SEED = Buffer.from('travel_rule');
// Credentials are issued by oragami-vault (ihUcHpWk...) — one onboarding flow gates both products
const ORAGAMI_VAULT_PROGRAM_ID = new PublicKey('ihUcHpWkfpeE6cH8ycusgyaqNMGGJj8krEyWox1m6aP');

export interface AssetVaultInfo {
  assetMint: string;
  shareMint: string;
  vaultTokenAccount: string;
  ticker: string;
  navPriceBps: string;
  navDisplay: string;
  totalDeposits: string;
  totalSupply: string;
  minDeposit: string;
  maxDeposit: string;
  travelRuleRequired: boolean;
  paused: boolean;
}

@Injectable()
export class MultiAssetVaultService implements OnModuleInit {
  private readonly logger = new Logger(MultiAssetVaultService.name);
  private program: Program;
  private authority: Keypair;
  private connection: Connection;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.config.get<string>('SOLANA_RPC_URL')!;
    const keypairJson = this.config.get<string>('VAULT_AUTHORITY_KEYPAIR')!;

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.authority = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(keypairJson)),
    );

    const provider = new AnchorProvider(
      this.connection,
      new Wallet(this.authority),
      { commitment: 'confirmed' },
    );

    this.program = new Program(idl as Idl, provider);
    this.logger.log(
      `MultiAssetVault initialized. Program: ${this.program.programId.toBase58()}`,
    );
  }

  // ─── PDA derivation ───────────────────────────────────────────────────────────

  deriveFactoryPda(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [FACTORY_SEED],
      this.program.programId,
    )[0];
  }

  deriveVaultPda(assetMint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [ASSET_VAULT_SEED, assetMint.toBuffer()],
      this.program.programId,
    )[0];
  }

  deriveShareMintPda(assetMint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [SHARE_MINT_SEED, assetMint.toBuffer()],
      this.program.programId,
    )[0];
  }

  deriveVaultTokenPda(assetMint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [VAULT_TOKEN_SEED, assetMint.toBuffer()],
      this.program.programId,
    )[0];
  }

  // Credential PDA is derived against oragami-vault program — one credential gates both products
  deriveCredentialPda(wallet: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [CREDENTIAL_SEED, wallet.toBuffer()],
      ORAGAMI_VAULT_PROGRAM_ID,
    )[0];
  }

  deriveTravelRulePda(payer: PublicKey, nonceHash: Buffer): PublicKey {
    return PublicKey.findProgramAddressSync(
      [TRAVEL_RULE_SEED, payer.toBuffer(), nonceHash],
      this.program.programId,
    )[0];
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private tickerFromBytes(bytes: number[]): string {
    return Buffer.from(bytes).toString('utf-8').replace(/\0/g, '').trim();
  }

  private navToDisplay(navBps: string): string {
    return `$${(Number(navBps) / 10_000).toFixed(4)}`;
  }

  private formatVault(raw: any): AssetVaultInfo {
    const navBps = raw.navPriceBps?.toString() ?? '10000';
    return {
      assetMint: raw.assetMint?.toBase58?.() ?? raw.assetMint,
      shareMint: raw.shareMint?.toBase58?.() ?? raw.shareMint,
      vaultTokenAccount: raw.vaultTokenAccount?.toBase58?.() ?? raw.vaultTokenAccount,
      ticker: this.tickerFromBytes(raw.ticker ?? []),
      navPriceBps: navBps,
      navDisplay: this.navToDisplay(navBps),
      totalDeposits: raw.totalDeposits?.toString() ?? '0',
      totalSupply: raw.totalSupply?.toString() ?? '0',
      minDeposit: raw.minDeposit?.toString() ?? '0',
      maxDeposit: raw.maxDeposit?.toString() ?? '0',
      travelRuleRequired: !!raw.travelRuleRequired,
      paused: !!raw.paused,
    };
  }

  private strToBytes(s: string, len: number): number[] {
    const buf = Buffer.alloc(len, 0);
    Buffer.from(s, 'utf-8').copy(buf);
    return Array.from(buf);
  }

  // ─── Factory ──────────────────────────────────────────────────────────────────

  async getFactory() {
    const factoryPda = this.deriveFactoryPda();
    try {
      const raw = await (this.program.account as any).factory.fetch(factoryPda);
      return {
        pda: factoryPda.toBase58(),
        authority: raw.authority?.toBase58?.() ?? raw.authority,
        feeBps: Number(raw.feeBps ?? 0),
        registeredAssets: (raw.registeredAssets ?? []).map((pk: PublicKey) =>
          pk.toBase58(),
        ),
      };
    } catch {
      throw new NotFoundException('Factory not initialized');
    }
  }

  // ─── Vaults ───────────────────────────────────────────────────────────────────

  async getAllVaults(): Promise<AssetVaultInfo[]> {
    const factory = await this.getFactory();
    const vaults = await Promise.all(
      factory.registeredAssets.map((mintStr: string) =>
        this.getVaultByMint(mintStr).catch(() => null),
      ),
    );
    return vaults.filter(Boolean) as AssetVaultInfo[];
  }

  async getVaultByMint(assetMintStr: string): Promise<AssetVaultInfo> {
    let assetMint: PublicKey;
    try {
      assetMint = new PublicKey(assetMintStr);
    } catch {
      throw new BadRequestException('Invalid asset mint address');
    }
    const vaultPda = this.deriveVaultPda(assetMint);
    try {
      const raw = await (this.program.account as any).assetVault.fetch(vaultPda);
      return this.formatVault(raw);
    } catch {
      throw new NotFoundException(`Vault not found for mint ${assetMintStr}`);
    }
  }

  // ─── NAV ──────────────────────────────────────────────────────────────────────

  async setNav(assetMintStr: string, navPriceBps: number): Promise<string> {
    if (!Number.isFinite(navPriceBps) || navPriceBps <= 0) {
      throw new BadRequestException('navPriceBps must be a positive integer');
    }
    const assetMint = new PublicKey(assetMintStr);
    const factoryPda = this.deriveFactoryPda();
    const vaultPda = this.deriveVaultPda(assetMint);

    const tx = await (this.program.methods as any)
      .setNav(new BN(navPriceBps))
      .accounts({ factory: factoryPda, assetVault: vaultPda, authority: this.authority.publicKey })
      .rpc();

    this.logger.log(`set_nav: mint=${assetMintStr} nav=${navPriceBps} bps tx=${tx}`);
    return tx;
  }

  // ─── Credentials ──────────────────────────────────────────────────────────────

  async verifyCredential(walletStr: string) {
    let wallet: PublicKey;
    try {
      wallet = new PublicKey(walletStr);
    } catch {
      throw new BadRequestException('Invalid wallet address');
    }

    const credPda = this.deriveCredentialPda(wallet);
    try {
      const raw = await (this.program.account as any).complianceCredential.fetch(credPda);
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = Number(raw.expiresAt?.toString?.() ?? raw.expiresAt ?? 0);
      const status = Number(raw.status ?? 0);
      const isActive = status === 1 && expiresAt > now;

      return {
        wallet: walletStr,
        credentialPda: credPda.toBase58(),
        status: status === 3 ? 'revoked' : expiresAt < now ? 'expired' : status === 1 ? 'active' : 'pending',
        tier: Number(raw.tier ?? 0),
        kycLevel: Number(raw.kycLevel ?? 0),
        amlCoverage: Number(raw.amlCoverage ?? 0),
        jurisdiction: Buffer.from(raw.jurisdiction ?? []).toString('utf-8').replace(/\0/g, ''),
        issuedAt: new Date(Number(raw.issuedAt?.toString?.() ?? 0) * 1000).toISOString(),
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        canDeposit: isActive,
      };
    } catch {
      return {
        wallet: walletStr,
        credentialPda: credPda.toBase58(),
        status: 'not_found',
        canDeposit: false,
      };
    }
  }

  async issueCredential(
    walletStr: string,
    institutionName: string,
    jurisdiction: string,
    tier: number,
    kycLevel: number,
    amlCoverage: number,
    expiresAt: string,
  ) {
    let wallet: PublicKey;
    try {
      wallet = new PublicKey(walletStr);
    } catch {
      throw new BadRequestException('Invalid wallet address');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAtSec = Math.floor(new Date(expiresAt).getTime() / 1000);
    if (expiresAtSec <= now) {
      throw new BadRequestException('expiresAt must be in the future');
    }

    const factoryPda = this.deriveFactoryPda();
    const credPda = this.deriveCredentialPda(wallet);

    const tx = await (this.program.methods as any)
      .issueCredential(
        this.strToBytes(institutionName, 64),
        this.strToBytes(jurisdiction.padEnd(4, '\0'), 4),
        tier,
        kycLevel,
        amlCoverage,
        new BN(expiresAtSec),
      )
      .accounts({
        factory: factoryPda,
        credential: credPda,
        wallet,
        authority: this.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    this.logger.log(`Credential issued: wallet=${walletStr} tx=${tx}`);
    return { success: true, credentialPda: credPda.toBase58(), txSignature: tx };
  }

  // ─── Faucet ───────────────────────────────────────────────────────────────────

  async faucet(walletStr: string, assetMintStr: string, amount = 1_000_000_000) {
    let wallet: PublicKey;
    let assetMint: PublicKey;
    try {
      wallet = new PublicKey(walletStr);
      assetMint = new PublicKey(assetMintStr);
    } catch {
      throw new BadRequestException('Invalid wallet or mint address');
    }

    const ata = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.authority,
      assetMint,
      wallet,
    );

    const tx = await mintTo(
      this.connection,
      this.authority,
      assetMint,
      ata.address,
      this.authority,
      BigInt(amount),
    );

    this.logger.log(`Faucet: minted ${amount} to ${walletStr} ata=${ata.address.toBase58()} tx=${tx}`);
    return { success: true, ata: ata.address.toBase58(), amount, txSignature: tx };
  }

  // ─── Preflight ────────────────────────────────────────────────────────────────

  async preflightDeposit(walletStr: string, assetMintStr: string, amount: string) {
    const [cred, vault] = await Promise.all([
      this.verifyCredential(walletStr),
      this.getVaultByMint(assetMintStr),
    ]);

    const amountBn = BigInt(amount);
    const navBps = BigInt(vault.navPriceBps);
    const estimatedShares = (amountBn * BigInt(10_000)) / navBps;

    const canDeposit =
      cred.canDeposit &&
      !vault.paused &&
      amountBn >= BigInt(vault.minDeposit) &&
      amountBn <= BigInt(vault.maxDeposit);

    const TRAVEL_RULE_THRESHOLD = 1_000_000_000n;
    const requiresTravelRule =
      vault.travelRuleRequired && amountBn >= TRAVEL_RULE_THRESHOLD;

    let reason: string | undefined;
    if (!cred.canDeposit) reason = `Credential ${cred.status}`;
    else if (vault.paused) reason = 'Vault is paused';
    else if (amountBn < BigInt(vault.minDeposit)) reason = `Below minimum deposit`;
    else if (amountBn > BigInt(vault.maxDeposit)) reason = `Exceeds maximum deposit`;

    return {
      canDeposit,
      reason,
      requiresTravelRule,
      credentialStatus: cred.status,
      vault: {
        ticker: vault.ticker,
        navPriceBps: vault.navPriceBps,
        navDisplay: vault.navDisplay,
        paused: vault.paused,
        travelRuleRequired: vault.travelRuleRequired,
      },
      estimatedShares: estimatedShares.toString(),
    };
  }
}
