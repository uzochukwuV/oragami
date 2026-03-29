import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicKey } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import { SolsticeService } from '../solana/solstice.service';
import { SixService } from '../data/six.service';

@Injectable()
export class VaultService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
    private readonly solstice: SolsticeService,
    private readonly six: SixService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.six.pingToken().catch(() => undefined);
  }

  private async tokenBalance(pubkeyStr: string | undefined): Promise<string> {
    if (!pubkeyStr) return '0';
    try {
      const conn = this.anchor.getConnection();
      const acc = await getAccount(conn, new PublicKey(pubkeyStr));
      return acc.amount.toString();
    } catch {
      return '0';
    }
  }

  async getState() {
    const vs = await this.anchor.readVaultState();
    const navBps = vs.navPriceBps?.toString?.() ?? String(vs.navPriceBps ?? 0);
    const lastClaim = Number(
      vs.lastYieldClaim?.toString?.() ?? vs.lastYieldClaim ?? 0,
    );
    const eusxPrice = await this.solstice.getEusxNav();
    await this.six.pingToken().catch(() => undefined);
    const sixStatus = this.six.getSixStatus();

    const vaultUsxPk = this.config.get<string>('VAULT_USX_TOKEN_ACCOUNT');
    const vaultEusxPk = this.config.get<string>('VAULT_EUSX_TOKEN_ACCOUNT');

    return {
      totalDeposits: vs.totalDeposits?.toString?.() ?? String(vs.totalDeposits ?? 0),
      totalSupply: vs.totalSupply?.toString?.() ?? String(vs.totalSupply ?? 0),
      navPriceBps: navBps,
      pendingYield: vs.pendingYield?.toString?.() ?? String(vs.pendingYield ?? 0),
      apyBps: Number(vs.apyBps ?? 0),
      usxAllocationBps: Number(vs.usxAllocationBps ?? 0),
      paused: !!vs.paused,
      lastYieldClaim: new Date(lastClaim * 1000).toISOString(),
      eusxPrice,
      sixStatus: {
        connected: sixStatus.connected,
        lastSuccessAt: sixStatus.lastSuccessAt?.toISOString() ?? null,
      },
      vaultUsxBalance: await this.tokenBalance(vaultUsxPk),
      vaultEusxBalance: await this.tokenBalance(vaultEusxPk),
    };
  }

  async navHistory(limit = 100) {
    const take = Math.min(500, Math.max(1, limit));
    return this.prisma.navSnapshot.findMany({
      orderBy: { timestamp: 'desc' },
      take,
    });
  }

  async yieldHistory(limit = 100) {
    const take = Math.min(500, Math.max(1, limit));
    return this.prisma.yieldEvent.findMany({
      orderBy: { timestamp: 'desc' },
      take,
    });
  }

  async stats() {
    const [totalInstitutions, activeCredentials, yieldSum, depositSum, snapshots] =
      await Promise.all([
        this.prisma.institution.count(),
        this.prisma.institution.count({
          where: { credentialStatus: 'active' },
        }),
        this.prisma.yieldEvent.aggregate({ _sum: { yieldAccrued: true } }),
        this.prisma.deposit.aggregate({ _sum: { usdcAmount: true } }),
        this.prisma.navSnapshot.findMany({
          where: {
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
          orderBy: { timestamp: 'asc' },
        }),
      ]);

    const vs = await this.anchor.readVaultState();
    const apyBps = Number(vs.apyBps ?? 0);

    let navChange24h = 0;
    if (snapshots.length >= 2) {
      const first = snapshots[0].navBps;
      const last = snapshots[snapshots.length - 1].navBps;
      const f = Number(first);
      if (f > 0) {
        navChange24h = (Number(last - first) / f) * 100;
      }
    }

    return {
      totalInstitutions,
      activeCredentials,
      totalDepositsUsd: (depositSum._sum.usdcAmount ?? 0n).toString(),
      totalYieldDistributed: (yieldSum._sum.yieldAccrued ?? 0n).toString(),
      currentApy: apyBps / 100,
      navChange24h,
    };
  }
}
