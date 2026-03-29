import { Injectable } from '@nestjs/common';

/**
 * In-memory last-run times for scheduled cranks. Nav/yield crank services
 * should call {@link recordNavRun} / {@link recordYieldRun} when implemented (ISSUE #6 / #7).
 */
@Injectable()
export class CrankStateService {
  private navLastRun: Date | null = null;
  private navLastSuccess: Date | null = null;
  private yieldLastRun: Date | null = null;
  private yieldLastSuccess: Date | null = null;

  recordNavRun(success: boolean): void {
    const now = new Date();
    this.navLastRun = now;
    if (success) this.navLastSuccess = now;
  }

  recordYieldRun(success: boolean): void {
    const now = new Date();
    this.yieldLastRun = now;
    if (success) this.yieldLastSuccess = now;
  }

  getCrankSnapshot(): {
    nav_crank: { lastRun: string | null; lastSuccess: string | null };
    yield_crank: { lastRun: string | null; lastSuccess: string | null };
  } {
    return {
      nav_crank: {
        lastRun: this.navLastRun?.toISOString() ?? null,
        lastSuccess: this.navLastSuccess?.toISOString() ?? null,
      },
      yield_crank: {
        lastRun: this.yieldLastRun?.toISOString() ?? null,
        lastSuccess: this.yieldLastSuccess?.toISOString() ?? null,
      },
    };
  }
}
