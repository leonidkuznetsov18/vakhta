import { useShallow } from 'zustand/react/shallow';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Every piece of screen state the panel remembers: filters, open tabs, the expanded row, page
 * sizes, unsent drafts. One store rather than a `useState` per key, so a value written on one
 * section — the overview presetting the filters of the section it jumps to — is read by the next
 * one from the same place, without either of them touching storage by hand.
 *
 * Nothing secret goes through here: passwords and tokens stay in plain component state.
 */
interface UiState {
  readonly values: Readonly<Record<string, unknown>>;
  readonly set: (key: string, value: unknown) => void;
  readonly reset: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      values: {},
      set: (key, value) => set((s) => ({ values: { ...s.values, [key]: value } })),
      reset: () => set({ values: {} }),
    }),
    { name: 'vakhta.ui', storage: createJSONStorage(() => localStorage) },
  ),
);

/** Writes screen state from outside React: the overview presets the section it is about to open. */
export function setUiState(values: Readonly<Record<string, unknown>>): void {
  const { set } = useUiStore.getState();
  for (const [key, value] of Object.entries(values)) set(key, value);
}

export function uiState<T>(key: string): T | undefined {
  return useUiStore.getState().values[key] as T | undefined;
}

/**
 * `useState` that survives a reload and a jump between sections. The signature is `useState`'s, so
 * a screen reads like a screen; the value lives in the store.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const stored = useUiStore(useShallow((s) => s.values[key] as T | undefined));
  const value =
    stored !== undefined
      ? stored
      : typeof initial === 'function'
        ? (initial as () => T)()
        : initial;
  const set: Dispatch<SetStateAction<T>> = (next) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    useUiStore.getState().set(key, resolved);
  };
  return [value, set];
}

/** Clears every remembered value, for sign-out. */
export function clearPersistentState(): void {
  useUiStore.getState().reset();
  try {
    localStorage.removeItem('vakhta.ui');
  } catch {
    // Storage disabled: the store is empty either way.
  }
}
