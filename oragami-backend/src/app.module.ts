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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
