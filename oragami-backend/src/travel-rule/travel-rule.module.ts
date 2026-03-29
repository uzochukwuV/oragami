import { Module } from '@nestjs/common';
import { TravelRuleController } from './travel-rule.controller';
import { TravelRuleService } from './travel-rule.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SolanaModule } from '../solana/solana.module';

@Module({
  imports: [PrismaModule, SolanaModule],
  controllers: [TravelRuleController],
  providers: [TravelRuleService],
  exports: [TravelRuleService],
})
export class TravelRuleModule {}
