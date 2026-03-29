import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = req.headers['x-admin-api-key'];
    const key = Array.isArray(header) ? header[0] : header;
    const expected = this.config.get<string>('ADMIN_API_KEY');
    if (!expected || !key || key !== expected) {
      throw new UnauthorizedException('Invalid or missing x-admin-key');
    }
    return true;
  }
}
