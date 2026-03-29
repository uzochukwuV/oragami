import { Test, TestingModule } from '@nestjs/testing';
import { NavCrankService } from './nav-crank.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import { SolsticeService } from '../solana/solstice.service';
import { SixService } from '../data/six.service';
import { CrankStateService } from '../health/crank-state.service';

// Minimal SIX response that walkForPrice can resolve
const goldResponse = { data: [{ intradaySnapshot: { last: { value: 2350.5 } } }] };
const chfResponse = { data: [{ intradaySnapshot: { last: { value: 1.1234 } } }] };

function buildRpcMock(resolvedValue: string | null = 'mock-tx-sig') {
  const rpc = resolvedValue
    ? jest.fn().mockResolvedValue(resolvedValue)
    : jest.fn().mockRejectedValue(new Error('RPC error'));
  const chain = { accounts: jest.fn(), signers: jest.fn(), rpc };
  chain.accounts.mockReturnValue(chain);
  chain.signers.mockReturnValue(chain);
  return { chain, rpc };
}

/** Vault state returned after process_yield — pending_yield is non-zero */
const mockVaultStateWithYield = {
  navPriceBps: 10_000,
  usxAllocationBps: 7000,
  totalDeposits: 1_000_000_000n,
  pendingYield: 137n,
  apyBps: 500,
  lastYieldClaim: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
};

function buildProgramMock(setNavChain: any, processYieldChain: any) {
  return {
    methods: {
      setNav: jest.fn().mockReturnValue(setNavChain),
      processYield: jest.fn().mockReturnValue(processYieldChain),
    },
  };
}

