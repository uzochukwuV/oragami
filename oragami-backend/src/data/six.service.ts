import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosRequestConfig } from 'axios';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

/**
 * SIX Financial Data API — OAuth2 client credentials + optional mTLS (PEM files).
 *
 * Place `signed-certificate.pem` and `private-key.pem` under `six-data-cert/`
 * (repo root) or set `SIX_DATA_CERT_DIR`. Optional `password.txt` in that folder
 * is used only if the private key is encrypted (PEM contains ENCRYPTED).
 */
@Injectable()
export class SixService {
  private readonly logger = new Logger(SixService.name);
  private lastSuccessAt: Date | null = null;
  private tokenCache: { accessToken: string; expiresAtMs: number } | null =
    null;
  /** Lazily built; `null` = resolved and no PEMs available */
  private mtlsAgent: https.Agent | undefined | null;

  constructor(private readonly config: ConfigService) {}

  getSixStatus(): {
    connected: boolean;
    lastSuccessAt: Date | null;
    mtlsConfigured: boolean;
  } {
    const mtlsConfigured = this.hasMtlsPems();
    return {
      /** True after any successful SIX call (OAuth token or market data with mTLS). */
      connected: this.lastSuccessAt !== null,
      lastSuccessAt: this.lastSuccessAt,
      mtlsConfigured,
    };
  }

  /** True if both PEMs can be resolved (used for dashboard / health). */
  hasMtlsPems(): boolean {
    return this.resolveDataCertDir() !== null;
  }

  private resolveDataCertDir(): string | null {
    const fromEnv = this.config.get<string>('SIX_DATA_CERT_DIR')?.trim();
    const candidates = [
      fromEnv,
      path.join(process.cwd(), 'six-data-cert'),
      path.join(process.cwd(), '..', 'six-data-cert'),
      path.join(process.cwd(), '..', '..', 'six-data-cert'),
    ].filter(Boolean) as string[];
    for (const d of candidates) {
      const certFile = path.join(d, 'signed-certificate.pem');
      const keyFile = path.join(d, 'private-key.pem');
      if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
        return path.resolve(d);
      }
    }
    return null;
  }

  private readOptionalPassphrase(
    certDir: string,
    keyPemUtf8: string,
  ): string | undefined {
    if (!keyPemUtf8.includes('ENCRYPTED')) {
      return undefined;
    }
    const fromEnv = this.config.get<string>('SIX_KEY_PASSPHRASE')?.trim();
    if (fromEnv) return fromEnv;
    const pwFile = path.join(certDir, 'password.txt');
    if (fs.existsSync(pwFile)) {
      return fs.readFileSync(pwFile, 'utf8').trim();
    }
    return undefined;
  }

  /** mTLS Agent for HTTPS requests to SIX (token + future market APIs). */
  private getMtlsAgent(): https.Agent | undefined {
    if (this.mtlsAgent !== undefined) {
      return this.mtlsAgent ?? undefined;
    }
    const dir = this.resolveDataCertDir();
    if (!dir) {
      this.mtlsAgent = null;
      return undefined;
    }
    const certPath = path.join(dir, 'signed-certificate.pem');
    const keyPath = path.join(dir, 'private-key.pem');
    try {
      const keyPemUtf8 = fs.readFileSync(keyPath, 'utf8');
      const passphrase = this.readOptionalPassphrase(dir, keyPemUtf8);
      const agent = new https.Agent({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ...(passphrase ? { passphrase } : {}),
      });
      this.mtlsAgent = agent;
      this.logger.log(`SIX mTLS enabled (PEM in ${dir})`);
      return agent;
    } catch (e) {
      this.logger.warn(
        `SIX mTLS PEM load failed: ${e instanceof Error ? e.message : e}`,
      );
      this.mtlsAgent = null;
      return undefined;
    }
  }

  private axiosConfigForSix(): Pick<AxiosRequestConfig, 'httpsAgent'> {
    const httpsAgent = this.getMtlsAgent();
    return httpsAgent ? { httpsAgent } : {};
  }

  /** Optional warm-up: obtain token once so dashboard shows connected when SIX is reachable. */
  async pingToken(): Promise<void> {
    const tokenUrl = this.config.get<string>('SIX_TOKEN_URL');
    const id = this.config.get<string>('SIX_CLIENT_ID');
    const secret = this.config.get<string>('SIX_CLIENT_SECRET');
    if (!tokenUrl || !id || !secret) return;

    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAtMs > now + 60_000) {
      this.lastSuccessAt = new Date();
      return;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
      });
      const response = await axios.post<unknown>(tokenUrl, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
        validateStatus: () => true,
        ...this.axiosConfigForSix(),
      });
      const status = response.status;
      const raw = response.data as Record<string, unknown>;
      if (status < 200 || status >= 300) {
        this.logger.warn(
          `SIX token HTTP ${status}: ${JSON.stringify(raw).slice(0, 800)}`,
        );
        return;
      }
      const accessToken =
        (typeof raw.access_token === 'string' && raw.access_token) ||
        (typeof raw.accessToken === 'string' && raw.accessToken) ||
        undefined;
      if (!accessToken) {
        this.logger.warn(
          `SIX token body missing access_token (HTTP ${status}): ${JSON.stringify(raw).slice(0, 800)}`,
        );
        return;
      }
      let ttlSec = 3600;
      if (typeof raw.expires_in === 'number' && raw.expires_in > 0) {
        ttlSec = raw.expires_in;
      } else if (typeof raw.expires_in === 'string') {
        const parsed = Number.parseInt(raw.expires_in, 10);
        if (Number.isFinite(parsed) && parsed > 0) ttlSec = parsed;
      }
      this.tokenCache = {
        accessToken,
        expiresAtMs: now + ttlSec * 1000,
      };
      this.lastSuccessAt = new Date();
    } catch (e) {
      this.logger.debug(
        `SIX token ping failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * SIX intraday snapshot — mTLS + optional Bearer.
   * Hackathon / Web API: `scheme=VALOR_BC`, `ids` = `{valor}_{bc}` (e.g. `114621_65`, `946681_149` for EUR/USD on BC 149).
   * @see https://web.apiportal.six-group.com/portal/bfi/documentation#api-data-model
   */
  async fetchIntradaySnapshot(
    scheme: string,
    valor: string,
    marketBc: string,
  ): Promise<unknown> {
    await this.pingToken();
    const base = (
      this.config.get<string>('SIX_BASE_URL') || 'https://api.six-group.com'
    ).replace(/\/$/, '');
    const url = `${base}/web/v2/listings/marketData/intradaySnapshot`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.tokenCache?.accessToken) {
      headers.Authorization = `Bearer ${this.tokenCache.accessToken}`;
    }
    const agent = this.getMtlsAgent();
    if (!this.tokenCache?.accessToken && !agent) {
      throw new Error(
        'SIX intradaySnapshot needs OAuth token or mTLS PEMs (signed-certificate.pem + private-key.pem)',
      );
    }
    const ids = `${valor}_${marketBc}`;
    const preferredLanguage =
      this.config.get<string>('SIX_PREFERRED_LANGUAGE')?.trim() || 'EN';
    const response = await axios.get<unknown>(url, {
      params: { scheme, ids, preferredLanguage },
      headers,
      timeout: 30_000,
      validateStatus: () => true,
      ...this.axiosConfigForSix(),
    });
    const status = response.status;
    const data = response.data;
    if (status < 200 || status >= 300) {
      throw new Error(
        `SIX intradaySnapshot HTTP ${status}: ${JSON.stringify(data).slice(0, 500)}`,
      );
    }
    this.lastSuccessAt = new Date();
    return data;
  }
}
