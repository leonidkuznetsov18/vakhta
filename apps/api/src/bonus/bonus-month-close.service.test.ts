import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { BonusMonthCloseService } from './bonus-month-close.service.js';

describe('monthly nomination startup catch-up', () => {
  afterEach(() => vi.useRealTimers());
  it('runs immediately, prevents overlap and awaits the in-flight close before shutdown', async () => {
    vi.useFakeTimers();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const closeDueMonths = vi.fn(async () => {
      await held;
      return [];
    });
    const service = new BonusMonthCloseService(
      { closeDueMonths },
      new ConfigService<Env, true>({ LOG_LEVEL: 'silent', NODE_ENV: 'test' }),
    );
    service.onModuleInit();
    expect(closeDueMonths).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(closeDueMonths).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stop = service.onModuleDestroy().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stop;
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(closeDueMonths).toHaveBeenCalledTimes(1);
  });
});
