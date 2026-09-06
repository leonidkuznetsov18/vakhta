import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

const PREFIX = 'vakhta.ui.';

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: the value simply lives until the page reloads.
  }
}

/**
 * `useState` that survives a page reload: filters, open tabs, expanded rows, page sizes and
 * unsent form drafts stay where the user left them. Values are JSON in localStorage under a
 * per-page key; nothing secret goes through here (passwords are plain state).
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = read<T>(key);
    if (stored !== undefined) return stored;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    write(key, value);
  }, [key, value]);
  return [value, setValue];
}

/** Clears every persisted UI value, for sign-out. */
export function clearPersistentState(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // Nothing to clear.
  }
}
