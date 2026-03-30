import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as https from "node:https";
import * as fs from "node:fs";
import { DEFAULT_MARKET_SYMBOLS, SYMBOL_TO_VALOR_BC } from "./six.graphql";

type SixRestSnapshotResponse = Record<string, unknown> | unknown[];

type SnapshotQuote = {
  price?: number;
  asOf?: string;
  relativeChange?: number;
  source?: string;
};

type QuoteRecord = {
  symbol: string;
  price: number;
  change24hPct: number;
  asOf: string;
  source: string;
};

type SixDebugSampleNode = {
  path: string;
  keys: string[];
  idHints: string[];
  symbolHints: string[];
  priceHints: number[];
};

@Injectable()
export class SixService implements OnModuleInit {
  private readonly logger = new Logger(SixService.name);
  private readonly graphqlUrl: string;
  private readonly intradaySnapshotUrls: string[];
  private noParseWarnAfter = 0;
  private readonly noParseWarnCooldownMs = 120_000;

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.configService.get<string>(
      "SIX_API_BASE_URL",
      "https://api.six-group.com",
    );

    this.graphqlUrl = `${baseUrl}/web/v2/graphql`;
    this.intradaySnapshotUrls = [
      `${baseUrl}/web/v2/listings/marketData/intradaySnapshot`,
    ];
  }

  onModuleInit() {
    const readiness = this.getReadinessStatus();
    if (readiness.ready) {
      this.logger.log(`SIX ready (${readiness.reason}) via ${this.graphqlUrl}`);
    } else {
      this.logger.warn(`SIX not ready: ${readiness.reason}`);
    }
  }

  isReady(): boolean {
    return this.getReadinessStatus().ready;
  }

  getReadinessStatus(): { ready: boolean; reason: string } {
    const sixEnabled =
      this.configService.get<string>("SIX_ENABLED", "true") === "true";
    if (!sixEnabled) {
      return { ready: false, reason: "SIX_ENABLED=false" };
    }

    const certPem = this.getCertificatePem();
    const keyPem = this.getPrivateKeyPem();
    if (!certPem || !keyPem) {
      return {
        ready: false,
        reason:
          "Missing SIX_CERT_PEM/SIX_KEY_PEM or SIX_CERT_PEM_PATH/SIX_KEY_PEM_PATH (use signed-certificate.pem + private-key.pem)",
      };
    }

    if (!certPem.includes("BEGIN CERTIFICATE")) {
      return {
        ready: false,
        reason: "SIX_CERT_PEM invalid: missing BEGIN CERTIFICATE",
      };
    }

    if (
      !keyPem.includes("BEGIN PRIVATE KEY") &&
      !keyPem.includes("BEGIN RSA PRIVATE KEY")
    ) {
      return {
        ready: false,
        reason:
          "SIX_KEY_PEM invalid: missing BEGIN PRIVATE KEY/BEGIN RSA PRIVATE KEY",
      };
    }

    return { ready: true, reason: "PEM certificate + key configured" };
  }

  async getInstitutionalQuotes(symbols: string[] = []): Promise<{
    provider: string;
    quotes: QuoteRecord[];
  }> {
    const normalizedSymbols = symbols.length ? symbols : DEFAULT_MARKET_SYMBOLS;
    const ids = normalizedSymbols
      .map((symbol) => SYMBOL_TO_VALOR_BC[symbol])
      .filter(Boolean);

    // this.logger.log(
    //   `getInstitutionalQuotes: symbols=[${normalizedSymbols.join(",")}], valorIds=[${ids.join(",")}]`,
    // );

    if (!ids.length) {
      // this.logger.warn("getInstitutionalQuotes: no VALOR IDs mapped, returning empty");
      // return { provider: "SIX-empty", quotes: [] };
    }

    const response = await this.callIntradaySnapshot(ids);
    const byId = this.extractQuotesByValorId(response);
    if (!byId.size) {
      this.warnNoParseableSnapshot(response, ids);
      return { provider: "SIX-empty", quotes: [] };
    }

    const quotes: QuoteRecord[] = normalizedSymbols.map((symbol) => {
      const valorId = SYMBOL_TO_VALOR_BC[symbol];
      const snapshot = valorId
        ? this.getSnapshotByIdentifier(byId, valorId)
        : undefined;
      const lastPrice = snapshot?.price;
      const asOf = snapshot?.asOf ?? new Date().toISOString();

      return {
        symbol,
        price: typeof lastPrice === "number" ? lastPrice : 0,
        change24hPct: this.normalizeChange(snapshot?.relativeChange),
        asOf,
        source: snapshot?.source ? `SIX ${snapshot.source}` : "SIX Verified",
      };
    });

    return {
      provider: "SIX-live",
      quotes,
    };
  }

  async getDebugSnapshot(symbols: string[] = []) {
    const normalizedSymbols = symbols.length ? symbols : DEFAULT_MARKET_SYMBOLS;
    const ids = normalizedSymbols
      .map((symbol) => SYMBOL_TO_VALOR_BC[symbol])
      .filter(Boolean);

    const readiness = this.getReadinessStatus();
    if (!readiness.ready) {
      return {
        ready: false,
        reason: readiness.reason,
        request: {
          symbols: normalizedSymbols,
          valorIds: ids,
        },
      };
    }

    if (!ids.length) {
      return {
        ready: true,
        request: {
          symbols: normalizedSymbols,
          valorIds: ids,
        },
        error: "No SIX VALOR identifiers mapped for requested symbols.",
      };
    }

    try {
      const payload = await this.callIntradaySnapshot(ids);
      const extracted = this.extractQuotesByValorId(payload);

      const matchedIds = ids.filter((id) =>
        Boolean(this.getSnapshotByIdentifier(extracted, id)),
      );

      return {
        ready: true,
        request: {
          symbols: normalizedSymbols,
          valorIds: ids,
        },
        payload: this.summarizePayloadShape(payload),
        extraction: {
          parsedQuoteCount: extracted.size,
          matchedValorIds: matchedIds,
          unmatchedValorIds: ids.filter((id) => !matchedIds.includes(id)),
          sampleParsedEntries: Array.from(extracted.entries())
            .slice(0, 10)
            .map(([id, quote]) => ({
              id,
              price: quote.price ?? null,
              asOf: quote.asOf ?? null,
              relativeChange: quote.relativeChange ?? null,
              source: quote.source ?? null,
            })),
        },
      };
    } catch (error) {
      return {
        ready: true,
        request: {
          symbols: normalizedSymbols,
          valorIds: ids,
        },
        error: String(error),
      };
    }
  }

  private warnNoParseableSnapshot(payload: unknown, requestedIds: string[]) {
    const now = Date.now();
    if (now < this.noParseWarnAfter) {
      return;
    }

    this.noParseWarnAfter = now + this.noParseWarnCooldownMs;

    const payloadKind = Array.isArray(payload)
      ? "array"
      : payload && typeof payload === "object"
        ? "object"
        : typeof payload;

    const topLevelKeys =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.keys(payload as Record<string, unknown>).slice(0, 12)
        : [];

    let rawDump = "";
    try {
      rawDump = JSON.stringify(payload, null, 2).slice(0, 2000);
    } catch {
      rawDump = "[unserializable]";
    }

    // this.logger.warn(
    //   `SIX returned no parseable intraday instruments from REST endpoint (kind=${payloadKind}, requestedIds=${requestedIds.join(",")}, keys=${topLevelKeys.join("|") || "n/a"})`,
    // );
    // this.logger.warn(`SIX raw payload dump (truncated to 2000 chars):\n${rawDump}`);
  }

  private normalizeChange(relative?: number): number {
    if (typeof relative !== "number" || Number.isNaN(relative)) {
      return 0;
    }

    if (Math.abs(relative) <= 1) {
      return Number((relative * 100).toFixed(2));
    }

    return Number(relative.toFixed(2));
  }

  private getPrivateKeyPassphrase(): string {
    return this.configService.get<string>("SIX_KEY_PASSPHRASE", "").trim();
  }

  private getCertificatePemPath(): string {
    return this.configService.get<string>("SIX_CERT_PEM_PATH", "").trim();
  }

  private getPrivateKeyPemPath(): string {
    return this.configService.get<string>("SIX_KEY_PEM_PATH", "").trim();
  }

  private normalizeMultiline(value: string): string {
    return value.replace(/\\n/g, "\n").trim();
  }

  private getCertificatePem(): string {
    const raw = this.configService.get<string>("SIX_CERT_PEM", "").trim();
    if (raw) {
      return this.normalizeMultiline(raw);
    }

    const filePath = this.getCertificatePemPath();
    if (!filePath) {
      return "";
    }

    try {
      return fs.readFileSync(filePath, "utf8").trim();
    } catch {
      return "";
    }
  }

  private getPrivateKeyPem(): string {
    const raw = this.configService.get<string>("SIX_KEY_PEM", "").trim();
    if (raw) {
      return this.normalizeMultiline(raw);
    }

    const filePath = this.getPrivateKeyPemPath();
    if (!filePath) {
      return "";
    }

    try {
      return fs.readFileSync(filePath, "utf8").trim();
    } catch {
      return "";
    }
  }

  private callIntradaySnapshot(
    ids: string[],
  ): Promise<SixRestSnapshotResponse> {
    const certPem = this.getCertificatePem();
    const keyPem = this.getPrivateKeyPem();
    const keyPassphrase = this.getPrivateKeyPassphrase();

    if (!certPem || !keyPem) {
      throw new Error(
        "SIX mTLS is not configured. Set SIX_CERT_PEM + SIX_KEY_PEM (or SIX_CERT_PEM_PATH + SIX_KEY_PEM_PATH).",
      );
    }

    if (!certPem.includes("BEGIN CERTIFICATE")) {
      throw new Error(
        "SIX_CERT_PEM is invalid: expected PEM certificate block.",
      );
    }

    if (
      !keyPem.includes("BEGIN PRIVATE KEY") &&
      !keyPem.includes("BEGIN RSA PRIVATE KEY")
    ) {
      throw new Error(
        "SIX_KEY_PEM is invalid: expected PEM private key block from private-key.pem.",
      );
    }

    const requestSingleEndpoint = (
      baseEndpoint: string,
    ): Promise<SixRestSnapshotResponse> => {
      const url = new URL(baseEndpoint);
      url.searchParams.set("scheme", "VALOR_BC");
      url.searchParams.set("ids", ids.join(","));
      url.searchParams.set("preferredLanguage", "EN");

      // this.logger.log(
      //   `SIX REST request: GET ${url.pathname}?${url.searchParams.toString()} (${ids.length} IDs)`,
      // );

      return new Promise((resolve, reject) => {
        const req = https.request(
          {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port ? Number(url.port) : 443,
            path: `${url.pathname}${url.search}`,
            method: "GET",
            cert: certPem,
            key: keyPem,
            passphrase: keyPassphrase || undefined,
            headers: {
              accept: "application/json",
            },
            timeout: 10_000,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const body = Buffer.concat(chunks).toString("utf8");
              // this.logger.log(
              //   `SIX REST response: ${res.statusCode} from ${url.pathname} (${body.length} bytes)`,
              // );
              if (res.statusCode && res.statusCode >= 400) {
                this.logger.warn(
                  `SIX REST endpoint error: ${res.statusCode} at ${url.pathname} — body: ${body.slice(0, 500)}`,
                );
                return reject(
                  new Error(
                    `SIX intraday snapshot failed (${res.statusCode}) at ${url.pathname}: ${body.slice(0, 300)}`,
                  ),
                );
              }

              try {
                const parsed = JSON.parse(body) as SixRestSnapshotResponse;
                // this.logger.log(
                //   `SIX REST parsed successfully from ${url.pathname}: type=${Array.isArray(parsed) ? "array" : typeof parsed}`,
                // );
                resolve(parsed);
              } catch (error) {
                this.logger.error(
                  `SIX REST JSON parse failed from ${url.pathname}: ${String(error)}`,
                );
                reject(
                  new Error(`Invalid SIX REST response: ${String(error)}`),
                );
              }
            });
          },
        );

        req.on("timeout", () => {
          this.logger.error(`SIX REST timeout at ${url.pathname}`);
          req.destroy(new Error("SIX intraday snapshot timeout"));
        });
        req.on("error", (error) => {
          this.logger.error(
            `SIX REST connection error at ${url.pathname}: ${String(error)}`,
          );
          reject(error);
        });
        req.end();
      });
    };

    return (async () => {
      let lastError: unknown;
      for (const endpoint of this.intradaySnapshotUrls) {
        try {
          // this.logger.log(`Trying SIX endpoint: ${endpoint}`);
          const result = await requestSingleEndpoint(endpoint);
          // this.logger.log(`SIX endpoint succeeded: ${endpoint}`);
          return result;
        } catch (error) {
          this.logger.warn(
            `SIX endpoint failed: ${endpoint} — ${String(error)}`,
          );
          lastError = error;
        }
      }

      this.logger.error(
        `All SIX intraday snapshot endpoints failed. Last error: ${String(lastError)}`,
      );
      throw lastError instanceof Error
        ? lastError
        : new Error(
            "SIX intraday snapshot failed for all configured endpoints",
          );
    })();
  }

  private extractQuotesByValorId(
    payload: SixRestSnapshotResponse,
  ): Map<string, SnapshotQuote> {
    const quotes = new Map<string, SnapshotQuote>();
    const visit = (node: unknown) => {
      if (!node) {
        return;
      }

      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }

      if (typeof node !== "object") {
        return;
      }

      const record = node as Record<string, unknown>;
      const children = Object.values(record);

      const instrument =
        (record.instrument as Record<string, unknown> | undefined) ?? {};
      const lookup =
        (record.lookup as Record<string, unknown> | undefined) ?? {};
      const symbolCandidates = [
        record.symbol,
        record.ticker,
        record.instrumentSymbol,
        instrument.symbol,
        instrument.ticker,
        instrument.instrumentSymbol,
      ]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);

      const mappedIdsFromSymbol = symbolCandidates
        .map((symbol) => SYMBOL_TO_VALOR_BC[symbol])
        .filter((value): value is string => typeof value === "string");

      const idCandidates = [
        record.requestedId,
        record.id,
        record.valorBc,
        record.valorBC,
        record.valor,
        record.valorId,
        record.valorNumber,
        instrument.id,
        instrument.valorBc,
        instrument.valorBC,
        instrument.valor,
        instrument.valorId,
        instrument.valorNumber,
        ...mappedIdsFromSymbol,
      ];

      const resolvedId = idCandidates
        .map((value) => this.normalizeIdentifier(value))
        .find((value): value is string => Boolean(value));

      const snapshot =
        (record.intradaySnapshot as Record<string, unknown> | undefined) ??
        ((record.marketData as Record<string, unknown> | undefined)
          ?.intradaySnapshot as Record<string, unknown> | undefined);

      const fallbackPrice =
        this.toNumber(record.lastPrice) ??
        this.toNumber(record.price) ??
        this.toNumber(record.close) ??
        this.toNumber(
          (record.marketData as Record<string, unknown> | undefined)?.lastPrice,
        );

      if (resolvedId && snapshot) {
        const last = snapshot.last as Record<string, unknown> | undefined;
        const open = snapshot.open as Record<string, unknown> | undefined;
        const change = snapshot.change as Record<string, unknown> | undefined;

        // SIX REST uses "value" not "price" for quote fields
        const price =
          this.toNumber(last?.value) ??
          this.toNumber(last?.price) ??
          this.toNumber(snapshot.lastPrice) ??
          this.toNumber(snapshot.price) ??
          fallbackPrice;

        if (price !== undefined) {
          const normalizedId = this.normalizeIdentifier(resolvedId);
          if (!normalizedId) {
            children.forEach(visit);
            return;
          }

          // Compute relative change from open if not explicitly provided
          const openPrice =
            this.toNumber(open?.value) ?? this.toNumber(open?.price);
          const computedRelativeChange =
            openPrice && openPrice > 0
              ? (price - openPrice) / openPrice
              : undefined;

          const entry: SnapshotQuote = {
            price,
            asOf:
              (last?.timestamp as string | undefined) ??
              (last?.time as string | undefined) ??
              (snapshot.timestamp as string | undefined) ??
              (snapshot.time as string | undefined) ??
              (record.time as string | undefined) ??
              (record.asOf as string | undefined),
            relativeChange:
              this.toNumber(change?.relative) ??
              this.toNumber(snapshot.relativeChange) ??
              this.toNumber(snapshot.changePercent) ??
              this.toNumber(record.changePercent) ??
              this.toNumber(record.relativeChange) ??
              computedRelativeChange,
            source:
              (lookup.listingShortName as string | undefined) ??
              (record.shortName as string | undefined) ??
              (record.name as string | undefined),
          };

          quotes.set(normalizedId, entry);
          const canonical = this.canonicalIdentifier(normalizedId);
          if (canonical && canonical !== normalizedId) {
            quotes.set(canonical, entry);
          }
        }
      }

      children.forEach(visit);
    };

    visit(payload);

    // this.logger.log(
    //   `extractQuotesByValorId: extracted ${quotes.size} quotes, IDs: [${Array.from(quotes.keys()).join(", ")}]`,
    // );

    return quotes;
  }

  private getSnapshotByIdentifier(
    quotes: Map<string, SnapshotQuote>,
    requestedId: string,
  ): SnapshotQuote | undefined {
    const normalized = this.normalizeIdentifier(requestedId);
    if (!normalized) {
      return undefined;
    }

    const direct = quotes.get(normalized);
    if (direct) {
      return direct;
    }

    const canonical = this.canonicalIdentifier(normalized);
    if (canonical) {
      const fromCanonical = quotes.get(canonical);
      if (fromCanonical) {
        return fromCanonical;
      }
    }

    return undefined;
  }

  private normalizeIdentifier(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value !== "string") {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : undefined;
  }

  private canonicalIdentifier(value: string): string {
    return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }

  private summarizePayloadShape(payload: unknown) {
    const isArrayPayload = Array.isArray(payload);
    const rootType = isArrayPayload
      ? "array"
      : payload && typeof payload === "object"
        ? "object"
        : typeof payload;

    const rootKeys =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.keys(payload as Record<string, unknown>).slice(0, 30)
        : [];

    const sampleNodes = this.collectSampleNodes(payload, 12);

    return {
      rootType,
      rootKeys,
      sampleNodes,
    };
  }

  private collectSampleNodes(
    payload: unknown,
    maxSamples: number,
  ): SixDebugSampleNode[] {
    const samples: SixDebugSampleNode[] = [];

    const walk = (node: unknown, path: string) => {
      if (samples.length >= maxSamples) return;
      if (!node || typeof node !== "object") return;

      if (Array.isArray(node)) {
        node.slice(0, 4).forEach((child, index) => {
          walk(child, `${path}[${index}]`);
        });
        return;
      }

      const record = node as Record<string, unknown>;
      const keys = Object.keys(record);

      const idHints = [
        record.requestedId,
        record.id,
        record.valor,
        record.valorBc,
        record.valorBC,
        record.valorId,
        (record.instrument as Record<string, unknown> | undefined)?.id,
      ]
        .filter(
          (value): value is string | number =>
            typeof value === "string" || typeof value === "number",
        )
        .map((value) => String(value));

      const symbolHints = [
        record.symbol,
        record.ticker,
        (record.lookup as Record<string, unknown> | undefined)
          ?.listingShortName,
        (record.instrument as Record<string, unknown> | undefined)?.symbol,
        (record.instrument as Record<string, unknown> | undefined)?.ticker,
      ]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);

      const priceCandidates = [
        record.price,
        record.lastPrice,
        (record.last as Record<string, unknown> | undefined)?.value,
        (record.last as Record<string, unknown> | undefined)?.price,
        (
          (record.intradaySnapshot as Record<string, unknown> | undefined)
            ?.last as Record<string, unknown> | undefined
        )?.value,
        (
          (record.intradaySnapshot as Record<string, unknown> | undefined)
            ?.last as Record<string, unknown> | undefined
        )?.price,
        (record.intradaySnapshot as Record<string, unknown> | undefined)
          ?.lastPrice,
        (
          (record.marketData as Record<string, unknown> | undefined)
            ?.intradaySnapshot as Record<string, unknown> | undefined
        )?.last
          ? ((
              (
                (record.marketData as Record<string, unknown> | undefined)
                  ?.intradaySnapshot as Record<string, unknown> | undefined
              )?.last as Record<string, unknown> | undefined
            )?.value as unknown)
          : undefined,
      ]
        .map((value) => this.toNumber(value))
        .filter((value): value is number => typeof value === "number");

      if (idHints.length || symbolHints.length || priceCandidates.length) {
        samples.push({
          path,
          keys: keys.slice(0, 20),
          idHints: idHints.slice(0, 10),
          symbolHints: symbolHints.slice(0, 10),
          priceHints: priceCandidates.slice(0, 10),
        });
      }

      keys.slice(0, 12).forEach((key) => {
        walk(record[key], `${path}.${key}`);
      });
    };

    walk(payload, "$root");
    return samples;
  }
}export const GET_MARKET_STATUS_QUERY = `
query GetMarketStatus($ids: [String!]!) {
  instruments(ids: $ids, scheme: VALOR_BC) {
    id
    shortName
    listings {
      market {
        name
      }
      marketData {
        intradaySnapshot {
          last {
            price
            time
          }
          change {
            absolute
            relative
          }
        }
      }
    }
  }
}
`;

