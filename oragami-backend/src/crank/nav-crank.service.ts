import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import { SolsticeService } from '../solana/solstice.service';
import { SixService } from '../data/six.service';

// ─── SIX VALOR_BC identifiers ────────────────────────────────────────────────
// Format: {valor}_{marketBc}  scheme=VALOR_BC
// Gold (XAU/USD) on BC 148 (Forex Calculated Rates)
const SIX_GOLD_VALOR = '274702';
const SIX_GOLD_BC = '148';
// CHF/USD on BC 148
const SIX_CHF_VALOR = '275164';
const SIX_CHF_BC = '148';

// ─── Basket weights (must sum to 10000 bps) ──────────────────────────────────
const WEIGHT_GOLD_BPS = 5000; // 50%
const WEIGHT_CHF_BPS = 3000;  // 30%
const WEIGHT_USX_BPS = 2000;  // 20%

// ─── NAV guard: reject updates that move more than 10% from current ───────────
const MAX_NAV_CHANGE_BPS = 1000; // 10%

// ─── Minimum interval between on-chain set_nav calls (ms) ────────────────────
const MIN_UPDATE_INTERVAL_MS = 90_000; // 90 seconds

@Injectable()
export class NavCrankService {
  private readonly logger = new Logger(NavCrankService.name);

  /** Cached SIX prices — used as fallback if a fetch fails */
  private lastGoldPrice: number | null = null;
  private lastChfUsd: number | null = null;

  /** Baseline prices captured at vault init — used to compute appreciation */
  private baselineGoldPrice: number | null = null;
  private baselineChfUsd: number | null = null;

