import { useStore } from 'zustand';
import { auditFilterStore, EMPTY_AUDIT_FILTERS } from './store';

export function useAuditFilters(actorId: string | undefined) {
  const filters = useStore(auditFilterStore, (state) =>
    actorId ? (state.byActor[actorId] ?? EMPTY_AUDIT_FILTERS) : EMPTY_AUDIT_FILTERS,
  );
  const update = auditFilterStore.getState().update;
  return {
    ...filters,
    setAction: (action: string) => {
      if (actorId) update(actorId, { action });
    },
    setObjectType: (objectType: string) => {
      if (actorId) update(actorId, { objectType });
    },
    setType: (type: string) => {
      if (actorId) update(actorId, { type });
    },
  };
}
