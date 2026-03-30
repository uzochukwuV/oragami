import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BN } from '@coral-xyz/anchor';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import { SolsticeService } from '../solana/solstice.service';
import { SixService } from '../data/six.service';
import { CrankStateService } from '../health/crank-state.service';
import { VaultService } from '../vault/vault.service';

const SIX_GOLD_VALOR = '274702';
const SIX_GOLD_BC = '148';
const SIX_CHF_VALOR = '275164';
const SIX_CHF_BC = '148';

const WEIGHT_GOLD_BPS = 5000;
const WEIGHT_CHF_BPS = 3000;
const WEIGHT_USX_BPS = 2000;

const MAX_NAV_CHANGE_BPS = 1000;
const MIN_UPDATE_INTERVAL_MS = 90_000;

@Injectable()
export class NavCrankService {
  private readonly logger = new Logger(NavCrankService.name);

  private lastGoldPrice: number | null = null;
  private lastChfUsd: number | null = null;
  private baselineGoldPrice: number | null = null;
  private baselineChfUsd: number | null = null;
  private lastOnChainUpdateMs = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
    private readonly solstice: SolsticeService,
    private readonly six: SixService,
    private readonly crankState: CrankStateService,
    private readonly vaultService: VaultService,
  ) {}

  @Cron('*/2 * * * *')
  async runNavCrank(): Promise<void> {
    let success = false;
    try {
      const result = await this.updateNav();
      success = result.txSignature !== null;
    } catch (err) {
      this.logger.error(
        `NAV crank unhandled error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.crankState.recordNavRun(success);
    }
  }

  async updateNav(): Promise<{
    navBps: number;
    goldPrice: number | null;
    chfUsd: number | null;
    eusxNav: number;
    source: string;
    txSignature: string | null;
  }> {
    this.logger.log('NAV crank: starting update');

    // 1. Fetch SIX prices
    let goldPrice: number | null = null;
    let chfUsd: number | null = null;
    let sixSource = 'SIX';

    try {
      const goldRaw = await this.six.fetchIntradaySnapshot('VALOR_BC', SIX_GOLD_VALOR, SIX_GOLD_BC);
      goldPrice = this.extractPrice(goldRaw, 'Gold');
      if (goldPrice !== null) this.lastGoldPrice = goldPrice;
    } catch (err) {
      this.logger.warn(`SIX Gold fetch failed: ${err instanceof Error ? err.message : err}`);
    }

    try {
      const chfRaw = await this.six.fetchIntradaySnapshot('VALOR_BC', SIX_CHF_VALOR, SIX_CHF_BC);
      chfUsd = this.extractPrice(chfRaw, 'CHF/USD');
      if (chfUsd !== null) this.lastChfUsd = chfUsd;
    } catch (err) {
      this.logger.warn(`SIX CHF/USD fetch failed: ${err instanceof Error ? err.message : err}`);
    }

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

    // 2. Fetch eUSX NAV
    let eusxNav = 1.0;
    try {
      eusxNav = await this.solstice.getEusxNav();
    } catch (err) {
      this.logger.warn(`Solstice eUSX NAV fetch failed, using 1.0: ${err instanceof Error ? err.message : err}`);
    }

    // 3. Read vault state — track whether vault is initialized
    let currentNavBps = 10_000;
    let usxAllocationBps = 7000;
    let vaultInitialized = true;
    try {
      const vs = await this.anchor.readVaultState();
      currentNavBps = Number(vs.navPriceBps?.toString?.() ?? vs.navPriceBps ?? 10_000);
      usxAllocationBps = Number(vs.usxAllocationBps ?? 7000);
    } catch (err) {
      this.logger.warn(`readVaultState failed: ${err instanceof Error ? err.message : err}`);
      vaultInitialized = false;
    }

    // 4. Compute new NAV
    const newNavBps = this.computeNavBps(goldPrice, chfUsd, eusxNav, usxAllocationBps, currentNavBps);

    this.logger.log(
      `NAV crank: gold=${goldPrice?.toFixed(2) ?? 'N/A'} CHF/USD=${chfUsd?.toFixed(4) ?? 'N/A'} eUSX=${eusxNav.toFixed(6)} → nav_bps=${newNavBps} (current=${currentNavBps})`,
    );

    // 5. Guard: change too large
    const changeBps = Math.abs(newNavBps - currentNavBps);
    if (changeBps > MAX_NAV_CHANGE_BPS) {
      this.logger.warn(`NAV change ${changeBps} bps exceeds guard — skipping on-chain update`);
      await this.recordSnapshot(newNavBps, sixSource, null, goldPrice, chfUsd, eusxNav);
      return { navBps: newNavBps, goldPrice, chfUsd, eusxNav, source: sixSource, txSignature: null };
    }

    // 6. Guard: updated too recently
    const now = Date.now();
    if (now - this.lastOnChainUpdateMs < MIN_UPDATE_INTERVAL_MS) {
      this.logger.debug('NAV crank: skipping on-chain update (too recent)');
      return { navBps: newNavBps, goldPrice, chfUsd, eusxNav, source: sixSource, txSignature: null };
    }

    // 6a. Guard: vault not initialized — record snapshot only, skip on-chain
    if (!vaultInitialized) {
      this.logger.warn('NAV crank: vault_state not initialized — recording snapshot only, skipping on-chain');
      await this.recordSnapshot(newNavBps, sixSource, null, goldPrice, chfUsd, eusxNav);
      return { navBps: newNavBps, goldPrice, chfUsd, eusxNav, source: sixSource, txSignature: null };
    }

    // 7. Call set_nav on-chain
    let txSignature: string | null = null;
    try {
      const program = this.anchor.getProgram();
      const [vaultStatePda] = this.anchor.deriveVaultStatePda();
      const authority = this.anchor.getAuthority();

      const tx = await (program.methods as any)
        .setNav({ navPriceBps: new BN(newNavBps) })
        .accounts({ vaultState: vaultStatePda, authority: authority.publicKey })
        .signers([authority])
        .rpc();

      txSignature = tx;
      this.lastOnChainUpdateMs = Date.now();
      this.logger.log(`NAV updated on-chain: ${newNavBps} bps | tx=${tx}`);

      // 7b. Post reserve attestation — proves gold backing on-chain
      const attTx = await this.vaultService.postReserveAttestation(goldPrice ?? 0, newNavBps);
      if (attTx) {
        this.logger.log(`Reserve attestation posted: tx=${attTx}`);
      }

      // 7a. Minimal yield tick
      await this.tickYield(currentNavBps, newNavBps, usxAllocationBps, eusxNav);
    } catch (err) {
      this.logger.error(`set_nav on-chain failed: ${err instanceof Error ? err.message : err}`);
    }

    // 8. Record snapshot
    await this.recordSnapshot(newNavBps, sixSource, txSignature, goldPrice, chfUsd, eusxNav);

    // 9. Audit log
    await this.prisma.auditEvent.create({
      data: {
        actor: 'system',
        role: 'crank',
        action: 'set_nav',
        result: txSignature ? 'success' : 'failed',
        txSignature,
        metadata: { navBps: newNavBps, goldPrice, chfUsd, eusxNav, source: sixSource },
        timestamp: new Date(),
      },
    });

    return { navBps: newNavBps, goldPrice, chfUsd, eusxNav, source: sixSource, txSignature };
  }

  private computeNavBps(
    goldPrice: number | null,
    chfUsd: number | null,
    eusxNav: number,
    _usxAllocationBps: number,
    currentNavBps: number,
  ): number {
    if (goldPrice !== null && this.baselineGoldPrice === null) {
      this.baselineGoldPrice = goldPrice;
      this.logger.log(`Baseline Gold price set: ${goldPrice}`);
    }
    if (chfUsd !== null && this.baselineChfUsd === null) {
      this.baselineChfUsd = chfUsd;
      this.logger.log(`Baseline CHF/USD set: ${chfUsd}`);
    }

    const goldFactor =
      goldPrice !== null && this.baselineGoldPrice !== null && this.baselineGoldPrice > 0
        ? goldPrice / this.baselineGoldPrice
        : 1.0;

    const chfFactor =
      chfUsd !== null && this.baselineChfUsd !== null && this.baselineChfUsd > 0
        ? chfUsd / this.baselineChfUsd
        : 1.0;

    const navFloat =
      (WEIGHT_GOLD_BPS / 10_000) * goldFactor +
      (WEIGHT_CHF_BPS / 10_000) * chfFactor +
      (WEIGHT_USX_BPS / 10_000) * eusxNav;

    return Math.max(5_000, Math.min(20_000, Math.round(navFloat * 10_000)));
  }

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
    if (typeof node === 'number' && Number.isFinite(node) && node > 0) return node;
    if (Array.isArray(node)) {
      for (const item of node) {
        const p = this.walkForPrice(item);
        if (p !== null) return p;
      }
      return null;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      for (const key of ['value', 'lastPrice', 'price', 'last', 'close']) {
        if (key in obj) {
          const p = this.walkForPrice(obj[key]);
          if (p !== null) return p;
        }
      }
      if ('intradaySnapshot' in obj) {
        const p = this.walkForPrice(obj['intradaySnapshot']);
        if (p !== null) return p;
      }
      for (const [k, v] of Object.entries(obj)) {
        if (['intradaySnapshot', 'value', 'lastPrice', 'price', 'last', 'close'].includes(k)) continue;
        const p = this.walkForPrice(v);
        if (p !== null) return p;
      }
    }
    return null;
  }

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
      this.logger.warn(`Failed to record NAV snapshot: ${err instanceof Error ? err.message : err}`);
    }
  }

  getLastPrices() {
    return {
      goldPrice: this.lastGoldPrice,
      chfUsd: this.lastChfUsd,
      baselineGoldPrice: this.baselineGoldPrice,
      baselineChfUsd: this.baselineChfUsd,
      lastOnChainUpdateMs: this.lastOnChainUpdateMs,
    };
  }

  private async tickYield(
    navBeforeBps: number,
    navAfterBps: number,
    usxAllocationBps: number,
    eusxNav: number,
  ): Promise<void> {
    try {
      const program = this.anchor.getProgram();
      const [vaultStatePda] = this.anchor.deriveVaultStatePda();
      const authority = this.anchor.getAuthority();

      await (program.methods as any)
        .processYield()
        .accounts({ vaultState: vaultStatePda, authority: authority.publicKey })
        .signers([authority])
        .rpc();

      const vs = await this.anchor.readVaultState();
      const totalDeposits = BigInt(vs.totalDeposits?.toString?.() ?? vs.totalDeposits ?? 0);
      const pendingYield = BigInt(vs.pendingYield?.toString?.() ?? vs.pendingYield ?? 0);
      const apyBps = Number(vs.apyBps ?? 0);
      const lastClaim = Number(vs.lastYieldClaim?.toString?.() ?? vs.lastYieldClaim ?? 0);
      const daysElapsed = Math.max(0, Math.floor((Date.now() / 1000 - lastClaim) / 86400));

      await this.recordYieldEvent(
        totalDeposits, usxAllocationBps, apyBps, daysElapsed,
        pendingYield, navBeforeBps, navAfterBps, eusxNav,
      );

      this.logger.log(`Yield tick: pending_yield=${pendingYield} days_elapsed=${daysElapsed}`);
    } catch (err) {
      this.logger.warn(`Yield tick failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
  }

  private async recordYieldEvent(
    totalDeposits: bigint,
    usxAllocationBps: number,
    apyBps: number,
    daysElapsed: number,
    yieldAccrued: bigint,
    navBeforeBps: number,
    navAfterBps: number,
    eusxNav: number,
  ): Promise<void> {
    try {
      await this.prisma.yieldEvent.create({
        data: {
          totalDeposits,
          usxAllocationBps,
          apyBps,
          daysElapsed,
          yieldAccrued,
          navBeforeBps: BigInt(navBeforeBps),
          navAfterBps: BigInt(navAfterBps),
          eusxPrice: eusxNav,
          timestamp: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to record yield event: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// =============================================================================
// ISSUE #7 — Full Yield Accrual Crank (NOT YET IMPLEMENTED)
// =============================================================================
// See nav-crank.service.ts comment block for full spec.
// Build: src/crank/yield-crank.service.ts
// =============================================================================
