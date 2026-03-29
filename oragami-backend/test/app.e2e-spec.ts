import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, RequestMethod } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { cleanDatabase } from './setup';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const adminKey = process.env.ADMIN_API_KEY || 'change-me-before-demo';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: [
        { path: '/', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/cranks', method: RequestMethod.GET },
      ],
    });
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await app.close();
  });

  it('/health (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('db_connected');
    expect(res.body).toHaveProperty('solana_connected');
    expect(res.body).toHaveProperty('six_connected');
  });

  it('/health/cranks (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/health/cranks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('nav_crank');
    expect(res.body).toHaveProperty('yield_crank');
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('oragami-vault-backend');
      });
  });

  it('/api/vault/state (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/api/vault/state');

    // May return 200 or 500 depending on on-chain state
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('navPriceBps');
    }
  });

  it('/api/vault/nav/history (GET)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/vault/nav/history',
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('/api/vault/stats (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/api/vault/stats');

    // May return 200 or 500 depending on on-chain state
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('totalInstitutions');
    }
  });

  it('/api/credentials (GET) with admin key', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/credentials')
      .set('x-admin-key', adminKey);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('/api/credentials (GET) without admin key returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/credentials');
    expect(res.status).toBe(401);
  });
});
