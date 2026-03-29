import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { PreflightDto } from './dto/preflight.dto';
import { IndexDepositDto } from './dto/index-deposit.dto';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';

@Controller('deposits')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post('preflight')
  preflight(@Body() dto: PreflightDto) {
    return this.deposits.preflight(dto);
  }

  @Post('index')
  index(@Body() dto: IndexDepositDto) {
    return this.deposits.index(dto);
  }

  @Get()
  @UseGuards(AdminApiKeyGuard)
  listAll() {
    return this.deposits.listAll();
  }

  @Get('institution/:wallet')
  listForWallet(@Param('wallet') wallet: string) {
    return this.deposits.listByInstitutionWallet(decodeURIComponent(wallet));
  }
}
