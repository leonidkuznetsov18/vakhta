import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { usePersistentState } from '@/lib/persistent-state';

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

export function writeRoute(section: string, sub?: string): void {
  const next = `#/${section}${sub ? `/${sub}` : ''}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

/** The sub-path of the current section (a tab), kept in the hash and in step with the UI. */
export function useRouteSub<T extends string>(
  section: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const fromHash = (): T => {
    const r = readRoute();
    return r.section === section && (allowed as readonly string[]).includes(r.sub)
      ? (r.sub as T)
      : fallback;
  };
  const [sub, setSub] = useState<T>(fromHash);
  useEffect(() => {
    writeRoute(section, sub);
  }, [section, sub]);
  useEffect(() => {
    const onChange = () => setSub(fromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [section]);
  const set = useCallback((next: T) => setSub(next), []);
  return [sub, set];
}

/**
 * The id of the row open in a side panel, mirrored into `#/<section>/<id>` so a link can be
 * shared and a reload lands on the same panel; the stored value is the fallback.
 */
export function useDeepLinkedId(
  section: string,
  storageKey: string,
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [stored, setStored] = usePersistentState<string | null>(storageKey, null);
  const [id, setId] = useState<string | null>(() => {
    const r = readRoute();
    return r.section === section && r.sub ? r.sub : stored;
  });
  useEffect(() => {
    setStored(id);
    writeRoute(section, id ?? undefined);
  }, [section, id, setStored]);
  return [id, setId];
}