export const SYMBOL_TO_VALOR_BC: Record<string, string> = {
  XAUUSD: "274702_148",
  XAGUSD: "274720_148",
  OILHVY: "11554324_5315",
  NATGAS: "274551_301",
  EURUSD: "946681_148",
  USDCHF: "275164_148",
  GBPUSD: "275017_148",
  USDSGD: "275000_148",
  BLK: "138405792_65",
  FOREX_RANK_1: "10461775_148",
};

export const DEFAULT_MARKET_SYMBOLS = [
  "EURUSD",
  "USDCHF",
  "XAUUSD",
  "XAGUSD",
  "OILHVY",
  "NATGAS",
  "BLK",
  "USDSGD",
];/**
 * backend/src/solstice/solstice.service.ts
 * ──────────────────────────────────────────
 * Solstice USX API integration service.
 * Calls Solstice HTTP API to build mint/redeem/yield instructions.
 */

import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PublicKey, AccountMeta } from "@solana/web3.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { 
  createAssociatedTokenAccountIdempotentInstruction, 
  getAssociatedTokenAddressSync, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";

const execFileAsync = promisify(execFile);

interface SolanaInstruction {
  programId: PublicKey;
  keys: AccountMeta[];
  data: Buffer;
}

interface SolsticeInstructionRequest {
  type:
    | "RequestMint"
    | "ConfirmMint"
    | "CancelMint"
    | "RequestRedeem"
    | "ConfirmRedeem"
    | "CancelRedeem"
    | "Lock"
    | "Unlock"
    | "Withdraw";
  data: Record<string, unknown>;
}

