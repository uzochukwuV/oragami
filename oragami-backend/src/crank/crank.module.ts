import { Module } from '@nestjs/common';
import { NavCrankService } from './nav-crank.service';
import { SolanaModule } from '../solana/solana.module';
import { DataModule } from '../data/data.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthModule } from '../health/health.module';
import { VaultModule } from '../vault/vault.module';

@Module({
  imports: [SolanaModule, DataModule, PrismaModule, HealthModule, VaultModule],
  providers: [NavCrankService],
  exports: [NavCrankService],
})
export class CrankModule {}
