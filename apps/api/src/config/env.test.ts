import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const DEV = {
  DATABASE_URL: 'postgres://vakhta:vakhta@localhost:5432/vakhta',
  REDIS_URL: 'redis://localhost:6380',
  AUTH_SECRET: 'change-me-to-a-random-secret-of-at-least-32-chars',
  ACTIVATION_PEPPER: 'change-me-to-a-long-random-secret-value',
};

const PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@db.example.com:5432/vakhta?sslmode=require',
  REDIS_URL: 'rediss://default:p@redis.upstash.io:6379',
  PUBLIC_BASE_URL: 'https://api.vakhta.app',
  CORS_ORIGINS: 'https://panel.vakhta.app,https://kiosk.vakhta.app',
  AUTH_SECRET: 'Qx9sV2lm4Kp8ZcR1tYb7NwE3uHd6JfA0gLo5iSk2MrT8',
  ACTIVATION_PEPPER: 'Hn4Rk8Lw2Zp6Qs1Vt9Yb3Ue7Xc5Md0Ja',
  TELEGRAM_BOT_TOKEN: '123456:token',
  TELEGRAM_MODE: 'webhook',
  TELEGRAM_WEBHOOK_SECRET: 'Fz7Kq2Wn9Rt4Yp8Lb1Xv6',
  S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  S3_BUCKET: 'vakhta-media',
  S3_ACCESS_KEY: 'AKIA1234567890',
  S3_SECRET_KEY: 'Pz3Lr8Wq1Nt6Ky4Bv9Xm2Sd7Hf0Jc5Ga',
  METRICS_TOKEN: 'Mt8Rk2Wq5Zp9Ls1Yv4Nb7',
};

describe('конфігурація середовища', () => {
  it('dev: мінімальний набір проходить, заглушки дозволені', () => {
    const env = loadEnv(DEV);
    expect(env.NODE_ENV).toBe('development');
    expect(env.AUTH_COOKIE_SAME_SITE).toBe('lax');
    expect(env.METRICS_TOKEN).toBeUndefined();
  });

  it('production: повна конфігурація проходить', () => {
    const env = loadEnv(PROD);
    expect(env.NODE_ENV).toBe('production');
    expect(env.CORS_ORIGINS).toEqual(['https://panel.vakhta.app', 'https://kiosk.vakhta.app']);
  });

  it('production: заглушки, http і polling зупиняють старт одним списком', () => {
    const bad = {
      ...PROD,
      PUBLIC_BASE_URL: 'http://api.vakhta.app',
      CORS_ORIGINS: 'http://panel.vakhta.app',
      AUTH_SECRET: 'change-me-to-a-random-secret-of-at-least-32-chars',
      TELEGRAM_MODE: 'polling',
      METRICS_TOKEN: '',
    };
    expect(() => loadEnv(bad)).toThrow(/не готова до продакшену/);
    try {
      loadEnv(bad);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('PUBLIC_BASE_URL');
      expect(message).toContain('CORS_ORIGINS');
      expect(message).toContain('AUTH_SECRET');
      expect(message).toContain('TELEGRAM_MODE');
      expect(message).toContain('METRICS_TOKEN');
    }
  });

  it('production: без S3 фото передач не працюють, тому старт заборонений', () => {
    const { S3_BUCKET: _b, S3_ACCESS_KEY: _a, S3_SECRET_KEY: _s, ...noS3 } = PROD;
    expect(() => loadEnv(noS3)).toThrow(/S3_BUCKET/);
  });

  it('webhook без секрету відхиляється в будь-якому середовищі', () => {
    expect(() => loadEnv({ ...DEV, TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_MODE: 'webhook' })).toThrow(
      /TELEGRAM_WEBHOOK_SECRET/,
    );
  });
});
