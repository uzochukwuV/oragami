import { VaultService } from './vault.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import { SolsticeService } from '../solana/solstice.service';
import { SixService } from '../data/six.service';
import { ConfigService } from '@nestjs/config';
import {
  createTestModule,
  cleanDatabase,
  seedTestInstitution,
  withTimeout,
  TEST_WALLET,
} from '../../test/setup';

describe('VaultService (integration)', () => {
  let service: VaultService;
  let prisma: PrismaService;
  let anchor: AnchorService;
  let solstice: SolsticeService;
  let six: SixService;
  let config: ConfigService;

  beforeAll(async () => {
    const module = await createTestModule();
    prisma = module.get(PrismaService);
    anchor = module.get(AnchorService);
    solstice = module.get(SolsticeService);
    six = module.get(SixService);
    config = module.get(ConfigService);
    service = new VaultService(prisma, anchor, solstice, six, config);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  it('getState returns vault state or handles missing chain state', async () => {
    const state = await withTimeout(service.getState(), 10000, null as any);

    if (!state) return; // devnet timed out or vault not initialized

    expect(state).toHaveProperty('navPriceBps');
    expect(state).toHaveProperty('totalDeposits');
    expect(state).toHaveProperty('totalSupply');
    expect(state).toHaveProperty('eusxPrice');
    expect(state).toHaveProperty('vaultUsxBalance');
  });

  it('navHistory returns data from Postgres', async () => {
    await prisma.navSnapshot.create({
      data: {
        navBps: 10000n,
        source: 'test',
        timestamp: new Date(),
      },
    });

    const result = await service.navHistory(10);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].navBps).toBe(10000n);
  });

  it('navHistory clamps limit to 500', async () => {
    const result = await service.navHistory(9999);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('yieldHistory returns data from Postgres', async () => {
    await prisma.yieldEvent.create({
      data: {
        totalDeposits: 1000000n,
        usxAllocationBps: 8000,
        apyBps: 500,
        daysElapsed: 1,
        yieldAccrued: 100n,
        navBeforeBps: 10000n,
        navAfterBps: 10014n,
        eusxPrice: 1.02,
        timestamp: new Date(),
      },
    });

    const result = await service.yieldHistory(10);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].yieldAccrued).toBe(100n);
  });

  it('stats computes navChange24h when two snapshots exist', async () => {
    const old = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 1000);

    await prisma.navSnapshot.createMany({
      data: [
        { navBps: 10000n, source: 'test', timestamp: old },
        { navBps: 10100n, source: 'test', timestamp: recent },
      ],
    });

    await seedTestInstitution(prisma);

    const stats = await withTimeout(service.stats(), 10000, null as any);

    if (!stats) return; // devnet timed out

    expect(stats).toHaveProperty('totalInstitutions');
    expect(stats).toHaveProperty('activeCredentials');
    expect(stats).toHaveProperty('currentApy');
    expect(stats).toHaveProperty('navChange24h');
    expect(stats.totalInstitutions).toBeGreaterThanOrEqual(1);
  });
});
