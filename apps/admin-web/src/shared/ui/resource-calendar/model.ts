/** Prepared rendering data. Domain rules and date/time calculations belong to the caller. */
export interface CalendarItem {
  readonly id: string;
  readonly title: string;
  readonly time: string;
  readonly description: string;
  readonly status: string;
  readonly tone: 'info' | 'warning' | 'danger' | 'neutral' | 'amber' | 'indigo';
  readonly parts?: readonly { readonly id: string; readonly label: string }[];
}
export interface CalendarCell {
  readonly date: string;
  readonly label: string;
  readonly items: readonly CalendarItem[];
  readonly summary: string;
  readonly create: { readonly label: string; readonly disabledReason?: string } | null;
}
export interface CalendarResource {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cells: readonly CalendarCell[];
}
export interface CalendarViewModel {
  readonly label: string;
  readonly resourceLabel: string;
  readonly dates: readonly {
    readonly id: string;
    readonly label: string;
    readonly shortLabel: string;
  }[];
  readonly resources: readonly CalendarResource[];
  readonly emptyLabel: string;
  readonly moreItemsLabel: string;
}
export interface CalendarSelection {
  readonly resourceId: string;
  readonly date: string;
  readonly itemId?: string;
}
