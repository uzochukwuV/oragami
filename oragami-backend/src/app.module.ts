import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SolanaModule } from './solana/solana.module';
import { DataModule } from './data/data.module';
import { CredentialsModule } from './credentials/credentials.module';
import { TravelRuleModule } from './travel-rule/travel-rule.module';
import { DepositsModule } from './deposits/deposits.module';
import { VaultModule } from './vault/vault.module';
import { HealthModule } from './health/health.module';
import { CrankModule } from './crank/crank.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SolanaModule,
    DataModule,
    CredentialsModule,
    TravelRuleModule,
    DepositsModule,
    VaultModule,
    HealthModule,
    CrankModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
