import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * SIX Financial Data API — OAuth2 client credentials + status for vault dashboard.
 * Full FX/NAV methods can be expanded per ISSUE #5; this exposes getSixStatus for ISSUE #11.
 */
@Injectable()
export class SixService {
  private readonly logger = new Logger(SixService.name);
  private lastSuccessAt: Date | null = null;
  private tokenCache: { accessToken: string; expiresAtMs: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  getSixStatus(): { connected: boolean; lastSuccessAt: Date | null } {
    const id = this.config.get<string>('SIX_CLIENT_ID');
    const secret = this.config.get<string>('SIX_CLIENT_SECRET');
    const hasCreds = !!(id && secret);
    return {
      connected: hasCreds && this.lastSuccessAt !== null,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  /** Optional warm-up: obtain token once so dashboard shows connected when SIX is reachable. */
  async pingToken(): Promise<void> {
    const tokenUrl = this.config.get<string>('SIX_TOKEN_URL');
    const id = this.config.get<string>('SIX_CLIENT_ID');
    const secret = this.config.get<string>('SIX_CLIENT_SECRET');
    if (!tokenUrl || !id || !secret) return;

    const now = Date.now();
    if (
      this.tokenCache &&
      this.tokenCache.expiresAtMs > now + 60_000
    ) {
      this.lastSuccessAt = new Date();
      return;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
      });
      const { data } = await axios.post<{
        access_token: string;
        expires_in?: number;
      }>(tokenUrl, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
        validateStatus: (s) => s < 500,
      });
      if (!data.access_token) {
        this.logger.warn('SIX token response missing access_token');
        return;
      }
      const ttlSec = data.expires_in ?? 3600;
      this.tokenCache = {
        accessToken: data.access_token,
        expiresAtMs: now + ttlSec * 1000,
      };
      this.lastSuccessAt = new Date();
    } catch (e) {
      this.logger.debug(
        `SIX token ping failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
