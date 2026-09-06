import { describe, expect, it } from 'vitest';
import { loadWorkerEnv } from './env.js';

const BASE = { DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://x' };

describe('конфігурація worker', () => {
  it('dev: без бота і S3 стартує з попередженнями', () => {
    const env = loadWorkerEnv(BASE);
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.MEDIA_RETENTION_DAYS).toBe(365);
  });

  it('production: без бота і S3 не стартує', () => {
    expect(() => loadWorkerEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(
      /TELEGRAM_BOT_TOKEN.*S3_BUCKET/s,
    );
  });

  it('production: повна конфігурація проходить', () => {
    const env = loadWorkerEnv({
      ...BASE,
      NODE_ENV: 'production',
      TELEGRAM_BOT_TOKEN: '1:x',
      S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
      S3_BUCKET: 'vakhta-media',
      S3_ACCESS_KEY: 'k',
      S3_SECRET_KEY: 's',
    });
    expect(env.NODE_ENV).toBe('production');
  });
});
