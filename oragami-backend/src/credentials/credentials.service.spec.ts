import { PublicKey } from '@solana/web3.js';
import { CredentialsService } from './credentials.service';

describe('CredentialsService', () => {
  const prisma = {
    institution: { upsert: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    auditEvent: { create: jest.fn() },
  };

  const authorityPk = new PublicKey('11111111111111111111111111111112');
  const anchor = {
    deriveCredentialPda: jest.fn(),
    deriveVaultStatePda: jest.fn(),
    getAuthority: jest.fn().mockReturnValue({
      publicKey: authorityPk,
    }),
    getProgram: jest.fn(),
    readCredential: jest.fn(),
  };

  let service: CredentialsService;

  beforeEach(() => {
    jest.clearAllMocks();
    const credPda = new PublicKey('So11111111111111111111111111111111111111112');
    const vsPda = new PublicKey('Vote111111111111111111111111111111111111111');
    anchor.deriveCredentialPda.mockReturnValue([credPda, 255]);
    anchor.deriveVaultStatePda.mockReturnValue([vsPda, 255]);

    anchor.getProgram.mockReturnValue({
      methods: {
        issueCredential: jest.fn().mockReturnValue({
          accounts: jest.fn().mockReturnValue({
            rpc: jest.fn().mockResolvedValue('issueSig123'),
          }),
        }),
        revokeCredential: jest.fn().mockReturnValue({
          accounts: jest.fn().mockReturnValue({
            rpc: jest.fn().mockResolvedValue('revokeSig456'),
          }),
        }),
      },
    });

    service = new CredentialsService(prisma as any, anchor as any);
  });

  describe('issue', () => {
    it('calls chain + prisma + audit', async () => {
      prisma.institution.upsert.mockResolvedValue({});
      prisma.auditEvent.create.mockResolvedValue({});

      const out = await service.issue({
        wallet: '11111111111111111111111111111112',
        institutionName: 'Test Bank',
        jurisdiction: 'CH',
        tier: 2,
        kycLevel: 2,
        amlScore: 80,
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      });

      expect(out.success).toBe(true);
      expect(out.txSignature).toBe('issueSig123');
      expect(prisma.institution.upsert).toHaveBeenCalled();
      expect(prisma.auditEvent.create).toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('returns active when on-chain credential valid', async () => {
      const future = Math.floor(Date.now() / 1000) + 86400;
      anchor.readCredential.mockResolvedValue({
        status: 1,
        tier: 2,
        expiresAt: { toNumber: () => future },
      });

      const v = await service.verify('11111111111111111111111111111112');
      expect(v.status).toBe('active');
      expect(v.requiresTravelRule).toBe(true);
    });

    it('returns not_found when chain and DB empty', async () => {
      anchor.readCredential.mockRejectedValue(new Error('missing'));
      prisma.institution.findUnique.mockResolvedValue(null);

      const v = await service.verify('11111111111111111111111111111112');
      expect(v.status).toBe('not_found');
    });
  });
});
