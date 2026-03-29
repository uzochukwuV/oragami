import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AnchorService } from '../src/solana/anchor.service';
import { SolsticeService } from '../src/solana/solstice.service';
import { SixService } from '../src/data/six.service';

export async function createTestModule(): Promise<TestingModule> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true })],
    providers: [PrismaService, AnchorService, SolsticeService, SixService],
    exports: [PrismaService, AnchorService, SolsticeService, SixService],
  }).compile();

  // Initialize lifecycle hooks
  const prisma = module.get(PrismaService);
  await prisma.onModuleInit();

  const anchor = module.get(AnchorService);
  anchor.onModuleInit();

  return module;
}

export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.deposit.deleteMany();
  await prisma.travelRule.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.yieldEvent.deleteMany();
  await prisma.navSnapshot.deleteMany();
  await prisma.institution.deleteMany();
}

const TEST_WALLET = '11111111111111111111111111111112';

export async function seedTestInstitution(
  prisma: PrismaService,
  overrides: Partial<{
    walletAddress: string;
    name: string;
    jurisdiction: string;
    tier: number;
    kycLevel: number;
    amlScore: number;
    credentialStatus: string;
  }> = {},
) {
  const now = new Date();
  const wallet = overrides.walletAddress ?? TEST_WALLET;

  // Delete first to avoid unique constraint violations across tests
  await prisma.institution
    .deleteMany({ where: { walletAddress: wallet } })
    .catch(() => undefined);

  return prisma.institution.create({
    data: {
      walletAddress: wallet,
      name: overrides.name ?? 'Test Bank',
      jurisdiction: overrides.jurisdiction ?? 'CH',
      tier: overrides.tier ?? 2,
      kycLevel: overrides.kycLevel ?? 2,
      amlScore: overrides.amlScore ?? 80,
      credentialStatus: overrides.credentialStatus ?? 'active',
      credentialIssuedAt: now,
      credentialExpiresAt: new Date(now.getTime() + 86400_000),
    },
  });
}

/**
 * Wraps a promise with a timeout. Returns fallback on timeout OR thrown error.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export { TEST_WALLET };
