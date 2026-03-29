import { BadRequestException } from '@nestjs/common';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { TravelRuleService } from './travel-rule.service';

describe('TravelRuleService', () => {
  const prisma = {
    institution: { findUnique: jest.fn() },
    travelRule: { create: jest.fn(), findUnique: jest.fn() },
  };

  const anchor = {
    deriveTravelRulePda: jest.fn(),
    getProgram: jest.fn(),
    getConnection: jest.fn().mockReturnValue({
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 1,
      }),
    }),
  };

  let service: TravelRuleService;

  beforeEach(() => {
    jest.clearAllMocks();
    const payer = new PublicKey('11111111111111111111111111111112');
    const pda = new PublicKey('So11111111111111111111111111111111111111112');
    anchor.deriveTravelRulePda.mockReturnValue([pda, 255]);

    const noopIx = new TransactionInstruction({
      keys: [],
      programId: new PublicKey('11111111111111111111111111111112'),
      data: Buffer.alloc(0),
    });

    anchor.getProgram.mockReturnValue({
      methods: {
        initTravelRule: jest.fn().mockReturnValue({
          accounts: jest.fn().mockReturnValue({
            instruction: jest.fn().mockResolvedValue(noopIx),
          }),
        }),
      },
    });

    service = new TravelRuleService(prisma as any, anchor as any);
  });

  it('submit rejects amount below threshold', async () => {
    prisma.institution.findUnique.mockResolvedValue({ id: 'i1' });
    await expect(
      service.submit({
        wallet: '11111111111111111111111111111112',
        usdcAmount: '100',
        originatorName: 'A',
        originatorAccount: 'CH123',
        beneficiaryName: 'B',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit rejects missing institution', async () => {
    prisma.institution.findUnique.mockResolvedValue(null);
    await expect(
      service.submit({
        wallet: '11111111111111111111111111111112',
        usdcAmount: '2000000000',
        originatorName: 'A',
        originatorAccount: 'CH123',
        beneficiaryName: 'B',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit creates travel rule row and returns unsigned tx', async () => {
    prisma.institution.findUnique.mockResolvedValue({ id: 'inst1' });
    prisma.travelRule.create.mockResolvedValue({});

    const out = await service.submit({
      wallet: '11111111111111111111111111111112',
      usdcAmount: '2000000000',
      originatorName: 'Originator',
      originatorAccount: 'CH930076201623385',
      beneficiaryName: 'Beneficiary',
    });

    expect(out.txSignature).toBeNull();
    expect(out.nonceHash).toHaveLength(64);
    expect(out.unsignedTransactionBase64.length).toBeGreaterThan(0);
    expect(prisma.travelRule.create).toHaveBeenCalled();
  });
});
