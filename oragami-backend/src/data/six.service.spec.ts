import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SixService } from './six.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SixService', () => {
  const makeConfig = (env: Record<string, string | undefined>) =>
    ({
      get: (k: string) => env[k],
    }) as unknown as ConfigService;

  it('getSixStatus returns not connected without creds', () => {
    const s = new SixService(makeConfig({}));
    expect(s.getSixStatus()).toEqual({
      connected: false,
      lastSuccessAt: null,
    });
  });

  it('pingToken no-ops when env incomplete', async () => {
    const s = new SixService(makeConfig({}));
    await s.pingToken();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('pingToken caches token and sets lastSuccessAt', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'tok', expires_in: 3600 },
    });
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