interface SolsticeInstructionResponse {
  instruction: {
    program_id: number[];
    accounts: Array<{
      pubkey: number[];
      is_signer: boolean;
      is_writable: boolean;
    }>;
    data: number[];
  };
}

type CollateralKind = "usdc" | "usdt";

@Injectable()
export class SolsticeService {
  private readonly logger = new Logger(SolsticeService.name);
  private readonly apiKey = process.env.SOLSTICE_API_KEY || "";
  private readonly apiUrl =
    process.env.SOLSTICE_API_URL || "https://instructions.solstice.finance";

  // Devnet mint addresses
  readonly mints = {
    usdc: "8iBux2LRja1PhVZph8Rw4Hi45pgkaufNEiaZma5nTD5g",
    usdt: "5dXXpWyZCCPhBHxmp79Du81t7t9oh7HacUW864ARFyft",
    usx: "7QC4zjrKA6XygpXPQCKSS9BmAsEFDJR6awiHSdgLcDvS",
    eusx: "Gkt9h4QWpPBDtbaF5HvYKCc87H5WCRTUtMf77HdTGHBt",
  };

  constructor() {
    if (!this.apiKey) {
      this.logger.warn(
        "SOLSTICE_API_KEY not set; Solstice API calls will fail",
      );
    }
    this.logger.log(`Solstice service initialized. API URL: ${this.apiUrl}`);
  }

