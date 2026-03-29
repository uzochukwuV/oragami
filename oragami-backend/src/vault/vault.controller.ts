import { Controller, Get, Query } from '@nestjs/common';
import { VaultService } from './vault.service';

@Controller('vault')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  @Get('state')
  getState() {
    return this.vault.getState();
  }

  @Get('nav/history')
  navHistory(@Query('limit') limit?: string) {
    return this.vault.navHistory(limit ? parseInt(limit, 10) : 100);
  }

  @Get('yield/history')
  yieldHistory(@Query('limit') limit?: string) {
    return this.vault.yieldHistory(limit ? parseInt(limit, 10) : 100);
  }

  @Get('stats')
  stats() {
    return this.vault.stats();
  }
}
