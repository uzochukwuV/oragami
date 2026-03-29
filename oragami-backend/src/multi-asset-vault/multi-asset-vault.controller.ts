import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MultiAssetVaultService } from './multi-asset-vault.service';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { IsIn, IsInt, IsNumberString, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

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

class IssueCredentialDto {
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  wallet!: string;

  @IsString()
  @MaxLength(64)
  institutionName!: string;

  @IsString()
  @MaxLength(4)
  jurisdiction!: string;

  @IsIn([1, 2, 3])
  tier!: 1 | 2 | 3;

  @IsIn([1, 2, 3])
  kycLevel!: 1 | 2 | 3;

  @IsInt()
  @Min(0)
  @Max(100)
  amlScore!: number;

  @IsString()
  expiresAt!: string;
}

@Controller('multi-vault')
export class MultiAssetVaultController {
  constructor(private readonly service: MultiAssetVaultService) {}

  // GET /api/multi-vault/factory
  @Get('factory')
  getFactory() {
    return this.service.getFactory();
  }

  // GET /api/multi-vault/vaults
  @Get('vaults')
  getAllVaults() {
    return this.service.getAllVaults();
  }

  // GET /api/multi-vault/vaults/:assetMint
  @Get('vaults/:assetMint')
  getVault(@Param('assetMint') assetMint: string) {
    return this.service.getVaultByMint(decodeURIComponent(assetMint));
  }

  // POST /api/multi-vault/vaults/:assetMint/nav  (admin only)
  @Post('vaults/:assetMint/nav')
  @UseGuards(AdminApiKeyGuard)
  setNav(@Param('assetMint') assetMint: string, @Body() dto: SetNavDto) {
    return this.service
      .setNav(decodeURIComponent(assetMint), Number(dto.navPriceBps))
      .then((tx) => ({ success: true, txSignature: tx }));
  }

  // GET /api/multi-vault/credentials/:wallet
  @Get('credentials/:wallet')
  verifyCredential(@Param('wallet') wallet: string) {
    return this.service.verifyCredential(decodeURIComponent(wallet));
  }

  // POST /api/multi-vault/credentials  (admin only)
  // Issues a credential on the multi-asset vault program for a wallet
  @Post('credentials')
  @UseGuards(AdminApiKeyGuard)
  issueCredential(@Body() dto: IssueCredentialDto) {
    return this.service.issueCredential(
      dto.wallet,
      dto.institutionName,
      dto.jurisdiction,
      dto.tier,
      dto.kycLevel,
      dto.amlScore,
      dto.expiresAt,
    );
  }

  // POST /api/multi-vault/vaults/:assetMint/faucet
  // Mints 1,000 demo tokens to the wallet — devnet only
  @Post('vaults/:assetMint/faucet')
  faucet(
    @Param('assetMint') assetMint: string,
    @Body() dto: { wallet: string },
  ) {
    return this.service.faucet(
      dto.wallet,
      decodeURIComponent(assetMint),
    );
  }

  // POST /api/multi-vault/vaults/:assetMint/preflight
  @Post('vaults/:assetMint/preflight')
  preflight(@Param('assetMint') assetMint: string, @Body() dto: PreflightDto) {
    return this.service.preflightDeposit(
      dto.wallet,
      decodeURIComponent(assetMint),
      dto.amount,
    );
  }
}
