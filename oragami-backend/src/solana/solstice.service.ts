/**
 * Solstice USX integration — HTTP Instructions API (see repo SOLSTICE.md).
 * There is no public npm SDK; this mirrors the reference implementation at the bottom of SOLSTICE.md.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  AccountMeta,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
} from '@solana/spl-token';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AnchorService } from './anchor.service';

const execFileAsync = promisify(execFile);

export interface SolanaInstruction {
  programId: PublicKey;
  keys: AccountMeta[];
  data: Buffer;
}

interface SolsticeInstructionRequest {
  type:
    | 'RequestMint'
    | 'ConfirmMint'
    | 'CancelMint'
    | 'RequestRedeem'
    | 'ConfirmRedeem'
    | 'CancelRedeem'
    | 'Lock'
    | 'Unlock'
    | 'Withdraw';
  data: Record<string, unknown>;
}

interface SolsticeInstructionResponse {
  instruction: {
    program_id: number[];
    accounts: Array<{
      pubkey: number[];
      is_signer: boolean;
      is_writable: boolean;
    }>;
    data: number[];
  };
}

export type CollateralKind = 'usdc' | 'usdt';

export interface YieldInfo {
  eusxPriceInUsx: number;
  totalAssets: bigint;
  totalShares: bigint;
}

export interface VaultYieldPosition {
  eusxBalance: bigint;
  usxValue: bigint;
}

@Injectable()
export class SolsticeService implements OnModuleInit {
  private readonly logger = new Logger(SolsticeService.name);
  private connection!: Connection;
  private authority!: Keypair;

  private apiKey = '';
  private apiUrl = 'https://instructions.solstice.finance';

  /** Devnet mint addresses (overridable via env — see SOLSTICE.md) */
  readonly mints = {
    usdc: '8iBux2LRja1PhVZph8Rw4Hi45pgkaufNEiaZma5nTD5g',
    usdt: '5dXXpWyZCCPhBHxmp79Du81t7t9oh7HacUW864ARFyft',
    usx: '7QC4zjrKA6XygpXPQCKSS9BmAsEFDJR6awiHSdgLcDvS',
    eusx: 'Gkt9h4QWpPBDtbaF5HvYKCc87H5WCRTUtMf77HdTGHBt',
  };

  private cachedEusxNav: { value: number; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    private readonly config: ConfigService,
    private readonly anchor: AnchorService,
  ) {}

  onModuleInit() {
    this.connection = this.anchor.getConnection();
    this.authority = this.anchor.getAuthority();

    this.apiKey = this.config.get<string>('SOLSTICE_API_KEY') ?? '';
    this.apiUrl =
      this.config.get<string>('SOLSTICE_API_URL') ??
      'https://instructions.solstice.finance';

    const usx = this.config.get<string>('SOLSTICE_USX_MINT');
    const eusx = this.config.get<string>('SOLSTICE_EUSX_MINT');
    const usdc = this.config.get<string>('SOLSTICE_USDC_MINT');
    const usdt = this.config.get<string>('SOLSTICE_USDT_MINT');
    if (usx) this.mints.usx = usx;
    if (eusx) this.mints.eusx = eusx;
    if (usdc) this.mints.usdc = usdc;
    if (usdt) this.mints.usdt = usdt;

    if (!this.apiKey) {
      this.logger.warn(
        'SOLSTICE_API_KEY not set; Solstice Instructions API calls will fail',
      );
    }
    this.logger.log(`Solstice service initialized. API URL: ${this.apiUrl}`);
  }

  private userWallet(): string {
    return this.authority.publicKey.toBase58();
  }

  private toTxInstruction(s: SolanaInstruction): TransactionInstruction {
    return new TransactionInstruction({
      programId: s.programId,
      keys: s.keys,
      data: s.data,
    });
  }

  private toSolanaInstruction(
    instructionData: SolsticeInstructionResponse['instruction'],
    _userWallet: string,
  ): SolanaInstruction {
    const programId = new PublicKey(Buffer.from(instructionData.program_id));
    const keys: AccountMeta[] = instructionData.accounts.map((acc) => ({
      pubkey: new PublicKey(Buffer.from(acc.pubkey)),
      isSigner: acc.is_signer,
      isWritable: acc.is_writable,
    }));
    const data = Buffer.from(instructionData.data);
    return { programId, keys, data };
  }

  private toSolanaInstructionFromWeb3(inst: {
    programId: PublicKey;
    keys: AccountMeta[];
    data: Buffer;
  }): SolanaInstruction {
    return {
      programId: inst.programId,
      keys: inst.keys,
      data: inst.data,
    };
  }

  private async fetchInstructionFromApi(
    request: SolsticeInstructionRequest,
  ): Promise<SolsticeInstructionResponse> {
    try {
      this.logger.debug(`[fetchInstructionFromApi] type=${request.type}`);

      const response = await fetch(`${this.apiUrl}/v1/instructions`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `[fetchInstructionFromApi] ${response.status}: ${errorText}`,
        );
        throw new BadRequestException({
          message: `Failed to fetch Solstice instruction: ${request.type}`,
          requestType: request.type,
          upstreamStatus: response.status,
          upstreamError: errorText,
        });
      }

      return (await response.json()) as SolsticeInstructionResponse;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isNetworkFetchFailure =
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('EAI_AGAIN');

      if (isNetworkFetchFailure) {
        this.logger.warn(
          `[fetchInstructionFromApi] fetch failed for ${request.type}, trying curl`,
        );
        return this.fetchInstructionFromApiViaCurl(request);
      }

      if (error instanceof BadRequestException) throw error;

      this.logger.error(
        `Solstice API error (${request.type}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException({
        message: `Failed to fetch Solstice instruction: ${request.type}`,
        requestType: request.type,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async fetchInstructionFromApiViaCurl(
    request: SolsticeInstructionRequest,
  ): Promise<SolsticeInstructionResponse> {
    const endpoint = `${this.apiUrl}/v1/instructions`;
    const args = [
      '-sS',
      '--max-time',
      '25',
      '-X',
      'POST',
      endpoint,
      '-H',
      `x-api-key: ${this.apiKey}`,
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify(request),
      '-w',
      '\n%{http_code}',
    ];

    try {
      const { stdout } = await execFileAsync('curl', args, {
        maxBuffer: 1024 * 1024,
      });

      const trimmed = stdout.trimEnd();
      const newlineIndex = trimmed.lastIndexOf('\n');
      const body = newlineIndex >= 0 ? trimmed.slice(0, newlineIndex) : '';
      const statusText =
        newlineIndex >= 0 ? trimmed.slice(newlineIndex + 1) : trimmed;
      const status = Number(statusText);

      if (!Number.isFinite(status)) {
        throw new Error(`Unable to parse curl HTTP status: ${statusText}`);
      }

      if (status < 200 || status >= 300) {
        throw new BadRequestException({
          message: `Failed to fetch Solstice instruction: ${request.type}`,
          requestType: request.type,
          upstreamStatus: status,
          upstreamError: body,
          transport: 'curl',
        });
      }

      return JSON.parse(body) as SolsticeInstructionResponse;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        message: `Failed to fetch Solstice instruction: ${request.type}`,
        requestType: request.type,
        cause: error instanceof Error ? error.message : String(error),
        transport: 'curl',
      });
    }
  }

  async buildMintInstruction(
    user: string,
    amount: number,
    collateral: CollateralKind = 'usdc',
    payerWallet?: string,
  ): Promise<SolanaInstruction> {
    const request: SolsticeInstructionRequest = {
      type: 'RequestMint',
      data: {
        user,
        amount,
        collateral,
        ...(payerWallet && { payer: payerWallet }),
      },
    };
    const data = await this.fetchInstructionFromApi(request);
    return this.toSolanaInstruction(data.instruction, user);
  }

  async buildConfirmMintInstruction(
    user: string,
    collateral: CollateralKind = 'usdc',
    usxAccount?: string,
    payerWallet?: string,
  ): Promise<SolanaInstruction> {
    const request: SolsticeInstructionRequest = {
      type: 'ConfirmMint',
      data: {
        user,
        collateral,
        ...(usxAccount && { usx_account: usxAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };
    const data = await this.fetchInstructionFromApi(request);
    return this.toSolanaInstruction(data.instruction, user);
  }

  async buildLockInstruction(
    user: string,
    amount: number,
    usxAccount?: string,
    eusxAccount?: string,
    payerWallet?: string,
  ): Promise<SolanaInstruction> {
    const request: SolsticeInstructionRequest = {
      type: 'Lock',
      data: {
        user,
        amount,
        ...(usxAccount && { usx_account: usxAccount }),
        ...(eusxAccount && { eusx_account: eusxAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };
    const data = await this.fetchInstructionFromApi(request);
    return this.toSolanaInstruction(data.instruction, user);
  }

  /**
   * Ensure USX and eUSX ATAs exist for the vault authority (payer = authority).
   */
  private ataPreflightInstructions(): SolanaInstruction[] {
    const user = this.authority.publicKey;
    const usxMint = new PublicKey(this.mints.usx);
    const eusxMint = new PublicKey(this.mints.eusx);
    const usxAta = getAssociatedTokenAddressSync(usxMint, user);
    const eusxAta = getAssociatedTokenAddressSync(eusxMint, user);
    return [
      this.toSolanaInstructionFromWeb3(
        createAssociatedTokenAccountIdempotentInstruction(
          user,
          usxAta,
          user,
          usxMint,
        ),
      ),
      this.toSolanaInstructionFromWeb3(
        createAssociatedTokenAccountIdempotentInstruction(
          user,
          eusxAta,
          user,
          eusxMint,
        ),
      ),
    ];
  }

  private async sendInstructions(
    label: string,
    solInstructions: SolanaInstruction[],
  ): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({
      feePayer: this.authority.publicKey,
      recentBlockhash: blockhash,
    });
    for (const s of solInstructions) {
      tx.add(this.toTxInstruction(s));
    }
    tx.sign(this.authority);
    const raw = tx.serialize();
    const sig = await this.connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await this.connection.confirmTransaction(
      {
        signature: sig,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed',
    );
    this.logger.log(`[${label}] confirmed tx ${sig}`);
    return sig;
  }

  /**
   * USDC → USX: RequestMint then ConfirmMint (vault authority wallet).
   * `usdcAmount` is in USDC smallest units (6 decimals).
   */
  async mintUsx(usdcAmount: bigint): Promise<string> {
    if (usdcAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException('usdcAmount exceeds safe integer range');
    }
    const amount = Number(usdcAmount);
    const user = this.userWallet();
    const payer = user;

    const atas = this.ataPreflightInstructions();
    const reqMint = await this.buildMintInstruction(
      user,
      amount,
      'usdc',
      payer,
    );
    const confMint = await this.buildConfirmMintInstruction(
      user,
      'usdc',
      undefined,
      payer,
    );

    return this.sendInstructions('mintUsx', [...atas, reqMint, confMint]);
  }

  /**
   * USX → eUSX: Lock (vault authority).
   * `usxAmount` in USX smallest units.
   */
  async lockUsxForYield(usxAmount: bigint): Promise<string> {
    if (usxAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException('usxAmount exceeds safe integer range');
    }
    const amount = Number(usxAmount);
    const user = this.userWallet();
    const lock = await this.buildLockInstruction(
      user,
      amount,
      undefined,
      undefined,
      user,
    );
    return this.sendInstructions('lockUsxForYield', [lock]);
  }

  /**
   * eUSX price in USX. Cached 60s.
   * Prefer optional on-chain reserve ratio (env); else 1.0 (see SOLSTICE.md — no HTTP yield quote).
   */
  async getEusxNav(): Promise<number> {
    const now = Date.now();
    if (
      this.cachedEusxNav &&
      now - this.cachedEusxNav.timestamp < this.CACHE_TTL_MS
    ) {
      return this.cachedEusxNav.value;
    }

    const override = this.config.get<string>('SOLSTICE_EUSX_NAV_OVERRIDE');
    if (override !== undefined && override !== '') {
      const v = Number(override);
      if (!Number.isFinite(v) || v <= 0) {
        this.logger.warn('SOLSTICE_EUSX_NAV_OVERRIDE invalid; using fallback');
      } else {
        this.cachedEusxNav = { value: v, timestamp: now };
        return v;
      }
    }

    const reservePk = this.config.get<string>(
      'SOLSTICE_YIELD_RESERVE_USX_ACCOUNT',
    );
    if (reservePk) {
      try {
        const reserve = await getAccount(
          this.connection,
          new PublicKey(reservePk),
        );
        const eusxMintInfo = await getMint(
          this.connection,
          new PublicKey(this.mints.eusx),
        );
        const supply = eusxMintInfo.supply;
        if (supply > 0n) {
          const nav = Number(reserve.amount) / Number(supply);
          if (Number.isFinite(nav) && nav > 0) {
            this.cachedEusxNav = { value: nav, timestamp: now };
            return nav;
          }
        }
      } catch (e) {
        this.logger.warn(
          `getEusxNav reserve read failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    const fallback = 1.0;
    this.logger.warn(
      'getEusxNav: no reserve account configured and no override set; using fallback NAV=1.0',
    );
    this.cachedEusxNav = { value: fallback, timestamp: now };
    return fallback;
  }

  /**
   * Vault authority's eUSX ATA balance × NAV.
   */
  async getVaultYieldPosition(): Promise<VaultYieldPosition> {
    const eusxMint = new PublicKey(this.mints.eusx);
    const ata = getAssociatedTokenAddressSync(
      eusxMint,
      this.authority.publicKey,
    );
    let eusxBalance = 0n;
    try {
      const acc = await getAccount(this.connection, ata);
      eusxBalance = acc.amount;
    } catch {
      this.logger.debug('No eUSX ATA or zero balance');
    }
    const nav = await this.getEusxNav();
    const usxValue = BigInt(Math.floor(Number(eusxBalance) * nav));
    return { eusxBalance, usxValue };
  }

  async getYieldInfo(): Promise<YieldInfo> {
    const eusxNav = await this.getEusxNav();
    try {
      const eusxMintInfo = await getMint(
        this.connection,
        new PublicKey(this.mints.eusx),
      );
      const totalShares = eusxMintInfo.supply;
      const approxAssets = BigInt(Math.floor(Number(totalShares) * eusxNav));
      return {
        eusxPriceInUsx: eusxNav,
        totalAssets: approxAssets,
        totalShares,
      };
    } catch (e) {
      this.logger.warn(
        `getYieldInfo mint read failed: ${e instanceof Error ? e.message : e}`,
      );
      return {
        eusxPriceInUsx: eusxNav,
        totalAssets: 0n,
        totalShares: 0n,
      };
    }
  }
}
