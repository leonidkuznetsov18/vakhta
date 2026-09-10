import { useSyncExternalStore } from 'react';

/**
 * One minute hand for the whole panel.
 *
 * Relative times ("in 12 min", "overdue by 3 h") go stale on a screen left open on a wall, so
 * something has to move them along. One shared ticker rather than a timer per cell: an operations
 * table draws a deadline in every row, and fifty intervals redrawing fifty cells a minute apart is
 * both wasteful and visibly uneven.
 */
let now = new Date();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  timer ??= setInterval(() => {
    now = new Date();
    for (const listener of listeners) listener();
  }, 60_000);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current minute, re-read whenever it changes. */
export function useNow(): Date {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  );
}
