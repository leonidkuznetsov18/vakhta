import { createStore } from 'zustand/vanilla';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { z } from 'zod';

const filtersSchema = z.object({
  action: z.string().max(128),
  objectType: z.string().max(128),
  type: z.string().max(128),
});
export type AuditFilters = z.infer<typeof filtersSchema>;
export const EMPTY_AUDIT_FILTERS: AuditFilters = { action: '', objectType: '', type: '' };
const savedSchema = z.object({ byActor: z.record(z.uuid(), filtersSchema) });
interface AuditFilterState {
  byActor: Record<string, AuditFilters>;
  update(actorId: string, patch: Partial<AuditFilters>): void;
}
const storageKey = 'vakhta.audit-filters';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function createAuditFilterStore(storage: PreferenceStorage) {
  const safeStorage: StateStorage = {
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        console.warn('Audit preference storage is unavailable');
        return null;
      }
    },
    setItem(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        console.warn('Audit preferences could not be persisted');
      }
    },
    removeItem(key) {
      try {
        storage.removeItem(key);
      } catch {
        console.warn('Audit preferences could not be removed');
      }
    },
  };
  return createStore<AuditFilterState>()(
    persist(
      (set) => ({
        byActor: {},
        update(actorId, patch) {
          if (!z.uuid().safeParse(actorId).success) return;
          set((state) => ({
            byActor: {
              ...state.byActor,
              [actorId]: filtersSchema.parse({
                ...EMPTY_AUDIT_FILTERS,
                ...state.byActor[actorId],
                ...patch,
              }),
            },
          }));
        },
      }),
      {
        name: storageKey,
        version: 1,
        storage: createJSONStorage(() => safeStorage),
        partialize: ({ byActor }) => ({ byActor }),
        migrate: (persisted, version) => {
          const result = version === 0 ? savedSchema.safeParse(persisted) : null;
          if (!result?.success)
            console.warn('Audit preference version could not be migrated; using defaults');
          return result?.success ? result.data : { byActor: {} };
        },
        merge: (persisted, current) => {
          const result = savedSchema.safeParse(persisted);
          if (persisted !== undefined && !result.success)
            console.warn('Audit preference schema is invalid; using defaults');
          return { ...current, byActor: result.success ? result.data.byActor : {} };
        },
        onRehydrateStorage: () => (_state, error) => {
          if (error) console.warn('Audit preferences could not be restored; using defaults');
        },
      },
    ),
  );
}

// Access lazily so blocked browser storage falls back to the in-memory store above.
export const auditFilterStore = createAuditFilterStore({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});
