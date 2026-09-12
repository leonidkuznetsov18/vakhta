import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleWebCommand } from '@vakhta/contracts';
import { ApiError } from '@/api';
import { commandWasRejected, createCommandQueue } from './commands';

beforeEach(() =>
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, action: () => unknown) => action() },
  }),
);
afterEach(() => vi.unstubAllGlobals());

const command: ScheduleWebCommand = {
  commandId: 'a0000000-0000-4000-8000-000000000001',
  action: 'DELETE',
  versionId: 'b0000000-0000-4000-8000-000000000001',
  expectedRevision: 3,
};
function storage(initial: string | null = null) {
  let raw = initial;
  return {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
}

describe('durable local command queue', () => {
  it('restores exact pending intent and isolates scope after a new store is created', async () => {
    const disk = storage();
    const first = createCommandQueue(() => disk);
    expect(await first.getState().enqueue('actor-a:unit-a', command)).toEqual(command);
    const reloaded = createCommandQueue(() => disk);
    expect(reloaded.getState().pending['actor-a:unit-a']).toEqual(command);
    expect(reloaded.getState().pending['actor-b:unit-a']).toBeUndefined();
    expect(
      await reloaded
        .getState()
        .enqueue('actor-a:unit-a', { ...command, commandId: crypto.randomUUID() }),
    ).toBeNull();
    expect(await reloaded.getState().complete('actor-a:unit-a', crypto.randomUUID())).toBe(false);
    expect(await reloaded.getState().complete('actor-a:unit-a', command.commandId)).toBe(true);
    expect(createCommandQueue(() => disk).getState().pending).toEqual({});
  });
  it('preserves malformed storage and refuses to invent a replacement identity', async () => {
    const disk = storage('{broken');
    const queue = createCommandQueue(() => disk);
    expect(queue.getState().recoveryError).toBe(true);
    expect(await queue.getState().enqueue('scope', command)).toBeNull();
    expect(disk.getItem()).toBe('{broken');
  });
  it('retains a receipt-resolvable command if removing its persisted intent fails', async () => {
    const disk = storage();
    let fail = false;
    const queue = createCommandQueue(() => ({
      ...disk,
      setItem: (key, value) => {
        if (fail) throw new Error('Unavailable');
        disk.setItem(key, value);
      },
    }));
    await queue.getState().enqueue('scope', command);
    fail = true;
    expect(await queue.getState().complete('scope', command.commandId)).toBe(false);
    expect(queue.getState().pending['scope']).toEqual(command);
    expect(queue.getState().storageError).toBe(true);
    fail = false;
    expect(await queue.getState().complete('scope', command.commandId)).toBe(true);
  });
  it('merges live-tab writes and blocks a second identity for the same scope', async () => {
    const disk = storage();
    const first = createCommandQueue(() => disk);
    const second = createCommandQueue(() => disk);
    const other = { ...command, commandId: crypto.randomUUID() };
    expect(
      await Promise.all([
        first.getState().enqueue('scope-a', command),
        second.getState().enqueue('scope-a', other),
      ]),
    ).toEqual([command, null]);
    expect(await second.getState().enqueue('scope-b', other)).toEqual(other);
    expect(await first.getState().complete('scope-a', command.commandId)).toBe(true);
    expect(createCommandQueue(() => disk).getState().pending).toEqual({ 'scope-b': other });
    expect(await second.getState().recover('scope-a', command.commandId)).toBeNull();
    expect(await first.getState().enqueue('scope-a', other)).toEqual(other);
    expect(await second.getState().recover('scope-a', command.commandId)).toBeNull();
    expect(await second.getState().recover('scope-a', other.commandId)).toEqual(other);
  });
  it('blocks dispatch when origin-wide locking is unavailable', async () => {
    const disk = storage();
    const queue = createCommandQueue(
      () => disk,
      async () => {
        throw new Error('Unavailable');
      },
    );
    expect(await queue.getState().enqueue('scope', command)).toBeNull();
    expect(queue.getState().storageError).toBe(true);
    expect(disk.getItem()).toBeNull();
  });
  it('distinguishes authoritative domain rejection from an unknown transport or authorization outcome', async () => {
    expect(commandWasRejected(new ApiError(409, 'SCHEDULE_REVISION_CONFLICT', 'stale'))).toBe(true);
    expect(commandWasRejected(new ApiError(422, 'EMPLOYEE_NOT_ACTIVE', 'inactive'))).toBe(true);
    for (const error of [
      new TypeError('Lost response'),
      new ApiError(500, null, 'Failed'),
      new ApiError(403, null, 'Forbidden'),
      new ApiError(404, null, 'Old endpoint'),
      new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Mismatch'),
    ])
      expect(commandWasRejected(error)).toBe(false);
  });
});