  /**
   * Request a mint instruction: USDC/USDT → USX
   * Returns serialized instruction to add to transaction.
   */
  async buildMintInstruction(
    user: string,
    amount: number,
    collateral: CollateralKind = "usdc",
    payerWallet?: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `[buildMintInstruction] user=${user}, amount=${amount}, collateral=${collateral}, payer=${payerWallet}`,
    );
    const request: SolsticeInstructionRequest = {
      type: "RequestMint",
      data: {
        user,
        amount,
        collateral,
        ...(payerWallet && { payer: payerWallet }),
      },
    };

    return this.buildInstruction(request);
  }

  /**
   * Confirm a mint: finalize the USX minting.
   */
  async buildConfirmMintInstruction(
    user: string,
    collateral: CollateralKind = "usdc",
    usxAccount?: string,
    payerWallet?: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `[buildConfirmMintInstruction] user=${user}, collateral=${collateral}, usxAccount=${usxAccount}, payer=${payerWallet}`,
    );
    const request: SolsticeInstructionRequest = {
      type: "ConfirmMint",
      data: {
        user,
        collateral,
        ...(usxAccount && { usx_account: usxAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };

    return this.buildInstruction(request);
  }

  /**
   * Cancel a mint: revert pending mint request.
   */
  async buildCancelMintInstruction(
    user: string,
    collateral: CollateralKind = "usdc",
    collateralAccount?: string,
    payerWallet?: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `[buildCancelMintInstruction] user=${user}, collateral=${collateral}, collateralAccount=${collateralAccount}, payer=${payerWallet}`,
    );
    const request: SolsticeInstructionRequest = {
      type: "CancelMint",
      data: {
        user,
        collateral,
        ...(collateralAccount && { collateral_account: collateralAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };

    return this.buildInstruction(request);
  }

  /**
   * Request a redeem: USX → USDC/USDT
   */
  async buildRedeemInstruction(
    user: string,
    amount: number,
    collateral: CollateralKind = "usdc",
    usxAccount?: string,
    payerWallet?: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `[buildRedeemInstruction] user=${user}, amount=${amount}, collateral=${collateral}, usxAccount=${usxAccount}, payer=${payerWallet}`,
    );
    const request: SolsticeInstructionRequest = {
      type: "RequestRedeem",
      data: {
        user,
        amount,
        collateral,
        ...(usxAccount && { usx_account: usxAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };

    return this.buildInstruction(request);
  }

  /**
   * Confirm a redeem: finalize USX → collateral swap.
   */
  async buildConfirmRedeemInstruction(
    user: string,
    collateral: CollateralKind = "usdc",
    collateralAccount?: string,
    payerWallet?: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `[buildConfirmRedeemInstruction] user=${user}, collateral=${collateral}, collateralAccount=${collateralAccount}, payer=${payerWallet}`,
    );
    const request: SolsticeInstructionRequest = {
      type: "ConfirmRedeem",
      data: {
        user,
        collateral,
        ...(collateralAccount && { collateral_account: collateralAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };

    return this.buildInstruction(request);
  }

  /**
   * Lock USX into YieldVault: USX → eUSX (begins earning yield)
   */
  async buildLockInstruction(
    user: string,
    amount: number,
    usxAccount?: string,
    eusxAccount?: string,
    payerWallet?: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `[buildLockInstruction] user=${user}, amount=${amount}, usxAccount=${usxAccount}, eusxAccount=${eusxAccount}, payer=${payerWallet}`,
    );
    const request: SolsticeInstructionRequest = {
      type: "Lock",
      data: {
        user,
        amount,
        ...(usxAccount && { usx_account: usxAccount }),
        ...(eusxAccount && { eusx_account: eusxAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };

    return this.buildInstruction(request);
  }

  /**
   * Unlock eUSX from YieldVault: eUSX → USX (stop earning, prepare to redeem)
   */
  async buildUnlockInstruction(
    user: string,
    amount: number,
    eusxAccount?: string,
    payerWallet?: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `[buildUnlockInstruction] user=${user}, amount=${amount}, eusxAccount=${eusxAccount}, payer=${payerWallet}`,
    );
    const request: SolsticeInstructionRequest = {
      type: "Unlock",
      data: {
        user,
        amount,
        ...(eusxAccount && { eusx_account: eusxAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };

    return this.buildInstruction(request);
  }

  /**
   * Withdraw eUSX from YieldVault: claim earned yield and principal.
   */
  async buildWithdrawInstruction(
    user: string,
    amount: number,
    eusxAccount?: string,
    usxAccount?: string,
    payerWallet?: string,
  ): Promise<Buffer> {
    this.logger.debug(
      `[buildWithdrawInstruction] user=${user}, amount=${amount}, eusxAccount=${eusxAccount}, usxAccount=${usxAccount}, payer=${payerWallet}`,
    );
    const request: SolsticeInstructionRequest = {
      type: "Withdraw",
      data: {
        user,
        amount,
        ...(eusxAccount && { eusx_account: eusxAccount }),
        ...(usxAccount && { usx_account: usxAccount }),
        ...(payerWallet && { payer: payerWallet }),
      },
    };

    return this.buildInstruction(request);
  }

  /**
   * Generic build instruction: calls Solstice API and returns serialized instruction.
   */
  private async buildInstruction(
    request: SolsticeInstructionRequest,
  ): Promise<Buffer> {
    try {
      this.logger.debug(
        `[buildInstruction] Calling Solstice API for type=${request.type}, data=${JSON.stringify(request.data)}`,
      );

      const response = await fetch(`${this.apiUrl}/v1/instructions`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `[buildInstruction] API returned ${response.status}: ${errorText}`,
        );
        throw new Error(`Solstice API error: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as SolsticeInstructionResponse;
      const { instruction } = data;
      this.logger.debug(
        `[buildInstruction] Successfully received instruction for type=${request.type}`,
      );

      // Convert instruction to Solana Instruction format
      // (Solstice returns raw byte arrays; we reconstruct the Instruction)
      const serialized = this.reconstructInstruction(instruction);
      this.logger.debug(
        `[buildInstruction] Reconstructed instruction, size=${serialized.length} bytes`,
      );
      return serialized;
    } catch (error) {
      this.logger.error(
        `Solstice API error (${request.type}):`,
        error instanceof Error ? error.message : String(error),
      );
      throw new BadRequestException(
        `Failed to build Solstice instruction: ${request.type}`,
      );
    }
  }

  /**
   * Reconstruct a Solana Instruction (Buffer format) from Solstice API response.
   */
  private reconstructInstruction(
    instructionData: SolsticeInstructionResponse["instruction"],
  ): Buffer {
    // Convert accounts and data to Solana Instruction format
    // This is a simplified reconstruction; adjust based on exact format needed
    this.logger.debug(
      `[reconstructInstruction] Reconstructing instruction with ${instructionData.accounts.length} accounts`,
    );

    const programId = Buffer.from(instructionData.program_id);
    this.logger.debug(
      `[reconstructInstruction] Program ID: ${programId.toString("hex").substring(0, 16)}...`,
    );

    const accountsData = Buffer.concat(
      instructionData.accounts.map((acc, idx) => {
        const pubkey = Buffer.from(acc.pubkey);
        const isSigner = Buffer.from([acc.is_signer ? 1 : 0]);
        const isWritable = Buffer.from([acc.is_writable ? 1 : 0]);
        this.logger.debug(
          `[reconstructInstruction] Account ${idx}: pubkey=${pubkey.toString("hex").substring(0, 16)}..., signer=${acc.is_signer}, writable=${acc.is_writable}`,
        );
        return Buffer.concat([pubkey, isSigner, isWritable]);
      }),
    );
    const data = Buffer.from(instructionData.data);
    this.logger.debug(
      `[reconstructInstruction] Instruction data size: ${data.length} bytes`,
    );

    // Pack: 32 bytes program_id + accounts + data
    return Buffer.concat([programId, accountsData, data]);
  }

  /**
   * Convert Solstice API instruction response to a proper Solana Instruction object.
   * Ready to add to a Transaction.
   */
  private toSolanaInstruction(
    instructionData: SolsticeInstructionResponse["instruction"],
    userWallet: string,
  ): SolanaInstruction {
    this.logger.debug(
      `[toSolanaInstruction] Converting API response to Solana Instruction`,
    );

    const programId = new PublicKey(instructionData.program_id);
    
    // Maintain EXACT account order and flags from Solstice API.
    // De-duplication or stripping signers often breaks on-chain program logic
    // and causes signature verification failures in simulation.
    const keys: AccountMeta[] = instructionData.accounts.map((acc) => ({
      pubkey: new PublicKey(acc.pubkey),
      isSigner: acc.is_signer, // Preserve original signer flag from API
      isWritable: acc.is_writable,
    }));
    
    const data = Buffer.from(instructionData.data);

    this.logger.debug(
      `[toSolanaInstruction] Created Instruction with ${keys.length} account metas, data size: ${data.length} bytes`,
    );
    return {
      programId,
      keys,
      data,
    };
  }

  /**
   * Convenience: Build a full deposit flow (USDC → USX → eUSX)
   * Returns array of instructions to add to transaction.
   */
  async buildDepositFlow(
    userWallet: string,
    amount: number,
    backendSigner: string,
  ): Promise<Buffer[]> {
    const instructions: Buffer[] = [];

    try {
      this.logger.log(
        `[buildDepositFlow] Starting deposit flow for user=${userWallet}, amount=${amount}`,
      );

      // Step 1: Request mint (USDC → USX)
      this.logger.log(
        `[buildDepositFlow] Step 1/3: Building RequestMint instruction...`,
      );
      const mintInst = await this.buildMintInstruction(
        userWallet,
        amount,
        "usdc",
        backendSigner,
      );
      instructions.push(mintInst);
      this.logger.log(
        `[buildDepositFlow] Step 1 complete: RequestMint instruction added`,
      );

      // Step 2: Confirm mint
      this.logger.log(
        `[buildDepositFlow] Step 2/3: Building ConfirmMint instruction...`,
      );
      const confirmInst = await this.buildConfirmMintInstruction(
        userWallet,
        "usdc",
        undefined,
        backendSigner,
      );
      instructions.push(confirmInst);
      this.logger.log(
        `[buildDepositFlow] Step 2 complete: ConfirmMint instruction added`,
      );

      // Step 3: Lock into yield vault (USX → eUSX)
      this.logger.log(
        `[buildDepositFlow] Step 3/3: Building Lock instruction...`,
      );
      const lockInst = await this.buildLockInstruction(
        userWallet,
        amount,
        undefined,
        undefined,
        backendSigner,
      );
      instructions.push(lockInst);
      this.logger.log(
        `[buildDepositFlow] Step 3 complete: Lock instruction added`,
      );

      this.logger.log(
        `[buildDepositFlow] Deposit flow complete. Total instructions: ${instructions.length}`,
      );
      return instructions;
    } catch (error) {
      this.logger.error(
        "Failed to build deposit flow:",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Convenience: Build a full withdrawal flow (eUSX → USX → USDC)
   */
  async buildWithdrawalFlow(
    userWallet: string,
    amount: number,
    backendSigner: string,
  ): Promise<Buffer[]> {
    const instructions: Buffer[] = [];

    try {
      this.logger.log(
        `[buildWithdrawalFlow] Starting withdrawal flow for user=${userWallet}, amount=${amount}`,
      );

      // Step 1: Unlock from yield vault (eUSX → USX)
      this.logger.log(
        `[buildWithdrawalFlow] Step 1/4: Building Unlock instruction...`,
      );
      const unlockInst = await this.buildUnlockInstruction(
        userWallet,
        amount,
        undefined,
        backendSigner,
      );
      instructions.push(unlockInst);
      this.logger.log(
        `[buildWithdrawalFlow] Step 1 complete: Unlock instruction added`,
      );

      // Step 2: Withdraw earned yield
      this.logger.log(
        `[buildWithdrawalFlow] Step 2/4: Building Withdraw instruction...`,
      );
      const withdrawInst = await this.buildWithdrawInstruction(
        userWallet,
        amount,
        undefined,
        undefined,
        backendSigner,
      );
      instructions.push(withdrawInst);
      this.logger.log(
        `[buildWithdrawalFlow] Step 2 complete: Withdraw instruction added`,
      );

      // Step 3: Redeem USX back to USDC
      this.logger.log(
        `[buildWithdrawalFlow] Step 3/4: Building RequestRedeem instruction...`,
      );
      const redeemInst = await this.buildRedeemInstruction(
        userWallet,
        amount,
        "usdc",
        undefined,
        backendSigner,
      );
      instructions.push(redeemInst);
      this.logger.log(
        `[buildWithdrawalFlow] Step 3 complete: RequestRedeem instruction added`,
      );

      // Step 4: Confirm redeem
      this.logger.log(
        `[buildWithdrawalFlow] Step 4/4: Building ConfirmRedeem instruction...`,
      );
      const confirmInst = await this.buildConfirmRedeemInstruction(
        userWallet,
        "usdc",
        undefined,
        backendSigner,
      );
      instructions.push(confirmInst);
      this.logger.log(
        `[buildWithdrawalFlow] Step 4 complete: ConfirmRedeem instruction added`,
      );

      this.logger.log(
        `[buildWithdrawalFlow] Withdrawal flow complete. Total instructions: ${instructions.length}`,
      );
      return instructions;
    } catch (error) {
      this.logger.error(
        "Failed to build withdrawal flow:",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Build deposit flow and return array of Solana Instruction objects (ready to add to Transaction).
   * Orchestrates: RequestMint → ConfirmMint → Lock
   */
  async buildDepositFlowInstructions(
    userWallet: string,
    amount: number,
    payerWallet?: string,
  ): Promise<SolanaInstruction[]> {
    this.logger.log(
      `[buildDepositFlowInstructions] Building deposit flow instructions for user=${userWallet}, amount=${amount}`,
    );
    const instructions: SolanaInstruction[] = [];

    const userPubkey = new PublicKey(userWallet);
    const usxMint = new PublicKey(this.mints.usx);
    const eusxMint = new PublicKey(this.mints.eusx);
    const payerPubkey = payerWallet ? new PublicKey(payerWallet) : userPubkey;

    try {
      // Step 0: Ensure ATAs exist (idempotent)
      this.logger.log(`[buildDepositFlowInstructions] Step 0: Ensuring USX and eUSX ATAs exist...`);
      
      const usxAta = getAssociatedTokenAddressSync(usxMint, userPubkey);
      const eusxAta = getAssociatedTokenAddressSync(eusxMint, userPubkey);

      instructions.push({
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: payerPubkey, isSigner: true, isWritable: true },
          { pubkey: usxAta, isSigner: false, isWritable: true },
          { pubkey: userPubkey, isSigner: false, isWritable: false },
          { pubkey: usxMint, isSigner: false, isWritable: false },
          { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // System program placeholder if needed, but spl-token usually has its own
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        // Actually it's better to use the proper helper to get the instruction and then convert it
        ...this.toSolanaInstructionFromWeb3(
          createAssociatedTokenAccountIdempotentInstruction(
            payerPubkey,
            usxAta,
            userPubkey,
            usxMint
          )
        )
      });

      instructions.push({
        ...this.toSolanaInstructionFromWeb3(
          createAssociatedTokenAccountIdempotentInstruction(
            payerPubkey,
            eusxAta,
            userPubkey,
            eusxMint
          )
        )
      });

      this.logger.log(`[buildDepositFlowInstructions] Step 0 complete: ATA instructions added`);

      // Step 1: Request mint (USDC → USX)
      this.logger.log(
        `[buildDepositFlowInstructions] Step 1/3: Building RequestMint instruction...`,
      );
      const mintRequest: SolsticeInstructionRequest = {
        type: "RequestMint",
        data: {
          user: userWallet,
          amount,
          collateral: "usdc",
          ...(payerWallet && { payer: payerWallet }),
        },
      };
      const mintResponse = await this.fetchInstructionFromApi(mintRequest);
      instructions.push(this.toSolanaInstruction(mintResponse.instruction, payerWallet || userWallet));
      this.logger.log(
        `[buildDepositFlowInstructions] Step 1 complete: RequestMint instruction added`,
      );

      // Step 2: Confirm mint
      this.logger.log(
        `[buildDepositFlowInstructions] Step 2/3: Building ConfirmMint instruction...`,
      );
      const confirmRequest: SolsticeInstructionRequest = {
        type: "ConfirmMint",
        data: {
          user: userWallet,
          collateral: "usdc",
          ...(payerWallet && { payer: payerWallet }),
        },
      };
      const confirmResponse =
        await this.fetchInstructionFromApi(confirmRequest);
      instructions.push(this.toSolanaInstruction(confirmResponse.instruction, payerWallet || userWallet));
      this.logger.log(
        `[buildDepositFlowInstructions] Step 2 complete: ConfirmMint instruction added`,
      );

      // Step 3: Lock into yield vault (USX → eUSX)
      this.logger.log(
        `[buildDepositFlowInstructions] Step 3/3: Building Lock instruction...`,
      );
      const lockRequest: SolsticeInstructionRequest = {
        type: "Lock",
        data: {
          user: userWallet,
          amount,
          ...(payerWallet && { payer: payerWallet }),
        },
      };
      const lockResponse = await this.fetchInstructionFromApi(lockRequest);
      instructions.push(this.toSolanaInstruction(lockResponse.instruction, payerWallet || userWallet));
      this.logger.log(
        `[buildDepositFlowInstructions] Step 3 complete: Lock instruction added`,
      );

      this.logger.log(
        `[buildDepositFlowInstructions] Complete. Total Solana instructions: ${instructions.length}`,
      );
      return instructions;
    } catch (error) {
      this.logger.error(
        "Failed to build deposit flow instructions:",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Build withdrawal flow and return array of Solana Instruction objects (ready to add to Transaction).
   * Orchestrates: Unlock → Withdraw → RequestRedeem → ConfirmRedeem
   */
  async buildWithdrawalFlowInstructions(
    userWallet: string,
    amount: number,
    payerWallet?: string,
  ): Promise<SolanaInstruction[]> {
    const instructions: SolanaInstruction[] = [];

    const userPubkey = new PublicKey(userWallet);
    const usxMint = new PublicKey(this.mints.usx);
    const usdcMint = new PublicKey(this.mints.usdc);
    const payerPubkey = payerWallet ? new PublicKey(payerWallet) : userPubkey;

    try {
      // Step 0: Ensure ATAs exist
      this.logger.log(`[buildWithdrawalFlowInstructions] Step 0: Ensuring USDC and USX ATAs exist...`);
      const usdcAta = getAssociatedTokenAddressSync(usdcMint, userPubkey);
      const usxAta = getAssociatedTokenAddressSync(usxMint, userPubkey);

      instructions.push({
        ...this.toSolanaInstructionFromWeb3(
          createAssociatedTokenAccountIdempotentInstruction(
            payerPubkey,
            usdcAta,
            userPubkey,
            usdcMint
          )
        )
      });

      instructions.push({
        ...this.toSolanaInstructionFromWeb3(
          createAssociatedTokenAccountIdempotentInstruction(
            payerPubkey,
            usxAta,
            userPubkey,
            usxMint
          )
        )
      });

      this.logger.log(`[buildWithdrawalFlowInstructions] Step 0 complete: ATA instructions added`);

      // Step 1: Unlock from yield vault (eUSX → USX)
      this.logger.log(
        `[buildWithdrawalFlowInstructions] Step 1/4: Building Unlock instruction...`,
      );
      const unlockRequest: SolsticeInstructionRequest = {
        type: "Unlock",
        data: {
          user: userWallet,
          amount,
          ...(payerWallet && { payer: payerWallet }),
        },
      };
      const unlockResponse = await this.fetchInstructionFromApi(unlockRequest);
      instructions.push(this.toSolanaInstruction(unlockResponse.instruction, payerWallet || userWallet));
      this.logger.log(
        `[buildWithdrawalFlowInstructions] Step 1 complete: Unlock instruction added`,
      );

      // Step 2: Withdraw earned yield
      this.logger.log(
        `[buildWithdrawalFlowInstructions] Step 2/4: Building Withdraw instruction...`,
      );
      const withdrawRequest: SolsticeInstructionRequest = {
        type: "Withdraw",
        data: {
          user: userWallet,
          amount,
          ...(payerWallet && { payer: payerWallet }),
        },
      };
      const withdrawResponse =
        await this.fetchInstructionFromApi(withdrawRequest);
      instructions.push(this.toSolanaInstruction(withdrawResponse.instruction, payerWallet || userWallet));
      this.logger.log(
        `[buildWithdrawalFlowInstructions] Step 2 complete: Withdraw instruction added`,
      );

      // Step 3: Redeem USX back to USDC
      this.logger.log(
        `[buildWithdrawalFlowInstructions] Step 3/4: Building RequestRedeem instruction...`,
      );
      const redeemRequest: SolsticeInstructionRequest = {
        type: "RequestRedeem",
        data: {
          user: userWallet,
          amount,
          collateral: "usdc",
          ...(payerWallet && { payer: payerWallet }),
        },
      };
      const redeemResponse = await this.fetchInstructionFromApi(redeemRequest);
      instructions.push(this.toSolanaInstruction(redeemResponse.instruction, payerWallet || userWallet));
      this.logger.log(
        `[buildWithdrawalFlowInstructions] Step 3 complete: RequestRedeem instruction added`,
      );

      // Step 4: Confirm redeem
      this.logger.log(
        `[buildWithdrawalFlowInstructions] Step 4/4: Building ConfirmRedeem instruction...`,
      );
      const confirmRequest: SolsticeInstructionRequest = {
        type: "ConfirmRedeem",
        data: {
          user: userWallet,
          collateral: "usdc",
          ...(payerWallet && { payer: payerWallet }),
        },
      };
      const confirmResponse =
        await this.fetchInstructionFromApi(confirmRequest);
      instructions.push(this.toSolanaInstruction(confirmResponse.instruction, payerWallet || userWallet));
      this.logger.log(
        `[buildWithdrawalFlowInstructions] Step 4 complete: ConfirmRedeem instruction added`,
      );

      this.logger.log(
        `[buildWithdrawalFlowInstructions] Complete. Total Solana instructions: ${instructions.length}`,
      );
      return instructions;
    } catch (error) {
      this.logger.error(
        "Failed to build withdrawal flow instructions:",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Helper: Fetch raw instruction response from Solstice API without conversion.
   */
  private async fetchInstructionFromApi(
    request: SolsticeInstructionRequest,
  ): Promise<SolsticeInstructionResponse> {
    try {
      this.logger.debug(
        `[fetchInstructionFromApi] Calling Solstice API for type=${request.type}`,
      );

      const response = await fetch(`${this.apiUrl}/v1/instructions`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `[fetchInstructionFromApi] API returned ${response.status}: ${errorText}`,
        );
        throw new BadRequestException({
          message: `Failed to fetch Solstice instruction: ${request.type}`,
          requestType: request.type,
          upstreamStatus: response.status,
          upstreamError: errorText,
        });
      }

      const data = (await response.json()) as SolsticeInstructionResponse;
      this.logger.debug(
        `[fetchInstructionFromApi] Successfully received instruction for type=${request.type}`,
      );
      return data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isNetworkFetchFailure =
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("EAI_AGAIN");

      if (isNetworkFetchFailure) {
        this.logger.warn(
          `[fetchInstructionFromApi] fetch transport failed for type=${request.type}. Falling back to curl transport. Error=${errorMessage}`,
        );
        return this.fetchInstructionFromApiViaCurl(request);
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `Solstice API error (${request.type}):`,
        error instanceof Error ? error.message : String(error),
      );
      throw new BadRequestException({
        message: `Failed to fetch Solstice instruction: ${request.type}`,
        requestType: request.type,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fallback transport for environments where Node fetch cannot reach Solstice,
   * but system curl can (seen on some local/dev machines).
   */
  private async fetchInstructionFromApiViaCurl(
    request: SolsticeInstructionRequest,
  ): Promise<SolsticeInstructionResponse> {
    try {
      const endpoint = `${this.apiUrl}/v1/instructions`;
      const args = [
        "-sS",
        "--max-time",
        "25",
        "-X",
        "POST",
        endpoint,
        "-H",
        `x-api-key: ${this.apiKey}`,
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify(request),
        "-w",
        "\n%{http_code}",
      ];

      const { stdout } = await execFileAsync("curl", args, {
        maxBuffer: 1024 * 1024,
      });

      const trimmed = stdout.trimEnd();
      const newlineIndex = trimmed.lastIndexOf("\n");
      const body = newlineIndex >= 0 ? trimmed.slice(0, newlineIndex) : "";
      const statusText =
        newlineIndex >= 0 ? trimmed.slice(newlineIndex + 1) : trimmed;
      const status = Number(statusText);

      if (!Number.isFinite(status)) {
        throw new Error(`Unable to parse curl HTTP status: ${statusText}`);
      }

      if (status < 200 || status >= 300) {
        throw new BadRequestException({
          message: `Failed to fetch Solstice instruction: ${request.type}`,
          requestType: request.type,
          upstreamStatus: status,
          upstreamError: body,
          transport: "curl",
        });
      }

      const parsed = JSON.parse(body) as SolsticeInstructionResponse;
      this.logger.debug(
        `[fetchInstructionFromApiViaCurl] Successfully received instruction for type=${request.type}`,
      );
      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException({
        message: `Failed to fetch Solstice instruction: ${request.type}`,
        requestType: request.type,
        cause: error instanceof Error ? error.message : String(error),
        transport: "curl",
      });
    }
  }

  /**
   * Helper to convert a standard @solana/web3.js Instruction to our internal SolanaInstruction interface.
   */
  private toSolanaInstructionFromWeb3(inst: any): SolanaInstruction {
    return {
      programId: inst.programId,
      keys: inst.keys,
      data: inst.data,
    };
  }

  /**
   * Step 1 of Solstice Deposit: RequestMint (USDC → USX)
   */
  async buildDepositStep1Instructions(
    userWallet: string,
    amount: number,
  ): Promise<SolanaInstruction[]> {
    const instructions: SolanaInstruction[] = [];
    const userPubkey = new PublicKey(userWallet);
    const usxMint = new PublicKey(this.mints.usx);
    const eusxMint = new PublicKey(this.mints.eusx);

    // Ensure ATAs exist
    const usxAta = getAssociatedTokenAddressSync(usxMint, userPubkey);
    const eusxAta = getAssociatedTokenAddressSync(eusxMint, userPubkey);
    instructions.push(this.toSolanaInstructionFromWeb3(
      createAssociatedTokenAccountIdempotentInstruction(userPubkey, usxAta, userPubkey, usxMint)
    ));
    instructions.push(this.toSolanaInstructionFromWeb3(
      createAssociatedTokenAccountIdempotentInstruction(userPubkey, eusxAta, userPubkey, eusxMint)
    ));

    // RequestMint only
    const mintResponse = await this.fetchInstructionFromApi({
      type: 'RequestMint',
      data: { user: userWallet, amount, collateral: 'usdc' },
    });
    instructions.push(this.toSolanaInstruction(mintResponse.instruction, userWallet));

    this.logger.log(`[buildDepositStep1] ${instructions.length} instructions built`);
    return instructions;
  }

  async buildDepositStep2Instructions(
    userWallet: string,
    amount: number,
  ): Promise<SolanaInstruction[]> {
    const instructions: SolanaInstruction[] = [];

    // ConfirmMint + Lock
    const confirmResponse = await this.fetchInstructionFromApi({
      type: 'ConfirmMint',
      data: { user: userWallet, collateral: 'usdc' },
    });
    instructions.push(this.toSolanaInstruction(confirmResponse.instruction, userWallet));

    const lockResponse = await this.fetchInstructionFromApi({
      type: 'Lock',
      data: { user: userWallet, amount },
    });
    instructions.push(this.toSolanaInstruction(lockResponse.instruction, userWallet));

    this.logger.log(`[buildDepositStep2] ${instructions.length} instructions built`);
    return instructions;
  }

  async buildConfirmMintInstruction_Only(
    userWallet: string,
  ): Promise<SolanaInstruction[]> {
    const confirmResponse = await this.fetchInstructionFromApi({
      type: 'ConfirmMint',
      data: { user: userWallet, collateral: 'usdc' },
    });
    return [this.toSolanaInstruction(confirmResponse.instruction, userWallet)];
  }

  async buildLockInstruction_Only(
    userWallet: string,
    amount: number,
  ): Promise<SolanaInstruction[]> {
    const lockResponse = await this.fetchInstructionFromApi({
      type: 'Lock',
      data: { user: userWallet, amount },
    });
    return [this.toSolanaInstruction(lockResponse.instruction, userWallet)];
  }

  /**
   * Discrete Withdraw Step 1: Unlock and Withdraw (eUSX -> USX)
   */
  async buildUnlockAndWithdrawInstructions_Only(
    userWallet: string,
    amount: number,
    payerWallet?: string,
  ): Promise<SolanaInstruction[]> {
    const instructions: SolanaInstruction[] = [];
    const payer = payerWallet || userWallet;
    
    const userPubkey = new PublicKey(userWallet);
    const payerPubkey = new PublicKey(payer);
    const usxMint = new PublicKey(this.mints.usx);
    const eusxMint = new PublicKey(this.mints.eusx);

    // 0. Ensure ATAs exist
    const usxAta = getAssociatedTokenAddressSync(usxMint, userPubkey);
    const eusxAta = getAssociatedTokenAddressSync(eusxMint, userPubkey);

    instructions.push(this.toSolanaInstructionFromWeb3(
      createAssociatedTokenAccountIdempotentInstruction(payerPubkey, usxAta, userPubkey, usxMint)
    ));
    instructions.push(this.toSolanaInstructionFromWeb3(
      createAssociatedTokenAccountIdempotentInstruction(payerPubkey, eusxAta, userPubkey, eusxMint)
    ));

    // 1. Unlock
    const unlockRequest: SolsticeInstructionRequest = {
      type: "Unlock",
      data: { user: userWallet, amount, ...(payerWallet && { payer: payerWallet }) },
    };
    const unlockRes = await this.fetchInstructionFromApi(unlockRequest);
    instructions.push(this.toSolanaInstruction(unlockRes.instruction, payer));

    // 2. Withdraw
    const withdrawRequest: SolsticeInstructionRequest = {
      type: "Withdraw",
      data: { user: userWallet, amount, ...(payerWallet && { payer: payerWallet }) },
    };
    const withdrawRes = await this.fetchInstructionFromApi(withdrawRequest);
    instructions.push(this.toSolanaInstruction(withdrawRes.instruction, payer));

    return instructions;
  }

  /**
   * Discrete Withdraw Step 2: RequestRedeem (USX -> USDC)
   */
  async buildRequestRedeemInstruction_Only(
    userWallet: string,
    amount: number,
    payerWallet?: string,
  ): Promise<SolanaInstruction[]> {
    const payer = payerWallet || userWallet;
    const request: SolsticeInstructionRequest = {
      type: "RequestRedeem",
      data: {
        user: userWallet,
        amount,
        collateral: "usdc",
        ...(payerWallet && { payer: payerWallet }),
      },
    };
    const res = await this.fetchInstructionFromApi(request);
    return [this.toSolanaInstruction(res.instruction, payer)];
  }

  /**
   * Discrete Withdraw Step 3: ConfirmRedeem (Asset finalization)
   */
  async buildConfirmRedeemInstruction_Only(
    userWallet: string,
    payerWallet?: string,
  ): Promise<SolanaInstruction[]> {
    const payer = payerWallet || userWallet;
    const request: SolsticeInstructionRequest = {
      type: "ConfirmRedeem",
      data: {
        user: userWallet,
        collateral: "usdc",
        ...(payerWallet && { payer: payerWallet }),
      },
    };
    const res = await this.fetchInstructionFromApi(request);
    return [this.toSolanaInstruction(res.instruction, payer)];
  }

  /**
   * Emergency exit: cancel a pending mint request (collateral recovery).
   */
  async buildCancelMintInstructions(
    userWallet: string,
    collateral: CollateralKind = "usdc",
  ): Promise<SolanaInstruction[]> {
    const response = await this.fetchInstructionFromApi({
      type: "CancelMint",
      data: { user: userWallet, collateral },
    });
    return [this.toSolanaInstruction(response.instruction, userWallet)];
  }

  /**
   * Emergency exit: cancel a pending redeem request (USX position restored).
   */
  async buildCancelRedeemInstructions(
    userWallet: string,
    collateral: CollateralKind = "usdc",
  ): Promise<SolanaInstruction[]> {
    const response = await this.fetchInstructionFromApi({
      type: "CancelRedeem",
      data: { user: userWallet, collateral },
    });
    return [this.toSolanaInstruction(response.instruction, userWallet)];
  }
}