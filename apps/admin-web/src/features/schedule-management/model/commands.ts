import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { z } from 'zod';
import { ScheduleWebCommand } from '@vakhta/contracts';
import { ApiError } from '@/api';

const STORAGE_KEY = 'vakhta.ui.schedule.commands.v1';
const pendingSchema = z.record(z.string(), ScheduleWebCommand);
type Pending = Readonly<Record<string, ScheduleWebCommand>>;
type Exclusive = <T>(action: () => T) => Promise<T>;
const exclusive: Exclusive = (action) => navigator.locks.request(STORAGE_KEY, action);
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem'>;
interface CommandQueue {
  pending: Pending;
  recoveryError: boolean;
  storageError: boolean;
  enqueue: (scope: string, command: ScheduleWebCommand) => Promise<ScheduleWebCommand | null>;
  recover: (scope: string, commandId: string) => Promise<ScheduleWebCommand | null>;
  complete: (scope: string, commandId: string) => Promise<boolean>;
}

/** Persist before dispatch, so an interrupted page can always reuse the original identity. */
export function createCommandQueue(storage: StorageAccess, serialize: Exclusive = exclusive) {
  let pending: Pending = {};
  let recoveryError = false;
  try {
    const raw = storage().getItem(STORAGE_KEY);
    const input: unknown = raw ? JSON.parse(raw) : {};
    pending = pendingSchema.parse(input);
  } catch {
    // Keep the original bytes and block new commands rather than erase an unknown outcome.
    recoveryError = true;
  }
  return createStore<CommandQueue>((set) => {
    async function update<T>(action: (latest: Pending) => T, fallback: T): Promise<T> {
      try {
        return await serialize(() => {
          let latest: Pending;
          try {
            const raw = storage().getItem(STORAGE_KEY);
            latest = pendingSchema.parse(raw ? JSON.parse(raw) : {});
          } catch {
            set({ recoveryError: true });
            return fallback;
          }
          set({ pending: latest, recoveryError: false });
          return action(latest);
        });
      } catch {
        // Unavailable locking/storage must never fall back to unsafe concurrent writes.
        set({ storageError: true });
        return fallback;
      }
    }
    function persist(next: Pending) {
      try {
        storage().setItem(STORAGE_KEY, JSON.stringify(next));
        set({ pending: next, storageError: false });
        return true;
      } catch {
        set({ storageError: true });
        return false;
      }
    }
    return {
      pending,
      recoveryError,
      storageError: false,
      enqueue(scope, input) {
        return update((latest) => {
          if (latest[scope]) return null;
          const command = ScheduleWebCommand.parse(input);
          return persist({ ...latest, [scope]: command }) ? command : null;
        }, null);
      },
      recover(scope, commandId) {
        return update(
          (latest) => (latest[scope]?.commandId === commandId ? latest[scope] : null),
          null,
        );
      },
      complete(scope, commandId) {
        return update((latest) => {
          if (latest[scope]?.commandId !== commandId) return false;
          const next = { ...latest };
          delete next[scope];
          return persist(next);
        }, false);
      },
    };
  });
}

export const scheduleCommands = createCommandQueue(() => localStorage);
export function useScheduleCommands() {
  return useStore(scheduleCommands);
}

/** Authentication/proxy failures cannot prove whether an earlier attempt committed. */
export function commandWasRejected(error: unknown) {
  return (
    error instanceof ApiError &&
    [400, 404, 409, 422].includes(error.status) &&
    !!error.code &&
    error.code !== 'IDEMPOTENCY_CONFLICT'
  );
}
