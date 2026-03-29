import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TravelRuleService } from './travel-rule.service';
import { SubmitTravelRuleDto } from './dto/submit-travel-rule.dto';

@Controller('travel-rule')
export class TravelRuleController {
  constructor(private readonly travelRule: TravelRuleService) {}

  @Post()
  submit(@Body() dto: SubmitTravelRuleDto) {
    return this.travelRule.submit(dto);
  }

  @Get(':nonceHash')
  getOne(@Param('nonceHash') nonceHash: string) {
    return this.travelRule.getByNonceHash(decodeURIComponent(nonceHash));
  }
}
