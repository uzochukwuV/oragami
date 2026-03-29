/**
 * Asserts OAuth token request succeeds with a real `https.Agent` built from PEM files
 * (temp dir via `selfsigned`). Axios is mocked so no network call runs.
 */
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import selfsigned from 'selfsigned';
import { SixService } from './six.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SixService mTLS + successful token', () => {
  let certDir: string;

  beforeAll(async () => {
    const pems = await selfsigned.generate(
      [{ name: 'commonName', value: 'oragami-six-test' }],
      {
        keySize: 2048,
        keyType: 'rsa',
        algorithm: 'sha256',
        clientCertificate: true,
        notAfterDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    );
    certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'six-'));
    fs.writeFileSync(path.join(certDir, 'signed-certificate.pem'), pems.cert);
    fs.writeFileSync(path.join(certDir, 'private-key.pem'), pems.private);
  });

  afterAll(() => {
    try {
      fs.rmSync(certDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'mtls-tok', expires_in: 3600 },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('pingToken succeeds and passes https.Agent to axios when PEMs are present', async () => {
    const makeConfig = (env: Record<string, string | undefined>) =>
      ({
        get: (k: string) => env[k],
      }) as unknown as ConfigService;

    const s = new SixService(
      makeConfig({
        SIX_TOKEN_URL: 'https://api.six-group.com/oauth2/token',
        SIX_CLIENT_ID: 'client-id',
        SIX_CLIENT_SECRET: 'client-secret',
        SIX_DATA_CERT_DIR: certDir,
      }),
    );

    expect(s.hasMtlsPems()).toBe(true);

    await s.pingToken();

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [, , cfg] = mockedAxios.post.mock.calls[0];
    expect(cfg).toEqual(
      expect.objectContaining({
        httpsAgent: expect.any(https.Agent),
        timeout: 15_000,
      }),
    );
    expect(s.getSixStatus().connected).toBe(true);
    expect(s.getSixStatus().mtlsConfigured).toBe(true);
  });
});
