import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SixService } from './six.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeConfig(
  env: Record<string, string | undefined>,
): ConfigService {
  return {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
}

describe('SixService (integration)', () => {
  beforeEach(() => {
    mockedAxios.post.mockClear();
  });

  it('getSixStatus returns shape without SIX creds in config', () => {
    const s = new SixService(makeConfig({}));
    const status = s.getSixStatus();
    expect(status).toHaveProperty('connected');
    expect(status).toHaveProperty('lastSuccessAt');
    expect(status).toHaveProperty('mtlsConfigured');
  });

  it('pingToken no-ops when env incomplete', async () => {
    const s = new SixService(makeConfig({}));
    await s.pingToken();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('pingToken caches token and sets lastSuccessAt', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      data: { access_token: 'tok', expires_in: 3600 },
    } as never);

    const s = new SixService(
      makeConfig({
        SIX_TOKEN_URL: 'https://example.com/token',
        SIX_CLIENT_ID: 'id',
        SIX_CLIENT_SECRET: 'sec',
      }),
    );

    await s.pingToken();
    expect(s.getSixStatus().connected).toBe(true);
    expect(s.getSixStatus().lastSuccessAt).toBeInstanceOf(Date);

    await s.pingToken();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });
});
