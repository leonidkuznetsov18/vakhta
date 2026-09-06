import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { MetricsController, metricsTokenMatches, type MetricsService } from './metrics.module.js';

const reply = { header: () => reply } as unknown as Pick<FastifyReply, 'header'>;

function controller(token: string | undefined): MetricsController {
  const metrics = { render: async () => '# ok\n' } as unknown as MetricsService;
  const config = { get: () => token } as unknown as ConfigService<Env, true>;
  return new MetricsController(metrics, config);
}

describe('GET /metrics за токеном (ТЗ 12)', () => {
  it('без METRICS_TOKEN (dev) ендпоінт відкритий', async () => {
    await expect(controller(undefined).render(undefined, reply)).resolves.toContain('# ok');
  });

  it('з токеном потрібен Bearer, інакше 401', async () => {
    const c = controller('Mt8Rk2Wq5Zp9Ls1Yv4Nb7');
    await expect(c.render(undefined, reply)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(c.render('Bearer wrong', reply)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(c.render('Bearer Mt8Rk2Wq5Zp9Ls1Yv4Nb7', reply)).resolves.toContain('# ok');
  });

  it('порівняння не залежить від довжини і префікса', () => {
    expect(metricsTokenMatches('Bearer abc', 'abc')).toBe(true);
    expect(metricsTokenMatches('abc', 'abc')).toBe(false);
    expect(metricsTokenMatches('Bearer ab', 'abc')).toBe(false);
    expect(metricsTokenMatches(undefined, 'abc')).toBe(false);
  });
});
