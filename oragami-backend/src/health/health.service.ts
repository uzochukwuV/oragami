import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnchorService } from '../solana/anchor.service';
import { SixService } from '../data/six.service';
import { CrankStateService } from './crank-state.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchor: AnchorService,
    private readonly six: SixService,
    private readonly crankState: CrankStateService,
  ) {}

  async getHealth(): Promise<{
    status: 'ok' | 'degraded';
    solana_connected: boolean;
    six_connected: boolean;
    db_connected: boolean;
  }> {
    const [db_connected, solana_connected, six_connected] = await Promise.all([
      this.checkDb(),
      this.checkSolana(),
      Promise.resolve(this.checkSix()),
    ]);

    const allUp = db_connected && solana_connected && six_connected;
    return {
      status: allUp ? 'ok' : 'degraded',
      solana_connected,
      six_connected,
      db_connected,
    };
  }

  getCrankHealth(): ReturnType<CrankStateService['getCrankSnapshot']> {
    return this.crankState.getCrankSnapshot();
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (e) {
      this.logger.warn(
        `DB health check failed: ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  private async checkSolana(): Promise<boolean> {
    try {
      const conn = this.anchor.getConnection();
      await conn.getVersion();
      return true;
    } catch (e) {
      this.logger.warn(
        `Solana health check failed: ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  /** True if we have successfully talked to SIX (OAuth or market) at least once. */
  private checkSix(): boolean {
    return this.six.getSixStatus().connected;
  }
}
