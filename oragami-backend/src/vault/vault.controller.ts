import { Controller, Get, Query } from '@nestjs/common';
import { VaultService } from './vault.service';

@Controller('vault')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get('state')
  getState() {
    return this.vault.getState();
  }

  @Get('nav/current')
  navCurrent() {
    return this.vault.navCurrent();
  }

  @Get('nav/history')
  navHistory(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 100;
    return this.vault.navHistory(Number.isFinite(parsed) ? parsed : 100);
  }

  @Get('yield/history')
  yieldHistory(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 100;
    return this.vault.yieldHistory(Number.isFinite(parsed) ? parsed : 100);
  }

  @Get('stats')
  stats() {
    return this.vault.stats();
  }
}
