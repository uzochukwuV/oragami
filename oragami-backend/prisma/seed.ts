import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

const prisma = new PrismaClient({ adapter })
async function main() {
  console.log('Seeding demo data...');

  const tier3 = await prisma.institution.upsert({
    where: { walletAddress: 'DEMO_WALLET_TIER3_PLACEHOLDER' },
    update: {},
    create: {
      walletAddress: 'DEMO_WALLET_TIER3_PLACEHOLDER',
      name: 'Helvetia Capital AG',
      jurisdiction: 'CH',
      tier: 3,
      kycLevel: 3,
      amlScore: 98,
      credentialStatus: 'active',
      credentialIssuedAt: new Date(),
      credentialExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  const tier2 = await prisma.institution.upsert({
    where: { walletAddress: 'DEMO_WALLET_TIER2_PLACEHOLDER' },
    update: {},
    create: {
      walletAddress: 'DEMO_WALLET_TIER2_PLACEHOLDER',
      name: 'Meridian Asset Management Ltd',
      jurisdiction: 'GB',
      tier: 2,
      kycLevel: 2,
      amlScore: 85,
      credentialStatus: 'active',
      credentialIssuedAt: new Date(),
      credentialExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.institution.upsert({
    where: { walletAddress: 'DEMO_WALLET_RETAIL_PLACEHOLDER' },
    update: {},
    create: {
      walletAddress: 'DEMO_WALLET_RETAIL_PLACEHOLDER',
      name: 'Retail Investor Demo',
      jurisdiction: 'US',
      tier: 1,
      kycLevel: 1,
      amlScore: 70,
      credentialStatus: 'active',
      credentialIssuedAt: new Date(),
      credentialExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  // Seed 30 days of NAV history — realistic upward curve 10000 → 10430
  const navRecords = [];
  for (let i = 30; i >= 0; i--) {
    const t = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const progress = (30 - i) / 30;
    const nav = Math.round(10000 + progress * 430 + (Math.random() - 0.5) * 20);
    navRecords.push({
      navBps: BigInt(nav),
      source: 'SIX',
      rawPayload: { simulated: true, day: 30 - i },
      timestamp: t,
    });
  }
  await prisma.navSnapshot.createMany({ data: navRecords, skipDuplicates: true });

  // Seed 30 days of yield events
  const yieldRecords = [];
  const totalDeposits = BigInt(10_000_000_000); // 10,000 USDC
  for (let i = 30; i >= 1; i--) {
    const t = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dailyYield =
      (totalDeposits * BigInt(8000) * BigInt(500)) /
      BigInt(10000) /
      BigInt(10000) /
      BigInt(365);
    yieldRecords.push({
      totalDeposits,
      usxAllocationBps: 8000,
      apyBps: 500,
      daysElapsed: 1,
      yieldAccrued: dailyYield,
      navBeforeBps: BigInt(10000 + (30 - i) * 14),
      navAfterBps: BigInt(10000 + (31 - i) * 14),
      eusxPrice: 1.0 + (30 - i) * 0.00143,
      timestamp: t,
    });
  }
  await prisma.yieldEvent.createMany({ data: yieldRecords, skipDuplicates: true });

  // One demo deposit for tier3
  await prisma.deposit
    .upsert({
      where: { nonce: 'demo-seed-deposit-001' },
      update: {},
      create: {
        txSignature: 'demo_tx_seed_001',
        institutionId: tier3.id,
        usdcAmount: BigInt(10_000_000_000),
        cvaultAmount: BigInt(10_000_000_000),
        navAtDeposit: BigInt(10000),
        nonce: 'demo-seed-deposit-001',
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    })
    .catch(() => {});

  await prisma.auditEvent.create({
    data: {
      institutionId: tier2.id,
      actor: 'system',
      role: 'crank',
      action: 'seed',
      result: 'success',
      metadata: { note: 'Demo seed run' },
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
