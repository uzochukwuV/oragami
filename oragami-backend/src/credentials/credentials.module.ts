import { Module } from '@nestjs/common';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SolanaModule } from '../solana/solana.module';

@Module({
  imports: [PrismaModule, SolanaModule],
  controllers: [CredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
