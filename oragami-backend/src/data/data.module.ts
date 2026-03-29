import { Global, Module } from '@nestjs/common';
import { SixService } from './six.service';

@Global()
@Module({
  providers: [SixService],
  exports: [SixService],
})
export class DataModule {}
