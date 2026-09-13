import type { CalendarItem } from './model';

export const calendarItemColors = {
  amber:
    'border-amber-200 bg-amber-100 text-amber-950 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900',
  indigo:
    'border-indigo-200 bg-indigo-100 text-indigo-950 hover:bg-indigo-200 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100 dark:hover:bg-indigo-900',
  info: 'border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900',
  warning:
    'border-amber-200 bg-amber-100 text-amber-950 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900',
  danger:
    'border-red-200 bg-red-50 text-red-950 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900',
  neutral: 'border-border bg-muted/40 text-foreground hover:bg-muted',
} satisfies Record<CalendarItem['tone'], string>;

/** One interaction treatment preserves item color across calendar densities and groupings. */
export const calendarInteraction =
  'hover:inset-ring-2 hover:inset-ring-foreground/70 focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-1 focus-visible:ring-offset-background active:inset-ring-2 active:inset-ring-foreground active:brightness-90 dark:active:brightness-125 active:not-aria-[haspopup]:translate-y-0 aria-pressed:inset-ring-2 aria-pressed:inset-ring-foreground aria-expanded:inset-ring-2 aria-expanded:inset-ring-foreground';

/**
 * Selectable row in a list (candidates, responses, items): hover, keyboard focus, press and a
 * selected state that does not rely on color alone (ring plus the caller's check icon).
 */
export const selectableRow =
  'border border-transparent rounded-md transition-colors hover:bg-muted hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:bg-muted active:brightness-95 dark:active:brightness-110 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:inset-ring-1 aria-pressed:inset-ring-primary aria-pressed:hover:bg-primary/15 disabled:opacity-60';