  /** Timestamp of last successful on-chain set_nav */
  private lastOnChainUpdateMs = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
    private readonly solstice: SolsticeService,
    private readonly six: SixService,
  ) {}

  // ─── Scheduled: every 2 minutes for demo, every 15 min in production ────────
  @Cron('*/2 * * * *')
  async runNavCrank(): Promise<void> {
    try {
      await this.updateNav();
    } catch (err) {
      this.logger.error(
        `NAV crank unhandled error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Public method so it can be called manually / from tests ─────────────────
  async updateNav(): Promise<{
    navBps: number;
    goldPrice: number | null;
    chfUsd: number | null;
    eusxNav: number;
    source: string;
    txSignature: string | null;
  }> {
    this.logger.log('NAV crank: starting update');

    // ── 1. Fetch SIX prices ──────────────────────────────────────────────────
    let goldPrice: number | null = null;
    let chfUsd: number | null = null;
    let sixSource = 'SIX';

    try {
      const goldRaw = await this.six.fetchIntradaySnapshot(
        'VALOR_BC',
        SIX_GOLD_VALOR,
        SIX_GOLD_BC,
      );
      goldPrice = this.extractPrice(goldRaw, 'Gold');
      if (goldPrice !== null) this.lastGoldPrice = goldPrice;
    } catch (err) {
      this.logger.warn(
        `SIX Gold fetch failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    try {
      const chfRaw = await this.six.fetchIntradaySnapshot(
        'VALOR_BC',
        SIX_CHF_VALOR,
        SIX_CHF_BC,
      );
      chfUsd = this.extractPrice(chfRaw, 'CHF/USD');
      if (chfUsd !== null) this.lastChfUsd = chfUsd;
    } catch (err) {
      this.logger.warn(
        `SIX CHF/USD fetch failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Fall back to last known prices if SIX is temporarily unavailable
    if (goldPrice === null && this.lastGoldPrice !== null) {
      goldPrice = this.lastGoldPrice;
      sixSource = 'SIX-cached';
      this.logger.warn('Using cached Gold price');
    }
    if (chfUsd === null && this.lastChfUsd !== null) {
      chfUsd = this.lastChfUsd;
      sixSource = 'SIX-cached';
      this.logger.warn('Using cached CHF/USD price');
    }

    // ── 2. Fetch eUSX NAV from Solstice ──────────────────────────────────────
    let eusxNav = 1.0;
    try {
      eusxNav = await this.solstice.getEusxNav();
    } catch (err) {
      this.logger.warn(
        `Solstice eUSX NAV fetch failed, using 1.0: ${err instanceof Error ? err.message : err}`,
      );
    }

    // ── 3. Read current on-chain vault state ─────────────────────────────────
    let currentNavBps = 10_000;
    let usxAllocationBps = 7000;
    try {
      const vs = await this.anchor.readVaultState();
      currentNavBps = Number(vs.navPriceBps?.toString?.() ?? vs.navPriceBps ?? 10_000);
      usxAllocationBps = Number(vs.usxAllocationBps ?? 7000);
    } catch (err) {
      this.logger.warn(
        `readVaultState failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    // ── 4. Compute new NAV ───────────────────────────────────────────────────
    const newNavBps = this.computeNavBps(
      goldPrice,
      chfUsd,
      eusxNav,
      usxAllocationBps,
      currentNavBps,
    );

    this.logger.log(
      `NAV crank: gold=${goldPrice?.toFixed(2) ?? 'N/A'} CHF/USD=${chfUsd?.toFixed(4) ?? 'N/A'} eUSX=${eusxNav.toFixed(6)} → nav_bps=${newNavBps} (current=${currentNavBps})`,
    );

    // ── 5. Guard: skip if change is too large (manipulation protection) ──────
    const changeBps = Math.abs(newNavBps - currentNavBps);
    if (changeBps > MAX_NAV_CHANGE_BPS) {
      this.logger.warn(
        `NAV change ${changeBps} bps exceeds guard ${MAX_NAV_CHANGE_BPS} bps — skipping on-chain update`,
      );
      await this.recordSnapshot(newNavBps, sixSource, null, goldPrice, chfUsd, eusxNav);
      return { navBps: newNavBps, goldPrice, chfUsd, eusxNav, source: sixSource, txSignature: null };
    }

    // ── 6. Guard: skip if updated too recently ────────────────────────────────
    const now = Date.now();
    if (now - this.lastOnChainUpdateMs < MIN_UPDATE_INTERVAL_MS) {
      this.logger.debug('NAV crank: skipping on-chain update (too recent)');
      return { navBps: newNavBps, goldPrice, chfUsd, eusxNav, source: sixSource, txSignature: null };
    }

    // ── 7. Call set_nav on-chain ──────────────────────────────────────────────
    let txSignature: string | null = null;
    try {
      const program = this.anchor.getProgram();
      const [vaultStatePda] = this.anchor.deriveVaultStatePda();
      const authority = this.anchor.getAuthority();

      const tx = await (program.methods as any)
        .setNav({ navPriceBps: new BN(newNavBps) })
        .accounts({
          vaultState: vaultStatePda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      txSignature = tx;
      this.lastOnChainUpdateMs = Date.now();
      this.logger.log(`NAV updated on-chain: ${newNavBps} bps | tx=${tx}`);
    } catch (err) {
      this.logger.error(
        `set_nav on-chain failed: ${err instanceof Error ? err.message : err}`,
      );
      // Still record the snapshot even if on-chain fails
    }

    // ── 8. Record to DB ───────────────────────────────────────────────────────
    await this.recordSnapshot(newNavBps, sixSource, txSignature, goldPrice, chfUsd, eusxNav);

    // ── 9. Audit log ──────────────────────────────────────────────────────────
    await this.prisma.auditEvent.create({
      data: {
        actor: 'system',
        role: 'crank',
        action: 'set_nav',
        result: txSignature ? 'success' : 'failed',
        txSignature,
        metadata: {
          navBps: newNavBps,
          goldPrice,
          chfUsd,
          eusxNav,
          source: sixSource,
        },
        timestamp: new Date(),
      },
    });

    return { navBps: newNavBps, goldPrice, chfUsd, eusxNav, source: sixSource, txSignature };
  }

  // ─── NAV computation ─────────────────────────────────────────────────────────
  /**
   * Basket NAV formula:
   *
   * The vault holds USDC as collateral. cVAULT is priced against:
   *   50% Gold appreciation (vs baseline)
   *   30% CHF/USD appreciation (vs baseline)
   *   20% eUSX yield (Solstice)
   *
   * nav_bps = 10000 * (
   *   (WEIGHT_GOLD/10000) * gold_factor +
   *   (WEIGHT_CHF/10000)  * chf_factor  +
   *   (WEIGHT_USX/10000)  * eusx_nav
   * )
   *
   * Where gold_factor = current_gold / baseline_gold (appreciation ratio).
   * If no baseline is set yet, we use 1.0 (no appreciation) for that component.
   * This means NAV starts at 1.0 and drifts as prices move.
   */
  private computeNavBps(
    goldPrice: number | null,
    chfUsd: number | null,
    eusxNav: number,
    _usxAllocationBps: number,
    currentNavBps: number,
  ): number {
    // Set baselines on first successful price fetch
    if (goldPrice !== null && this.baselineGoldPrice === null) {
      this.baselineGoldPrice = goldPrice;
      this.logger.log(`Baseline Gold price set: ${goldPrice}`);
    }
    if (chfUsd !== null && this.baselineChfUsd === null) {
      this.baselineChfUsd = chfUsd;
      this.logger.log(`Baseline CHF/USD set: ${chfUsd}`);
    }

    // Compute appreciation factors (1.0 = no change from baseline)
    const goldFactor =
      goldPrice !== null && this.baselineGoldPrice !== null && this.baselineGoldPrice > 0
        ? goldPrice / this.baselineGoldPrice
        : 1.0;

    const chfFactor =
      chfUsd !== null && this.baselineChfUsd !== null && this.baselineChfUsd > 0
        ? chfUsd / this.baselineChfUsd
        : 1.0;

    // Weighted basket NAV
    const navFloat =
      (WEIGHT_GOLD_BPS / 10_000) * goldFactor +
      (WEIGHT_CHF_BPS / 10_000) * chfFactor +
      (WEIGHT_USX_BPS / 10_000) * eusxNav;

    const navBps = Math.round(navFloat * 10_000);

    // Sanity bounds: NAV should stay between $0.50 and $2.00
    return Math.max(5_000, Math.min(20_000, navBps));
  }

  // ─── Price extraction from SIX intraday snapshot response ────────────────────
  /**
   * SIX returns a nested JSON. We walk it looking for a numeric price.
   * The structure varies by instrument but typically:
   *   data[0].intradaySnapshot.last.value  OR
   *   data[0].lastPrice
   */
  private extractPrice(raw: unknown, label: string): number | null {
    if (!raw || typeof raw !== 'object') return null;

    const price = this.walkForPrice(raw);
    if (price !== null) {
      this.logger.debug(`SIX ${label}: ${price}`);
      return price;
    }

    this.logger.warn(
      `SIX ${label}: could not extract price from response: ${JSON.stringify(raw).slice(0, 300)}`,
    );
    return null;
  }

  private walkForPrice(node: unknown): number | null {
    if (typeof node === 'number' && Number.isFinite(node) && node > 0) {
      return node;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const p = this.walkForPrice(item);
        if (p !== null) return p;
      }
      return null;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      // Prefer known price field names in priority order
      for (const key of ['value', 'lastPrice', 'price', 'last', 'close']) {
        if (key in obj) {
          const p = this.walkForPrice(obj[key]);
          if (p !== null) return p;
        }
      }
      // Walk intradaySnapshot first
      if ('intradaySnapshot' in obj) {
        const p = this.walkForPrice(obj['intradaySnapshot']);
        if (p !== null) return p;
      }
      // Walk all other keys
      for (const [k, v] of Object.entries(obj)) {
        if (['intradaySnapshot', 'value', 'lastPrice', 'price', 'last', 'close'].includes(k)) continue;
        const p = this.walkForPrice(v);
        if (p !== null) return p;
      }
    }
    return null;
  }

  // ─── DB helpers ──────────────────────────────────────────────────────────────
  private async recordSnapshot(
    navBps: number,
    source: string,
    txSignature: string | null,
    goldPrice: number | null,
    chfUsd: number | null,
    eusxNav: number,
  ): Promise<void> {
    try {
      await this.prisma.navSnapshot.create({
        data: {
          navBps: BigInt(navBps),
          source,
          txSignature,
          rawPayload: { goldPrice, chfUsd, eusxNav },
          timestamp: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record NAV snapshot: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ─── Expose last known prices for health endpoint ─────────────────────────────
  getLastPrices(): {
    goldPrice: number | null;
    chfUsd: number | null;
    baselineGoldPrice: number | null;
    baselineChfUsd: number | null;
    lastOnChainUpdateMs: number;
  } {
    return {
      goldPrice: this.lastGoldPrice,
      chfUsd: this.lastChfUsd,
      baselineGoldPrice: this.baselineGoldPrice,
      baselineChfUsd: this.baselineChfUsd,
      lastOnChainUpdateMs: this.lastOnChainUpdateMs,
    };
  }
}
