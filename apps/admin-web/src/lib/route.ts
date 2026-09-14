import { useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { setUiState, usePersistentState } from '@/lib/ui-store';
import { confirmLeave } from '@/lib/unsaved';

/**
 * The panel has no router; the address bar still carries `#/<section>/<sub>` so a reload or a
 * shared link lands on the same section and tab. Sections are validated by the caller.
 */
export interface Route {
  readonly section: string;
  readonly sub: string;
  readonly detail?: string;
}

export function readRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  const [section = '', sub = '', detail = ''] = hash.split('/');
  return { section, sub, ...(detail ? { detail } : {}) };
}

/** Retired knowledge-base bookmarks open the same records in the complete incident list. */
export function restoreLegacyRoute(): void {
  const { section, sub } = readRoute();
  if (section !== 'incidentKnowledge') return;
  setUiState({
    'incidents.scope': 'all',
    'incidents.period': 'all',
    'incidents.siteId': '',
    'incidents.openId': sub || null,
  });
  history.replaceState(null, '', `#/incidents${sub ? `/${sub}` : ''}`);
}

/**
 * The address bar is state the panel does not own, so it is subscribed to rather than mirrored.
 * `replaceState` fires no `hashchange` — that is the whole point of it — so a write of our own
 * tells the readers itself.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const handleHashChange = () => {
    restoreLegacyRoute();
    onChange();
  };
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handleHashChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('hashchange', handleHashChange);
    window.removeEventListener('popstate', handleHashChange);
  };
}

/**
 * Moving to another section is a step the browser's Back button must be able to undo, so it
 * pushes a history entry; a tab or an open row inside the same section only refines the address
 * and replaces it, so Back never has to walk through every row someone opened.
 */
export function writeRoute(section: string, sub?: string): void {
  const next = `#/${section}${sub ? `/${sub}` : ''}`;
  if (location.hash === next) return;
  // A section or tab change unmounts whatever form is open; unsaved edits get a say first.
  if (!confirmLeave()) return;
  const sectionChanged = readRoute().section !== section;
  if (sectionChanged) history.pushState(null, '', next);
  else history.replaceState(null, '', next);
  restoreLegacyRoute();
  for (const listener of listeners) listener();
}

/** The current route, re-read whenever the address changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => location.hash,
    () => '',
  );
  const [section = '', sub = '', detail = ''] = hash.replace(/^#\/?/, '').split('/');
  return { section, sub, ...(detail ? { detail } : {}) };
}

/** The sub-path of the current section (a tab), kept in the hash and in step with the UI. */
export function useRouteSub<T extends string>(
  section: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const route = useRoute();
  const sub =
    route.section === section && (allowed as readonly string[]).includes(route.sub)
      ? (route.sub as T)
      : fallback;
  return [sub, (next: T) => writeRoute(section, next)];
}

/**
 * The id of the row open in a sub-row, mirrored into `#/<section>/<id>` so a link can be shared
 * and a reload lands on the same row; the stored value is the fallback.
 */
export function useDeepLinkedId(
  section: string,
  storageKey: string,
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [stored, setStored] = usePersistentState<string | null>(storageKey, null);
  const route = useRoute();
  const id = route.section === section && route.sub ? route.sub : stored;
  const setId: Dispatch<SetStateAction<string | null>> = (next) => {
    const value = typeof next === 'function' ? next(id) : next;
    setStored(value);
    writeRoute(section, value ?? undefined);
  };
  return [id, setId];
}
