import { useSyncExternalStore } from 'react';

/**
 * A CSS media query read as a value. The browser already holds the answer, so it is subscribed to
 * rather than copied into state: the first render is already right, and a table does not start
 * life in its desktop shape and jump to the phone one a frame later.
 */
export function useMediaQuery(query: string): boolean {
  const list = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);
  return useSyncExternalStore(
    (onChange) => {
      const mql = list();
      mql?.addEventListener('change', onChange);
      return () => mql?.removeEventListener('change', onChange);
    },
    () => list()?.matches ?? false,
    () => false,
  );
}
