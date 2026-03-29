import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DepositsService } from './deposits.service';

describe('DepositsService', () => {
  const prisma = {
    institution: { findUnique: jest.fn() },
    travelRule: { findUnique: jest.fn() },
    deposit: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    auditEvent: { create: jest.fn() },
  };

  const anchor = {
    readCredential: jest.fn(),
    readVaultState: jest.fn(),
    getConnection: jest.fn(),
  };

  let service: DepositsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DepositsService(prisma as any, anchor as any);
  });

  describe('preflight', () => {
    it('returns active credential and estimated cvault', async () => {
      anchor.readCredential.mockResolvedValue({ status: 1 });
      anchor.readVaultState.mockResolvedValue({
        navPriceBps: { toString: () => '10000' },
        paused: false,
      });

      const r = await service.preflight({
        wallet: '11111111111111111111111111111112',
        usdcAmount: '5000000',
      });

      expect(r.canDeposit).toBe(true);
      expect(r.credentialStatus).toBe('active');
      expect(r.requiresTravelRule).toBe(false);
      expect(r.currentNav).toBe(10000);
      expect(r.estimatedCvault).toBe('5000000');
    });

    it('falls back to DB credential when chain missing', async () => {
      anchor.readCredential.mockRejectedValue(new Error('no account'));
      prisma.institution.findUnique.mockResolvedValue({
        credentialStatus: 'active',
      });
      anchor.readVaultState.mockResolvedValue({
        navPriceBps: 10000n,
        paused: false,
      });

      const r = await service.preflight({
        wallet: '11111111111111111111111111111112',
        usdcAmount: '1000000',
      });
      expect(r.credentialStatus).toBe('active');
      expect(r.canDeposit).toBe(true);
    });

    it('throws when NAV is zero', async () => {
      anchor.readCredential.mockResolvedValue({ status: 1 });
      anchor.readVaultState.mockResolvedValue({
        navPriceBps: { toString: () => '0' },
        paused: false,
      });

      await expect(
        service.preflight({
          wallet: '11111111111111111111111111111112',
          usdcAmount: '1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sets requiresTravelRule for large amounts', async () => {
      anchor.readCredential.mockResolvedValue({ status: 1 });
      anchor.readVaultState.mockResolvedValue({
        navPriceBps: 10000n,
        paused: false,
      });

      const r = await service.preflight({
        wallet: '11111111111111111111111111111112',
        usdcAmount: '2000000000',
      });
      expect(r.requiresTravelRule).toBe(true);
    });
  });

  describe('index', () => {
    it('creates deposit and audit when tx ok', async () => {
      anchor.getConnection.mockReturnValue({
        getTransaction: jest.fn().mockResolvedValue({
          meta: { err: null },
        }),
      });
      prisma.institution.findUnique.mockResolvedValue({ id: 'inst1' });
      anchor.readVaultState.mockResolvedValue({ navPriceBps: 10000n });
      prisma.deposit.create.mockResolvedValue({ id: 'dep1' });
      prisma.travelRule.findUnique.mockResolvedValue(null);

      const out = await service.index({
        txSignature: '5'.repeat(44),
        wallet: '11111111111111111111111111111112',
        usdcAmount: '1000000',
        cvaultAmount: '1000000',
        nonce: 'abc',
      });

      expect(out.success).toBe(true);
      expect(out.depositId).toBe('dep1');
      expect(prisma.auditEvent.create).toHaveBeenCalled();
    });

    it('throws when tx failed', async () => {
      anchor.getConnection.mockReturnValue({
        getTransaction: jest.fn().mockResolvedValue({
          meta: { err: { InstructionError: [0, 'Custom'] } },
        }),
      });

      await expect(
        service.index({
          txSignature: '5'.repeat(44),
          wallet: '11111111111111111111111111111112',
          usdcAmount: '1',
          cvaultAmount: '1',
          nonce: 'n1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when institution missing', async () => {
      anchor.getConnection.mockReturnValue({
        getTransaction: jest.fn().mockResolvedValue({ meta: { err: null } }),
      });
      prisma.institution.findUnique.mockResolvedValue(null);

      await expect(
        service.index({
          txSignature: '5'.repeat(44),
          wallet: '11111111111111111111111111111112',
          usdcAmount: '1',
          cvaultAmount: '1',
          nonce: 'n1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listByInstitutionWallet', () => {
    it('throws when institution not found', async () => {
      prisma.institution.findUnique.mockResolvedValue(null);
      await expect(
        service.listByInstitutionWallet('11111111111111111111111111111112'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
