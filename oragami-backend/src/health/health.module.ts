import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { CrankStateService } from './crank-state.service';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [HealthService, CrankStateService],
  exports: [HealthService, CrankStateService],
})
export class HealthModule {}
