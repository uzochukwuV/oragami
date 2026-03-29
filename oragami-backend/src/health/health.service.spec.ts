import { HealthService } from './health.service';
import { CrankStateService } from './crank-state.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };
  let anchor: { getConnection: jest.Mock };
  let six: { getSixStatus: jest.Mock };
  let crankState: CrankStateService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    anchor = {
      getConnection: jest.fn().mockReturnValue({
        getVersion: jest.fn().mockResolvedValue({ 'feature-set': 1 }),
      }),
    };
    six = {
      getSixStatus: jest.fn().mockReturnValue({
        connected: true,
        lastSuccessAt: new Date(),
        mtlsConfigured: true,
      }),
    };
    crankState = new CrankStateService();

    service = new HealthService(
      prisma as never,
      anchor as never,
      six as never,
      crankState,
    );
  });

  it('getHealth returns ok when db, solana, and six are up', async () => {
    const h = await service.getHealth();
    expect(h.status).toBe('ok');
    expect(h.db_connected).toBe(true);
    expect(h.solana_connected).toBe(true);
    expect(h.six_connected).toBe(true);
  });

  it('getHealth returns degraded when db fails', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('down'));
    const h = await service.getHealth();
    expect(h.status).toBe('degraded');
    expect(h.db_connected).toBe(false);
  });

  it('getCrankHealth returns nulls until cranks record runs', () => {
    expect(service.getCrankHealth()).toEqual({
      nav_crank: { lastRun: null, lastSuccess: null },
      yield_crank: { lastRun: null, lastSuccess: null },
    });
    crankState.recordNavRun(true);
    const c = service.getCrankHealth();
    expect(c.nav_crank.lastRun).toBeTruthy();
    expect(c.nav_crank.lastSuccess).toBeTruthy();
  });
});
