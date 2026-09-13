import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { initSentry, scrubEvent } from './sentry.js';

describe('Sentry без витоку секретів (CLAUDE.md, ТЗ 13)', () => {
  it('без DSN нічого не ініціалізує', () => {
    expect(initSentry({ NODE_ENV: 'production' }, 'api')).toBe(false);
  });

  it('прибирає авторизацію, cookie і секрет вебхука з події', () => {
    const event = {
      request: {
        headers: {
          Authorization: 'Bearer secret',
          cookie: 'better-auth.session_token=abc',
          'X-Telegram-Bot-Api-Secret-Token': 'wh-secret',
          'user-agent': 'curl',
        },
        cookies: { a: 'b' },
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent;
    const scrubbed = scrubEvent(event);
    expect(scrubbed.request?.headers).toEqual({
      Authorization: '[redacted]',
      cookie: '[redacted]',
      'X-Telegram-Bot-Api-Secret-Token': '[redacted]',
      'user-agent': 'curl',
    });
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.user).toEqual({ id: 'u1' });
  });
});

it('redacts a personal calendar feed token from the request URL', () => {
  const event = scrubEvent({
    request: { url: 'https://api.example/calendar/feed/abcdefghijklmnopqrstuvwxyz0123456789.ics' },
  } as never);
  expect((event as { request?: { url?: string } }).request?.url).toBe(
    'https://api.example/calendar/feed/[redacted]',
  );
});
