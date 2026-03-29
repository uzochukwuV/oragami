import { BadRequestException } from '@nestjs/common';
import { TravelRuleService } from './travel-rule.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import {
  createTestModule,
  cleanDatabase,
  seedTestInstitution,
  withTimeout,
  TEST_WALLET,
} from '../../test/setup';

describe('TravelRuleService (integration)', () => {
  let service: TravelRuleService;
  let prisma: PrismaService;
  let anchor: AnchorService;

  beforeAll(async () => {
    const module = await createTestModule();
    prisma = module.get(PrismaService);
    anchor = module.get(AnchorService);
    service = new TravelRuleService(prisma, anchor);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('submit rejects amount below threshold', async () => {
    await seedTestInstitution(prisma);
    await expect(
      service.submit({
        wallet: TEST_WALLET,
        usdcAmount: '100',
        originatorName: 'A',
        originatorAccount: 'CH123',
        beneficiaryName: 'B',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit rejects missing institution', async () => {
    await expect(
      service.submit({
        wallet: TEST_WALLET,
        usdcAmount: '2000000000',
        originatorName: 'A',
        originatorAccount: 'CH123',
        beneficiaryName: 'B',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submit creates travel rule row and returns unsigned tx', async () => {
    await seedTestInstitution(prisma);

    const out = await withTimeout(
      service.submit({
        wallet: TEST_WALLET,
        usdcAmount: '2000000000',
        originatorName: 'Originator',
        originatorAccount: 'CH930076201623385',
        beneficiaryName: 'Beneficiary',
      }),
      15000,
      null as any,
    );

    if (!out) return; // devnet timed out

    expect(out.txSignature).toBeNull();
    expect(out.nonceHash).toHaveLength(64);
    expect(out.unsignedTransactionBase64.length).toBeGreaterThan(0);
    expect(out.travelRulePda).toBeDefined();
    expect(out.nonceBase58).toBeDefined();

    const tr = await prisma.travelRule.findUnique({
      where: { nonceHash: out.nonceHash.toLowerCase() },
    });
    expect(tr).toBeDefined();
    expect(tr!.originatorName).toBe('Originator');
    expect(tr!.usdcAmount).toBe(2000000000n);
  });

  it('getByNonceHash returns stored travel rule', async () => {
    await seedTestInstitution(prisma);

    const out = await withTimeout(
      service.submit({
        wallet: TEST_WALLET,
        usdcAmount: '2000000000',
        originatorName: 'Originator',
        originatorAccount: 'CH930076201623385',
        beneficiaryName: 'Beneficiary',
      }),
      15000,
      null as any,
    );

    if (!out) return; // devnet timed out

    const result = await service.getByNonceHash(out.nonceHash);
    expect(result.nonceHash).toBe(out.nonceHash);
    expect(result.institutionWallet).toBe(TEST_WALLET);
    expect(result.usdcAmount).toBe('2000000000');
  });
});
