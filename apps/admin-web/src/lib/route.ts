import { useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { usePersistentState } from '@/lib/ui-store';

/**
 * The panel has no router; the address bar still carries `#/<section>/<sub>` so a reload or a
 * shared link lands on the same section and tab. Sections are validated by the caller.
 */
export interface Route {
  readonly section: string;
  readonly sub: string;
}

export function readRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  const [section = '', sub = ''] = hash.split('/');
  return { section, sub };
}

/**
 * The address bar is state the panel does not own, so it is subscribed to rather than mirrored.
 * `replaceState` fires no `hashchange` — that is the whole point of it — so a write of our own
 * tells the readers itself.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('hashchange', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('hashchange', onChange);
  };
}

export function writeRoute(section: string, sub?: string): void {
  const next = `#/${section}${sub ? `/${sub}` : ''}`;
  if (location.hash === next) return;
  history.replaceState(null, '', next);
  for (const listener of listeners) listener();
}

/** The current route, re-read whenever the address changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => location.hash,
    () => '',
  );
  const [section = '', sub = ''] = hash.replace(/^#\/?/, '').split('/');
  return { section, sub };
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
