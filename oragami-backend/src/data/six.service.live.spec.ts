/**
 * Live SIX OAuth2 + mTLS — not run in CI by default.
 *
 * Prerequisites: PEMs in six-data-cert/ (repo root) or SIX_DATA_CERT_DIR (SIX hackathon: mTLS required).
 * OAuth optional for market data; intraday snapshot uses scheme=VALOR_BC and ids=valor_bc (e.g. 946681_149 EUR/USD).
 *
 * Run from repo:
 *   cd oragami-backend
 *   set SIX_LIVE_TEST=1
 *   set SIX_CLIENT_ID=...
 *   set SIX_CLIENT_SECRET=...
 *   npx jest src/data/six.service.live.spec.ts
 *
 * Bash:
 *   SIX_LIVE_TEST=1 SIX_CLIENT_ID=... SIX_CLIENT_SECRET=... npx jest src/data/six.service.live.spec.ts
 */
import 'dotenv/config';
import { SixService } from './six.service';

const live =
  process.env.SIX_LIVE_TEST === '1' &&
  !!process.env.SIX_CLIENT_ID &&
  !!process.env.SIX_CLIENT_SECRET;

const describeLive = live ? describe : describe.skip;

describeLive('SixService live — real SIX token call', () => {
  const makeEnvConfig = () =>
    ({
      get: (key: string): string | undefined => {
        const map: Record<string, string | undefined> = {
          SIX_BASE_URL:
            process.env.SIX_BASE_URL || 'https://api.six-group.com',
          SIX_TOKEN_URL:
            process.env.SIX_TOKEN_URL ||
            'https://api.six-group.com/oauth2/token',
          SIX_CLIENT_ID: process.env.SIX_CLIENT_ID,
          SIX_CLIENT_SECRET: process.env.SIX_CLIENT_SECRET,
          SIX_DATA_CERT_DIR: process.env.SIX_DATA_CERT_DIR,
          SIX_KEY_PASSPHRASE: process.env.SIX_KEY_PASSPHRASE,
          SIX_PREFERRED_LANGUAGE: process.env.SIX_PREFERRED_LANGUAGE,
        };
        return map[key];
      },
    }) as import('@nestjs/config').ConfigService;

  it(
    'pingToken + intradaySnapshot return live SIX data',
    async () => {
      const s = new SixService(makeEnvConfig());
      await s.pingToken();

      const scheme = process.env.SIX_LIVE_SCHEME || 'VALOR_BC';
      const ids = process.env.SIX_LIVE_INSTRUMENT_ID || '946681';
      const marketBC = process.env.SIX_LIVE_MARKET_BC || '149';

      const raw = await s.fetchIntradaySnapshot(scheme, ids, marketBC);

      const st = s.getSixStatus();
      expect(st.connected).toBe(true);
      expect(st.lastSuccessAt).toBeInstanceOf(Date);
      expect(typeof st.mtlsConfigured).toBe('boolean');
      expect(raw).toBeDefined();
      expect(typeof raw).toBe('object');
      const row = (raw as { data?: Array<{ lastPrice?: number }> }).data?.[0];
      expect(row).toBeDefined();
      expect(typeof row?.lastPrice).toBe('number');
      expect(row!.lastPrice).toBeGreaterThan(0);
    },
    90_000,
  );
});
