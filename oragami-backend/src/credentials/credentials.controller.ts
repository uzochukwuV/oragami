import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { IssueCredentialDto } from './dto/issue-credential.dto';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';

@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Post()
  @UseGuards(AdminApiKeyGuard)
  issue(@Body() dto: IssueCredentialDto) {
    return this.credentials.issue(dto);
  }

  @Get()
  @UseGuards(AdminApiKeyGuard)
  list() {
    return this.credentials.listAll();
  }

  @Get(':wallet/verify')
  verify(@Param('wallet') wallet: string) {
    return this.credentials.verify(decodeURIComponent(wallet));
  }

  @Get(':wallet')
  @UseGuards(AdminApiKeyGuard)
  getOne(@Param('wallet') wallet: string) {
    return this.credentials.getByWallet(decodeURIComponent(wallet));
  }

  @Put(':wallet/revoke')
  @UseGuards(AdminApiKeyGuard)
  revoke(@Param('wallet') wallet: string) {
    return this.credentials.revoke(decodeURIComponent(wallet));
  }
}
