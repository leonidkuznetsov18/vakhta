import 'reflect-metadata';
import { Controller, Get, Module, Put } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { corsOptions } from './cors.js';

@Controller('probe')
class ProbeController {
  @Get()
  get() {
    return { ok: true };
  }

  @Put()
  put() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const PANEL = 'http://localhost:5173';

describe('CORS для панелі', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(ProbeModule, new FastifyAdapter(), {
      logger: false,
    });
    app.enableCors(corsOptions([PANEL]));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('preflight дозволяє PUT і DELETE з cookie для дозволеного origin', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/probe',
      headers: {
        origin: PANEL,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(PANEL);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    const methods = String(res.headers['access-control-allow-methods']);
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'content-type',
    );
  });

  it('фактичний PUT віддає allow-origin, чужий origin його не отримує', async () => {
    const ok = await app.inject({ method: 'PUT', url: '/probe', headers: { origin: PANEL } });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe(PANEL);

    const foreign = await app.inject({
      method: 'PUT',
      url: '/probe',
      headers: { origin: 'https://evil.example' },
    });
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });
});
