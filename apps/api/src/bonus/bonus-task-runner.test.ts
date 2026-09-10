import { afterEach, describe, expect, it, vi } from 'vitest';
import { BonusTaskRunner } from './bonus-task-runner.js';

describe('bonus background lifecycle', () => {
  afterEach(() => vi.useRealTimers());
  it('starts recovery immediately, avoids overlapping work and drains before shutdown', async () => {
    vi.useFakeTimers();
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const recover = vi.fn(() => pending);
    const dispatch = vi.fn(async () => {});
    const failed = vi.fn();
    const runner = new BonusTaskRunner({ recover, dispatch, failed });
    runner.start();
    expect(recover).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    let stopped = false;
    const stop = runner.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stop;
    expect(dispatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });

  it('reports recovery failure and still dispatches durable work without an unhandled rejection', async () => {
    vi.useFakeTimers();
    const recover = vi.fn(async () => {
      throw new Error('Unavailable recovery');
    });
    const dispatch = vi.fn(async () => {});
    const failed = vi.fn();
    const runner = new BonusTaskRunner({ recover, dispatch, failed });
    runner.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(failed).toHaveBeenCalledWith('RECOVERY');
    expect(dispatch).toHaveBeenCalled();
    await runner.stop();
  });
});
