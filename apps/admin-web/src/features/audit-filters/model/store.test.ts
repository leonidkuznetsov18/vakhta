import { afterEach, expect, it, vi } from 'vitest';
import { createAuditFilterStore, EMPTY_AUDIT_FILTERS } from './store';
const actorA = 'a0000000-0000-4000-8000-000000000001';
const actorB = 'a0000000-0000-4000-8000-000000000002';
function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
}
afterEach(() => vi.restoreAllMocks());
it('restores filters by actor without carrying them into another account', () => {
  const backing = storage();
  const first = createAuditFilterStore(backing);
  first.getState().update(actorA, { action: 'shift.correct' });
  first.getState().update(actorB, { type: 'SHIFT_STARTED' });
  const next = createAuditFilterStore(backing);
  expect(next.getState().byActor[actorA]).toEqual({
    ...EMPTY_AUDIT_FILTERS,
    action: 'shift.correct',
  });
  expect(next.getState().byActor[actorB]).toEqual({
    ...EMPTY_AUDIT_FILTERS,
    type: 'SHIFT_STARTED',
  });
});
it.each([
  '{broken',
  JSON.stringify({ version: 1, state: { byActor: { [actorA]: { action: 7 } } } }),
  JSON.stringify({ version: 5, state: { byActor: {} } }),
])('recovers from invalid stored data %s', (data) => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  expect(createAuditFilterStore(storage(data)).getState().byActor).toEqual({});
});
it('migrates only the recognized actor-owned version', () => {
  const byActor = { [actorA]: { ...EMPTY_AUDIT_FILTERS, action: 'shift.correct' } };
  expect(
    createAuditFilterStore(storage(JSON.stringify({ version: 0, state: { byActor } }))).getState()
      .byActor,
  ).toEqual(byActor);
});
it('does not admit unowned keys or persist functions', () => {
  const backing = storage();
  const store = createAuditFilterStore(backing);
  store.getState().update('anonymous', { action: 'shift.correct' });
  expect(store.getState().byActor).toEqual({});
  store.getState().update(actorA, { action: 'shift.correct' });
  expect(backing.getItem()).not.toContain('update');
  expect(backing.getItem()).toContain('"version":1');
});
it('keeps preferences in memory when reads and writes are blocked', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const denied = () => {
    throw new Error('Storage blocked');
  };
  const store = createAuditFilterStore({ getItem: denied, setItem: denied, removeItem: denied });
  expect(() => store.getState().update(actorA, { action: 'shift.correct' })).not.toThrow();
  expect(store.getState().byActor[actorA]?.action).toBe('shift.correct');
  expect(warning).toHaveBeenCalled();
  expect(warning.mock.calls.flat().join(' ')).not.toContain('shift.correct');
});
