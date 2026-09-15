import 'reflect-metadata';
import { Writable } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, LoggerModule, PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import { httpLoggerOptions, requestId } from './logger.js';

const lines: string[] = [];
const output = new Writable({
  write(chunk: Buffer, _encoding, done) {
    lines.push(chunk.toString());
    done();
  },
});
@Controller('log-test')
class LogController {
  constructor(private readonly logger: PinoLogger) {}
  @Get(':token')
  async read() {
    await setTimeout(5);
    this.logger.info({ event: 'handled', err: new Error('secret-error-payload') });
    this.logger.error({
      error: { message: 'secret-nested-error', request: { url: 'secret-upstream-url' } },
    });
    return { ok: true };
  }
}
let app: NestFastifyApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [
      LoggerModule.forRoot({
        pinoHttp: [httpLoggerOptions({ NODE_ENV: 'test', LOG_LEVEL: 'info' }), output],
      }),
    ],
    controllers: [LogController],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false, genReqId: requestId }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => app?.close());
it('isolates concurrent request IDs and excludes raw URLs, cookies and upstream errors', async () => {
  lines.length = 0;
  const ids = ['a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'];
  const responses = await Promise.all(
    ids.map((id) =>
      app.inject({
        method: 'GET',
        url: '/log-test/secret-path?token=secret-query',
        headers: { 'x-request-id': id, cookie: 'secret-cookie', authorization: 'secret-auth' },
      }),
    ),
  );
  expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
  expect(responses.map((response) => response.headers['x-request-id'])).toEqual(ids);
  const text = lines.join('');
  expect(text).not.toContain('secret-');
  const schema = z.object({
    event: z.string().optional(),
    req: z.object({ id: z.string(), method: z.string() }).optional(),
  });
  const handled = lines
    .flatMap((line) => line.trim().split('\n'))
    .map((line) => schema.parse(JSON.parse(line)))
    .filter((line) => line.event === 'handled');
  expect(handled.map((line) => line.req?.id).sort()).toEqual(ids);
});
it('replaces an invalid caller-supplied ID with a safe generated ID', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/log-test/secret-path',
    headers: { 'x-request-id': 'secret-invalid-id' },
  });
  expect(z.uuid().safeParse(response.headers['x-request-id']).success).toBe(true);
  expect(lines.join('')).not.toContain('secret-invalid-id');
});
