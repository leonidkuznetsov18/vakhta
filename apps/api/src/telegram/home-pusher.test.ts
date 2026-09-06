import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShiftChangedEvent } from '@vakhta/contracts';
import { HomeScreenPusher } from './home-pusher.js';

const EMP = 'b0000000-0000-4000-8000-000000000001';
const OTHER = 'b0000000-0000-4000-8000-000000000002';

function change(over: Partial<ShiftChangedEvent> = {}): ShiftChangedEvent {
  return {
    sessionId: 'c0000000-0000-4000-8000-000000000001',
    employeeId: EMP,
    state: 'PREPARATION',
    version: 1,
    at: '2026-09-06T12:00:00.000Z',
    source: 'WEB',
    ...over,
  };
}

describe('HomeScreenPusher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes one screen per employee after a burst of changes made outside the bot', async () => {
    const send = vi.fn(async (_employeeId: string) => undefined);
    const pusher = new HomeScreenPusher(send, { warn: vi.fn() }, 1000);
    pusher.onChange(change({ state: 'PREPARATION' }));
    pusher.onChange(change({ state: 'WORKING', version: 2 }));
    pusher.onChange(change({ employeeId: OTHER, source: 'TERMINAL' }));
    expect(pusher.waiting).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map((c) => c[0]).sort()).toEqual([EMP, OTHER]);
    expect(pusher.waiting).toBe(0);
  });

  it('ignores changes the bot made itself and survives a failed send', async () => {
    const send = vi.fn(async () => {
      throw new Error('bot blocked');
    });
    const warn = vi.fn();
    const pusher = new HomeScreenPusher(send, { warn }, 100);
    pusher.onChange(change({ source: 'TELEGRAM' }));
    expect(pusher.waiting).toBe(0);
    pusher.onChange(change({ source: 'SYSTEM' }));
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('stop() drops everything still waiting', async () => {
    const send = vi.fn(async (_employeeId: string) => undefined);
    const pusher = new HomeScreenPusher(send, { warn: vi.fn() }, 100);
    pusher.onChange(change());
    pusher.stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(send).not.toHaveBeenCalled();
  });
});
