import { Module } from '@nestjs/common';
import { MultiAssetVaultController } from './multi-asset-vault.controller';
import { MultiAssetVaultService } from './multi-asset-vault.service';

@Module({
  controllers: [MultiAssetVaultController],
  providers: [MultiAssetVaultService],
  exports: [MultiAssetVaultService],
})
export class MultiAssetVaultModule {}
