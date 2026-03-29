import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminApiKeyGuard } from './admin-api-key.guard';

function mockContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

describe('AdminApiKeyGuard', () => {
  it('allows when X-Admin-Key matches ADMIN_API_KEY', () => {
    const config = {
      get: jest.fn().mockReturnValue('secret-key'),
    } as unknown as ConfigService;
    const guard = new AdminApiKeyGuard(config);
    expect(
      guard.canActivate(mockContext({ 'x-admin-key': 'secret-key' })),
    ).toBe(true);
  });

  it('throws when key missing', () => {
    const config = {
      get: jest.fn().mockReturnValue('secret-key'),
    } as unknown as ConfigService;
    const guard = new AdminApiKeyGuard(config);
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when key wrong', () => {
    const config = {
      get: jest.fn().mockReturnValue('secret-key'),
    } as unknown as ConfigService;
    const guard = new AdminApiKeyGuard(config);
    expect(() =>
      guard.canActivate(mockContext({ 'x-admin-key': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });
});
