import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import {
  jurisdictionToBytes,
  sha256Hex,
  strToBytes64,
} from '../common/encoding';

/** On-chain ComplianceCredential.status (u8) — align with program enum order. */
const ONCHAIN_CREDENTIAL_STATUS = {
  PENDING: 0,
  ACTIVE: 1,
  RESTRICTED: 2,
  REVOKED: 3,
} as const;

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
  ) {}

  private attestationHashFromDto(dto: {
    wallet: string;
    institutionName: string;
    jurisdiction: string;
    tier: number;
    kycLevel: number;
    amlScore: number;
    expiresAt: string;
  }): number[] {
    const canonical = JSON.stringify({
      wallet: dto.wallet,
      institutionName: dto.institutionName,
      jurisdiction: dto.jurisdiction,
      tier: dto.tier,
      kycLevel: dto.kycLevel,
      amlScore: dto.amlScore,
      expiresAt: dto.expiresAt,
    });
    return [...sha256Hex(canonical)];
  }

  async issue(dto: import('./dto/issue-credential.dto').IssueCredentialDto) {
    const walletPk = new PublicKey(dto.wallet);
    const [credentialPda] = this.anchor.deriveCredentialPda(walletPk);
    const [vaultStatePda] = this.anchor.deriveVaultStatePda();

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = Math.floor(new Date(dto.expiresAt).getTime() / 1000);
    if (!Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
      throw new BadRequestException('expiresAt must be a future ISO datetime');
    }

    const attestationHash = this.attestationHashFromDto(dto);
    const program = this.anchor.getProgram() as any;

    const params = {
      wallet: walletPk,
      institutionName: strToBytes64(dto.institutionName),
      jurisdiction: jurisdictionToBytes(dto.jurisdiction),
      tier: dto.tier,
      kycLevel: dto.kycLevel,
      amlCoverage: Math.min(255, Math.max(0, dto.amlScore)),
      attestationHash,
      issuedAt: new BN(issuedAt),
      expiresAt: new BN(expiresAt),
    };

    const txSignature = await program.methods
      .issueCredential(params)
      .accounts({
        credential: credentialPda,
        vaultState: vaultStatePda,
        authority: this.anchor.getAuthority().publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await this.prisma.institution.upsert({
      where: { walletAddress: dto.wallet },
      create: {
        walletAddress: dto.wallet,
        name: dto.institutionName,
        jurisdiction: dto.jurisdiction.slice(0, 2),
        tier: dto.tier,
        kycLevel: dto.kycLevel,
        amlScore: dto.amlScore,
        credentialPda: credentialPda.toBase58(),
        credentialStatus: 'active',
        credentialIssuedAt: new Date(issuedAt * 1000),
        credentialExpiresAt: new Date(expiresAt * 1000),
        attestationHash: Buffer.from(attestationHash).toString('hex'),
      },
      update: {
        name: dto.institutionName,
        jurisdiction: dto.jurisdiction.slice(0, 2),
        tier: dto.tier,
        kycLevel: dto.kycLevel,
        amlScore: dto.amlScore,
        credentialPda: credentialPda.toBase58(),
        credentialStatus: 'active',
        credentialIssuedAt: new Date(issuedAt * 1000),
        credentialExpiresAt: new Date(expiresAt * 1000),
        attestationHash: Buffer.from(attestationHash).toString('hex'),
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        actor: this.anchor.getAuthority().publicKey.toBase58(),
        role: 'admin',
        action: 'issue_credential',
        result: 'success',
        txSignature,
        metadata: { wallet: dto.wallet },
      },
    });

    return {
      success: true,
      credentialPda: credentialPda.toBase58(),
      txSignature,
    };
  }

  async listAll() {
    return this.prisma.institution.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByWallet(wallet: string) {
    const row = await this.prisma.institution.findUnique({
      where: { walletAddress: wallet },
    });
    if (!row) throw new NotFoundException('Institution not found');
    return row;
  }

  async revoke(wallet: string) {
    const walletPk = new PublicKey(wallet);
    const [credentialPda] = this.anchor.deriveCredentialPda(walletPk);
    const [vaultStatePda] = this.anchor.deriveVaultStatePda();
    const program = this.anchor.getProgram() as any;

    const txSignature = await program.methods
      .revokeCredential()
      .accounts({
        credential: credentialPda,
        vaultState: vaultStatePda,
        authority: this.anchor.getAuthority().publicKey,
      })
      .rpc();

    await this.prisma.institution.updateMany({
      where: { walletAddress: wallet },
      data: { credentialStatus: 'revoked' },
    });

    await this.prisma.auditEvent.create({
      data: {
        actor: this.anchor.getAuthority().publicKey.toBase58(),
        role: 'admin',
        action: 'revoke_credential',
        result: 'success',
        txSignature,
        metadata: { wallet },
      },
    });

    return { success: true, txSignature };
  }

  async verify(wallet: string) {
    const walletPk = new PublicKey(wallet);
    let chain: any;
    try {
      chain = await this.anchor.readCredential(walletPk);
    } catch {
      const row = await this.prisma.institution.findUnique({
        where: { walletAddress: wallet },
      });
      if (!row) {
        return {
          wallet,
          status: 'not_found' as const,
          tier: 0,
          expiresAt: new Date(0).toISOString(),
          requiresTravelRule: true,
        };
      }
      const dbStatus = row.credentialStatus;
      if (dbStatus === 'revoked') {
        return {
          wallet,
          status: 'revoked' as const,
          tier: row.tier,
          expiresAt: row.credentialExpiresAt?.toISOString() ?? '',
          requiresTravelRule: true,
        };
      }
      return {
        wallet,
        status: 'not_found' as const,
        tier: row.tier,
        expiresAt: row.credentialExpiresAt?.toISOString() ?? '',
        requiresTravelRule: true,
      };
    }

    const statusByte = Number(chain.status ?? 0);
    const expBn = chain.expiresAt ?? chain.expires_at;
    const expiresAtSec =
      expBn && typeof expBn === 'object' && 'toNumber' in expBn
        ? (expBn as { toNumber: () => number }).toNumber()
        : Number(expBn ?? 0);
    const expiresAt = new Date(expiresAtSec * 1000);
    const tier = Number(chain.tier ?? 0);
    const now = Date.now() / 1000;

    if (statusByte === ONCHAIN_CREDENTIAL_STATUS.REVOKED) {
      return {
        wallet,
        status: 'revoked' as const,
        tier,
        expiresAt: expiresAt.toISOString(),
        requiresTravelRule: true,
      };
    }
    if (expiresAtSec < now) {
      return {
        wallet,
        status: 'expired' as const,
        tier,
        expiresAt: expiresAt.toISOString(),
        requiresTravelRule: true,
      };
    }
    if (statusByte === ONCHAIN_CREDENTIAL_STATUS.ACTIVE) {
      return {
        wallet,
        status: 'active' as const,
        tier,
        expiresAt: expiresAt.toISOString(),
        requiresTravelRule: true,
      };
    }

    return {
      wallet,
      status: 'not_found' as const,
      tier,
      expiresAt: expiresAt.toISOString(),
      requiresTravelRule: true,
    };
  }
}
