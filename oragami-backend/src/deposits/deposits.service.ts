import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';

const TRAVEL_RULE_THRESHOLD = 1_000_000_000n; // 1000 USDC (6 dp)

const ONCHAIN_ACTIVE = 1;

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
  ) {}

  async preflight(dto: import('./dto/preflight.dto').PreflightDto) {
    const amount = BigInt(dto.usdcAmount);
    const walletPk = new PublicKey(dto.wallet);

    let credentialStatus = 'unknown';
    try {
      const c = await this.anchor.readCredential(walletPk);
      const st = Number(c.status);
      credentialStatus =
        st === ONCHAIN_ACTIVE ? 'active' : `onchain_${st}`;
    } catch {
      const row = await this.prisma.institution.findUnique({
        where: { walletAddress: dto.wallet },
      });
      credentialStatus = row?.credentialStatus ?? 'not_found';
    }

    const requiresTravelRule = amount >= TRAVEL_RULE_THRESHOLD;

    const vault = await this.anchor.readVaultState();
    const navBps = BigInt(vault.navPriceBps?.toString?.() ?? vault.navPriceBps ?? 0);
    if (navBps <= 0n) {
      throw new BadRequestException('Vault NAV is zero or unreadable');
    }

    let canDeposit = credentialStatus === 'active';
    let reason: string | undefined;

    if (!canDeposit) {
      reason = 'Credential is not active on-chain';
    }
    if (vault.paused) {
      canDeposit = false;
      reason = 'Vault is paused';
    }

    const estimatedCvault = ((amount * 10_000n) / navBps).toString();

    return {
      canDeposit,
      reason,
      requiresTravelRule,
      credentialStatus,
      currentNav: Number(navBps),
      estimatedCvault,
    };
  }

  async index(dto: import('./dto/index-deposit.dto').IndexDepositDto) {
    const conn = this.anchor.getConnection();
    const parsed = await conn.getTransaction(dto.txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!parsed || parsed.meta?.err) {
      throw new BadRequestException('Transaction not found or failed on-chain');
    }

    const institution = await this.prisma.institution.findUnique({
      where: { walletAddress: dto.wallet },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found for wallet');
    }

    const usdcAmount = BigInt(dto.usdcAmount);
    const cvaultAmount = BigInt(dto.cvaultAmount);
    const vault = await this.anchor.readVaultState();
    const navAtDeposit = BigInt(
      vault.navPriceBps?.toString?.() ?? vault.navPriceBps ?? 0,
    );

    let travelRuleId: string | undefined;
    const trHash = dto.travelRuleNonceHash ?? dto.nonce;
    if (trHash && trHash.length === 64) {
      const tr = await this.prisma.travelRule.findUnique({
        where: { nonceHash: trHash.toLowerCase() },
      });
      if (tr) travelRuleId = tr.id;
    }

    const deposit = await this.prisma.deposit.create({
      data: {
        txSignature: dto.txSignature,
        institutionId: institution.id,
        usdcAmount,
        cvaultAmount,
        navAtDeposit,
        nonce: dto.nonce,
        travelRuleId,
        timestamp: new Date(),
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        institutionId: institution.id,
        actor: dto.wallet,
        role: 'institution',
        action: 'deposit',
        result: 'indexed',
        txSignature: dto.txSignature,
        metadata: { depositId: deposit.id },
      },
    });

    return { success: true, depositId: deposit.id };
  }

  async listAll() {
    return this.prisma.deposit.findMany({
      orderBy: { createdAt: 'desc' },
      include: { institution: true, travelRule: true },
    });
  }

  async listByInstitutionWallet(wallet: string) {
    const inst = await this.prisma.institution.findUnique({
      where: { walletAddress: wallet },
    });
    if (!inst) throw new NotFoundException('Institution not found');
    return this.prisma.deposit.findMany({
      where: { institutionId: inst.id },
      orderBy: { createdAt: 'desc' },
      include: { travelRule: true },
    });
  }
}