describe('NavCrankService', () => {
  let service: NavCrankService;
  let mockSix: jest.Mocked<Pick<SixService, 'fetchIntradaySnapshot'>>;
  let mockAnchor: any;
  let mockPrisma: any;
  let mockSolstice: any;
  let mockCrankState: any;

  beforeEach(async () => {
    jest.resetAllMocks();

    const { chain: setNavChain } = buildRpcMock('mock-tx-sig');
    const { chain: processYieldChain } = buildRpcMock('mock-yield-sig');

    mockSix = {
      fetchIntradaySnapshot: jest
        .fn()
        .mockResolvedValueOnce(goldResponse)
        .mockResolvedValueOnce(chfResponse),
    };

    mockAnchor = {
      readVaultState: jest
        .fn()
        .mockResolvedValue(mockVaultStateWithYield),
      getProgram: jest.fn().mockReturnValue(
        buildProgramMock(setNavChain, processYieldChain),
      ),
      deriveVaultStatePda: jest
        .fn()
        .mockReturnValue([{ toBase58: () => 'vaultPda' }, 255]),
      getAuthority: jest
        .fn()
        .mockReturnValue({ publicKey: { toBase58: () => 'authority' } }),
    };

    mockPrisma = {
      navSnapshot: { create: jest.fn().mockResolvedValue({}) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      yieldEvent: { create: jest.fn().mockResolvedValue({}) },
    };

    mockSolstice = { getEusxNav: jest.fn().mockResolvedValue(1.002) };
    mockCrankState = { recordNavRun: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NavCrankService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AnchorService, useValue: mockAnchor },
        { provide: SolsticeService, useValue: mockSolstice },
        { provide: SixService, useValue: mockSix },
        { provide: CrankStateService, useValue: mockCrankState },
      ],
    }).compile();

    service = module.get(NavCrankService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateNav()', () => {
    it('fetches SIX Gold + CHF prices and returns navBps', async () => {
      const result = await service.updateNav();

      expect(mockSix.fetchIntradaySnapshot).toHaveBeenCalledTimes(2);
      expect(mockSix.fetchIntradaySnapshot).toHaveBeenCalledWith('VALOR_BC', '274702', '148');
      expect(mockSix.fetchIntradaySnapshot).toHaveBeenCalledWith('VALOR_BC', '275164', '148');
      expect(result.goldPrice).toBe(2350.5);
      expect(result.chfUsd).toBe(1.1234);
      expect(result.navBps).toBeGreaterThan(0);
    });

    it('calls set_nav on-chain and returns txSignature', async () => {
      const result = await service.updateNav();
      expect(result.txSignature).toBe('mock-tx-sig');
    });

    it('records NavSnapshot and AuditEvent in DB', async () => {
      await service.updateNav();
      expect(mockPrisma.navSnapshot.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actor: 'system', role: 'crank', action: 'set_nav' }),
        }),
      );
    });

    it('falls back to cached prices when SIX fetch fails', async () => {
      // First call populates cache
      await service.updateNav();

      // Second call: both SIX fetches fail
      mockSix.fetchIntradaySnapshot
        .mockRejectedValueOnce(new Error('SIX down'))
        .mockRejectedValueOnce(new Error('SIX down'));
      (service as any).lastOnChainUpdateMs = 0;

      const result = await service.updateNav();
      expect(result.goldPrice).toBe(2350.5);
      expect(result.source).toBe('SIX-cached');
    });

    it('skips on-chain update when NAV change exceeds guard (>10%)', async () => {
      // Force baseline to a low value so gold_factor = 2350.5/100 = 23.5 → huge NAV jump
      (service as any).baselineGoldPrice = 100;
      (service as any).baselineChfUsd = 1.0;

      const result = await service.updateNav();
      expect(result.txSignature).toBeNull();
    });

    it('skips on-chain update when called too recently', async () => {
      // First call succeeds and sets lastOnChainUpdateMs
      await service.updateNav();

      // Second call immediately — within MIN_UPDATE_INTERVAL_MS
      mockSix.fetchIntradaySnapshot
        .mockResolvedValueOnce(goldResponse)
        .mockResolvedValueOnce(chfResponse);

      const result = await service.updateNav();
      expect(result.txSignature).toBeNull();
    });

    it('still records snapshot even when set_nav on-chain fails', async () => {
      const { chain: failChain } = buildRpcMock(null);
      const { chain: yieldChain } = buildRpcMock('mock-yield-sig');
      mockAnchor.getProgram.mockReturnValue(
        buildProgramMock(failChain, yieldChain),
      );

      const result = await service.updateNav();
      expect(result.txSignature).toBeNull();
      expect(mockPrisma.navSnapshot.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('yield tick (minimal ISSUE #7 stub)', () => {
    it('calls process_yield on-chain after a successful set_nav', async () => {
      await service.updateNav();
      const program = mockAnchor.getProgram();
      expect(program.methods.processYield).toHaveBeenCalledTimes(1);
    });

    it('records a YieldEvent in the DB after process_yield', async () => {
      await service.updateNav();
      expect(mockPrisma.yieldEvent.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.yieldEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            usxAllocationBps: 7000,
            apyBps: 500,
            eusxPrice: 1.002,
          }),
        }),
      );
    });

    it('does not record YieldEvent when set_nav fails (tick never runs)', async () => {
      const { chain: failChain } = buildRpcMock(null);
      const { chain: yieldChain } = buildRpcMock('mock-yield-sig');
      mockAnchor.getProgram.mockReturnValue(
        buildProgramMock(failChain, yieldChain),
      );

      await service.updateNav();
      // set_nav failed — tickYield is inside the try block so it never ran
      expect(mockPrisma.yieldEvent.create).not.toHaveBeenCalled();
    });

    it('does not abort NAV update when process_yield fails', async () => {
      const { chain: setNavChain } = buildRpcMock('mock-tx-sig');
      const { chain: failYieldChain } = buildRpcMock(null);
      mockAnchor.getProgram.mockReturnValue(
        buildProgramMock(setNavChain, failYieldChain),
      );

      // NAV update should still succeed even though yield tick failed
      const result = await service.updateNav();
      expect(result.txSignature).toBe('mock-tx-sig');
      expect(mockPrisma.navSnapshot.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('runNavCrank()', () => {
    it('calls recordNavRun(true) on success', async () => {
      await service.runNavCrank();
      expect(mockCrankState.recordNavRun).toHaveBeenCalledWith(true);
    });

    it('calls recordNavRun(false) when updateNav throws', async () => {
      jest.spyOn(service, 'updateNav').mockRejectedValue(new Error('boom'));
      await service.runNavCrank();
      expect(mockCrankState.recordNavRun).toHaveBeenCalledWith(false);
    });
  });

  describe('getLastPrices()', () => {
    it('returns null before first run', () => {
      const prices = service.getLastPrices();
      expect(prices.goldPrice).toBeNull();
      expect(prices.chfUsd).toBeNull();
    });

    it('returns cached prices after a successful run', async () => {
      await service.updateNav();
      const prices = service.getLastPrices();
      expect(prices.goldPrice).toBe(2350.5);
      expect(prices.chfUsd).toBe(1.1234);
      expect(prices.baselineGoldPrice).toBe(2350.5);
    });
  });
});
