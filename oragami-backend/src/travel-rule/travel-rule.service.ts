import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { randomBytes } from 'crypto';
import bs58 from 'bs58';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import { sha256Hex, strToBytes34, strToBytes64 } from '../common/encoding';

const MIN_TRAVEL_RULE_USDC = 1_000_000_000n; // 1000 USDC @ 6 decimals

@Injectable()
export class TravelRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
  ) {}

  async submit(
    dto: import('./dto/submit-travel-rule.dto').SubmitTravelRuleDto,
  ) {
    const amount = BigInt(dto.usdcAmount);
    if (amount < MIN_TRAVEL_RULE_USDC) {
      throw new BadRequestException(
        `usdcAmount must be >= ${MIN_TRAVEL_RULE_USDC} (1000 USDC) for travel rule`,
      );
    }

    const institution = await this.prisma.institution.findUnique({
      where: { walletAddress: dto.wallet },
    });
    if (!institution) {
      throw new BadRequestException(
        'Institution not found - complete credential onboarding first',
      );
    }

    const nonce = randomBytes(32);
    const nonceHash = sha256Hex(nonce);
    const nonceHashArr = [...nonceHash];

    const payer = new PublicKey(dto.wallet);
    const [travelRulePda] = this.anchor.deriveTravelRulePda(
      payer,
      Uint8Array.from(nonceHashArr),
    );

    const compliancePayload = JSON.stringify({
      originatorName: dto.originatorName,
      originatorAccount: dto.originatorAccount,
      beneficiaryName: dto.beneficiaryName,
      amount: dto.usdcAmount,
      nonce: nonce.toString('hex'),
    });
    const complianceHash = [...sha256Hex(compliancePayload)];

    const program = this.anchor.getProgram() as any;
    const params = {
      originatorName: strToBytes64(dto.originatorName),
      originatorAccount: strToBytes34(dto.originatorAccount),
      beneficiaryName: strToBytes64(dto.beneficiaryName),
      complianceHash,
      amount: new BN(dto.usdcAmount),
      nonceHash: nonceHashArr,
    };

    const ix = await program.methods
      .initTravelRule(params)
      .accounts({
        travelRuleData: travelRulePda,
        payer,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const { blockhash, lastValidBlockHeight } = await this.anchor
      .getConnection()
      .getLatestBlockhash('confirmed');
    const tx = new Transaction({
      feePayer: payer,
      recentBlockhash: blockhash,
    }).add(ix);

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    await this.prisma.travelRule.create({
      data: {
        pda: travelRulePda.toBase58(),
        institutionId: institution.id,
        originatorName: dto.originatorName,
        originatorAccount: dto.originatorAccount,
        beneficiaryName: dto.beneficiaryName,
        complianceHash: Buffer.from(complianceHash).toString('hex'),
        nonceHash: Buffer.from(nonceHashArr).toString('hex').toLowerCase(),
        usdcAmount: amount,
        submittedAt: new Date(),
      },
    });

    const nonceBase58 = bs58.encode(nonce);

    return {
      nonceHash: Buffer.from(nonceHashArr).toString('hex'),
      nonceBase58,
      travelRulePda: travelRulePda.toBase58(),
      txSignature: null as string | null,
      unsignedTransactionBase64: serialized.toString('base64'),
      lastValidBlockHeight,
    };
  }

  async getByNonceHash(nonceHashHex: string) {
    const row = await this.prisma.travelRule.findUnique({
      where: { nonceHash: nonceHashHex.toLowerCase() },
      include: { institution: true },
    });
    if (!row) throw new NotFoundException('Travel rule not found');

    let onChain: 'unknown' | 'initialized' = 'unknown';
    try {
      const payer = new PublicKey(row.institution.walletAddress);
      const hashBytes = Buffer.from(row.nonceHash, 'hex');
      await this.anchor.readTravelRule(payer, hashBytes);
      onChain = 'initialized';
    } catch {
      onChain = 'unknown';
    }

    return {
      nonceHash: row.nonceHash,
      pda: row.pda,
      institutionWallet: row.institution.walletAddress,
      usdcAmount: row.usdcAmount.toString(),
      submittedAt: row.submittedAt.toISOString(),
      onChain,
    };
  }
}
