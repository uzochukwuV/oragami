import { Module } from '@nestjs/common';
import { NavCrankService } from './nav-crank.service';
import { SolanaModule } from '../solana/solana.module';
import { DataModule } from '../data/data.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [SolanaModule, DataModule, PrismaModule],
  providers: [NavCrankService],
  exports: [NavCrankService],
})
export class CrankModule {}
