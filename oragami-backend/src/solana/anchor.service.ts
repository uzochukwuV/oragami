import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  Keypair,
  PublicKey,
  ConfirmOptions,
  Transaction,
} from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import idl from './oragami_vault.idl.json';
import type { OragamiVault } from './oragami_vault.types';

const VAULT_STATE_SEED = Buffer.from('vault_state');
const CREDENTIAL_SEED = Buffer.from('credential');
const TRAVEL_RULE_SEED = Buffer.from('travel_rule');

@Injectable()
export class AnchorService implements OnModuleInit {
  private readonly logger = new Logger(AnchorService.name);
  private connection: Connection;
  private program: Program<OragamiVault>;
  private authority: Keypair;
  private provider: AnchorProvider;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const rpcUrl = this.configService.get<string>('SOLANA_RPC_URL')!;
    const programId = new PublicKey(
      this.configService.get<string>('VAULT_PROGRAM_ID')!,
    );
    const keypairJson = this.configService.get<string>(
      'VAULT_AUTHORITY_KEYPAIR',
    )!;

    this.connection = new Connection(rpcUrl, 'confirmed');

    // Parse keypair from JSON array or base58 string
    let secretKey: Uint8Array;
    try {
      const parsed = JSON.parse(keypairJson);
      if (Array.isArray(parsed)) {
        secretKey = Uint8Array.from(parsed);
      } else {
        throw new Error('Keypair must be JSON array');
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === 'Keypair must be JSON array'
      ) {
        throw err;
      }
      throw new Error('Failed to parse VAULT_AUTHORITY_KEYPAIR');
    }

    this.authority = Keypair.fromSecretKey(secretKey);

    const opts: ConfirmOptions = {
      preflightCommitment: 'confirmed',
      commitment: 'confirmed',
    };

    this.provider = new AnchorProvider(
      this.connection,
      new Wallet(this.authority),
      opts,
    );

    this.program = new Program(idl as any, this.provider);

    this.logger.log(
      `Initialized: program=${programId.toBase58()}, authority=${this.authority.publicKey.toBase58()}`,
    );
  }

  getProgram(): Program<OragamiVault> {
    return this.program;
  }

  getConnection(): Connection {
    return this.connection;
  }

  getAuthority(): Keypair {
    return this.authority;
  }

  async confirmTx(signature: string, maxRetries = 3): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const confirmed = await this.connection.confirmTransaction(
          signature,
          'confirmed',
        );
        if (confirmed.value.err) {
          throw new Error(`Transaction failed: ${confirmed.value.err}`);
        }
        return;
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  deriveVaultStatePda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [VAULT_STATE_SEED],
      this.program.programId,
    );
  }

  deriveCredentialPda(wallet: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [CREDENTIAL_SEED, wallet.toBuffer()],
      this.program.programId,
    );
  }

  deriveTravelRulePda(
    payer: PublicKey,
    nonceHash: Uint8Array,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [TRAVEL_RULE_SEED, payer.toBuffer(), nonceHash],
      this.program.programId,
    );
  }

  async readVaultState(): Promise<any> {
    const [vaultStatePda] = this.deriveVaultStatePda();
    return await (this.program.account as any).vaultState.fetch(vaultStatePda);
  }

  async readCredential(wallet: PublicKey): Promise<any> {
    const [credentialPda] = this.deriveCredentialPda(wallet);
    return await (this.program.account as any).complianceCredential.fetch(
      credentialPda,
    );
  }

  async readTravelRule(payer: PublicKey, nonceHash: Uint8Array): Promise<any> {
    const [travelRulePda] = this.deriveTravelRulePda(payer, nonceHash);
    return await (this.program.account as any).travelRuleData.fetch(
      travelRulePda,
    );
  }
}
