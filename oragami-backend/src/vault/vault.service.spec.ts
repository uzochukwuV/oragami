import { ConfigService } from '@nestjs/config';
import { VaultService } from './vault.service';

jest.mock('@solana/spl-token', () => ({
  getAccount: jest.fn().mockRejectedValue(new Error('no account')),
}));

describe('VaultService', () => {
  const prisma = {
    institution: {
      count: jest.fn().mockImplementation(
        (args?: { where?: { credentialStatus: string } }) => {
          if (args?.where?.credentialStatus === 'active') {
            return Promise.resolve(1);
          }
          return Promise.resolve(2);
        },
      ),
    },
    yieldEvent: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { yieldAccrued: 100n } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    deposit: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { usdcAmount: 5000000n } }),
    },
    navSnapshot: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const anchor = {
    readVaultState: jest.fn().mockResolvedValue({
      totalDeposits: { toString: () => '100' },
      totalSupply: { toString: () => '100' },
      navPriceBps: { toString: () => '10000' },
      pendingYield: { toString: () => '0' },
      apyBps: 500,
      usxAllocationBps: 3000,
      paused: false,
      lastYieldClaim: { toString: () => '1700000000' },
    }),
    getConnection: jest.fn(),
  };

  const solstice = {
    getEusxNav: jest.fn().mockResolvedValue(1.02),
  };

  const six = {
    pingToken: jest.fn().mockResolvedValue(undefined),
    getSixStatus: jest.fn().mockReturnValue({
      connected: false,
      lastSuccessAt: null,
    }),
  };

  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  let service: VaultService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VaultService(
      prisma as any,
      anchor as any,
      solstice as any,
      six as any,
      config,
    );
  });

  it('getState merges chain + solstice + six', async () => {
    const state = await service.getState();
    expect(state.navPriceBps).toBe('10000');
    expect(state.eusxPrice).toBe(1.02);
    expect(state.vaultUsxBalance).toBe('0');
    expect(six.pingToken).toHaveBeenCalled();
  });

  it('navHistory clamps limit to 500', async () => {
    await service.navHistory(9999);
    expect(prisma.navSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it('stats computes navChange24h when two snapshots', async () => {
    prisma.navSnapshot.findMany.mockResolvedValueOnce([
      { navBps: 10000n },
      { navBps: 10100n },
    ]);
    const stats = await service.stats();
    expect(stats.currentApy).toBe(5);
    expect(stats.navChange24h).toBeCloseTo(1, 5);
  });
});
