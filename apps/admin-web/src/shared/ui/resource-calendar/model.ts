/** Prepared rendering data. Domain rules and date/time calculations belong to the caller. */
export interface CalendarItem {
  readonly id: string;
  readonly title: string;
  readonly time: string;
  readonly description: string;
  /** Empty when nothing needs saying; otherwise a short state such as "Not published". */
  readonly status: string;
  readonly tone: 'info' | 'warning' | 'danger' | 'neutral' | 'amber' | 'indigo';
  /** Rendered with a dashed border so an unpublished shift is recognizable without color. */
  readonly unpublished?: boolean;
  /** Shown for context only (for example another month's plan); selecting it opens details. */
  readonly readonly?: boolean;
  /** A rule the item breaks: blocking conflicts get a red mark, warnings an amber one. */
  readonly issue?: 'BLOCK' | 'WARN';
  readonly parts?: readonly { readonly id: string; readonly label: string }[];
}
export type CalendarNoteTone = 'danger' | 'ok' | 'muted';
export interface CalendarNote {
  readonly text: string;
  readonly tone: CalendarNoteTone;
}
export interface CalendarCell {
  readonly date: string;
  readonly label: string;
  readonly items: readonly CalendarItem[];
  readonly summary: string;
  /** Short state above the items, for example staffing coverage of the cell. */
  readonly note?: CalendarNote;
  readonly create: { readonly label: string; readonly disabledReason?: string } | null;
}
export interface CalendarResource {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Period totals of the row, for example shifts and planned hours. */
  readonly summary?: string;
  /** Row-level state, for example missing coverage in the period. */
  readonly badge?: CalendarNote;
  readonly cells: readonly CalendarCell[];
}
export interface CalendarDate {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  /** Column totals, for example day/night counts. */
  readonly summary?: string;
  readonly today?: boolean;
  /** The date belongs to another plan and is shown for context only. */
  readonly readonly?: boolean;
}
export interface CalendarViewModel {
  readonly label: string;
  readonly resourceLabel: string;
  readonly dates: readonly CalendarDate[];
  readonly resources: readonly CalendarResource[];
  readonly emptyLabel: string;
  readonly moreItemsLabel: string;
  /** Accessible names of item issues. */
  readonly issueLabels?: Readonly<Record<'BLOCK' | 'WARN', string>>;
}
export interface CalendarSelection {
  readonly resourceId: string;
  readonly date: string;
  readonly itemId?: string;
}
