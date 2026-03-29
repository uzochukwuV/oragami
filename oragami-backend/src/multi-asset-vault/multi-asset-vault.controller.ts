import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MultiAssetVaultService } from './multi-asset-vault.service';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { IsNumberString, IsString, Matches } from 'class-validator';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class SetNavDto {
  @IsNumberString()
  navPriceBps!: string;
}

class PreflightDto {
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  wallet!: string;

  @IsString()
  amount!: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('multi-vault')
export class MultiAssetVaultController {
  constructor(private readonly service: MultiAssetVaultService) {}

  // GET /api/multi-vault/factory
  // Returns factory state — registered asset mints, authority, fee
  @Get('factory')
  getFactory() {
    return this.service.getFactory();
  }

  // GET /api/multi-vault/vaults
  // Returns all registered asset vaults with live on-chain state
  @Get('vaults')
  getAllVaults() {
    return this.service.getAllVaults();
  }

  // GET /api/multi-vault/vaults/:assetMint
  // Returns a single vault by its asset mint address
  @Get('vaults/:assetMint')
  getVault(@Param('assetMint') assetMint: string) {
    return this.service.getVaultByMint(decodeURIComponent(assetMint));
  }

  // POST /api/multi-vault/vaults/:assetMint/nav
  // Update NAV for a vault — authority only
  // Body: { navPriceBps: "10500" }
  @Post('vaults/:assetMint/nav')
  @UseGuards(AdminApiKeyGuard)
  setNav(
    @Param('assetMint') assetMint: string,
    @Body() dto: SetNavDto,
  ) {
    return this.service
      .setNav(decodeURIComponent(assetMint), Number(dto.navPriceBps))
      .then((tx) => ({ success: true, txSignature: tx }));
  }

  // GET /api/multi-vault/credentials/:wallet
  // Verify a wallet's compliance credential on the multi-asset vault program
  @Get('credentials/:wallet')
  verifyCredential(@Param('wallet') wallet: string) {
    return this.service.verifyCredential(decodeURIComponent(wallet));
  }

  // POST /api/multi-vault/vaults/:assetMint/preflight
  // Pre-deposit check — credential + vault state + amount bounds
  // Body: { wallet, amount }
  @Post('vaults/:assetMint/preflight')
  preflight(
    @Param('assetMint') assetMint: string,
    @Body() dto: PreflightDto,
  ) {
    return this.service.preflightDeposit(
      dto.wallet,
      decodeURIComponent(assetMint),
      dto.amount,
    );
  }
}
