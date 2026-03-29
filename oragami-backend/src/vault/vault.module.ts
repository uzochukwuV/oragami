import { Module } from '@nestjs/common';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SolanaModule } from '../solana/solana.module';
import { DataModule } from '../data/data.module';

@Module({
  imports: [PrismaModule, SolanaModule, DataModule],
  controllers: [VaultController],
  providers: [VaultService],
})
export class VaultModule {}
