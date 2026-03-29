import { Global, Module } from '@nestjs/common';
import { AnchorService } from './anchor.service';
import { SolsticeService } from './solstice.service';

@Global()
@Module({
  providers: [AnchorService, SolsticeService],
  exports: [AnchorService, SolsticeService],
})
export class SolanaModule {}
