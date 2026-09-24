/**
 * Prototype model for spec 015: employments, assignments and resolved pay components as the card
 * shows them. Pure types and functions; the production change moves the types to
 * `@vakhta/contracts` and the resolution to `packages/domain`.
 */

export const ComponentKey = {
  BASE_SALARY: 'BASE_SALARY',
  HOURLY_RATE: 'HOURLY_RATE',
  LEVEL_SUPPLEMENT: 'LEVEL_SUPPLEMENT',
  POINT_PRICE: 'POINT_PRICE',
  NIGHT_COEFFICIENT: 'NIGHT_COEFFICIENT',
  LEAD_SUPPLEMENT: 'LEAD_SUPPLEMENT',
} as const;
export type ComponentKey = (typeof ComponentKey)[keyof typeof ComponentKey];

export const TermMode = {
  INHERIT: 'INHERIT',
  REPLACE: 'REPLACE',
  ADD: 'ADD',
  DISABLE: 'DISABLE',
} as const;
export type TermMode = (typeof TermMode)[keyof typeof TermMode];

/** Where a resolved value came from (CFG-07): the card names it next to every amount. */
export const TermSource = {
  GROUP_LEVEL: 'GROUP_LEVEL',
  GROUP_POSITION: 'GROUP_POSITION',
  GROUP: 'GROUP',
  NODE: 'NODE',
  CENTER: 'CENTER',
  PERSONAL: 'PERSONAL',
  DISABLED: 'DISABLED',
  MISSING: 'MISSING',
} as const;
export type TermSource = (typeof TermSource)[keyof typeof TermSource];

export const TermStatus = { DRAFT: 'DRAFT', APPROVED: 'APPROVED' } as const;
export type TermStatus = (typeof TermStatus)[keyof typeof TermStatus];

export const Unit = {
  PER_MONTH: 'PER_MONTH',
  PER_HOUR: 'PER_HOUR',
  PER_POINT: 'PER_POINT',
  COEFFICIENT: 'COEFFICIENT',
} as const;
export type Unit = (typeof Unit)[keyof typeof Unit];

export const AssignmentState = {
  ACTIVE: 'ACTIVE',
  SCHEDULED: 'SCHEDULED',
  ENDED: 'ENDED',
} as const;
export type AssignmentState = (typeof AssignmentState)[keyof typeof AssignmentState];

export interface Employment {
  readonly id: string;
  readonly employer: string;
  readonly contract: string;
  readonly currency: string;
  readonly validFrom: string;
  readonly validTo: string | null;
}

export interface Level {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly supplementPerHour: number;
}

export interface Assignment {
  readonly id: string;
  readonly employmentId: string;
  readonly nodePath: readonly string[];
  readonly position: string;
  readonly level: Level | null;
  readonly levelScale: readonly Level[];
  readonly payGroup: { readonly name: string; readonly version: number } | null;
  readonly share: number;
  readonly fte: number;
  readonly isPrimary: boolean;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly state: AssignmentState;
}

/** One row of the components table: group value, personal layer, what applies. */
export interface ResolvedComponent {
  readonly key: ComponentKey;
  readonly unit: Unit;
  readonly groupValue: number | null;
  readonly groupSource: TermSource;
  readonly groupSourceLabel: string;
  readonly personal: {
    readonly mode: TermMode;
    readonly value: number | null;
    readonly validFrom: string;
    readonly validTo: string | null;
    readonly status: TermStatus;
    readonly reason: string;
  } | null;
  readonly applied: number | null;
  readonly appliedSource: TermSource;
  /** Resolution path, root first (CFG-07). */
  readonly path: readonly string[];
}

export interface Adjustment {
  readonly id: string;
  readonly kind: string;
  readonly amount: number;
  readonly sourcePeriod: string;
  readonly period: string;
  readonly reason: string;
  readonly status: TermStatus;
  readonly author: string;
}

export interface HistoryEntry {
  readonly id: string;
  readonly at: string;
  readonly author: string;
  readonly text: string;
}

export interface MonthPreview {
  readonly month: string;
  readonly plannedHours: number;
  readonly base: number;
  readonly levelSupplement: number;
  readonly adjustments: number;
  readonly total: number;
}

export interface PayTerms {
  readonly employments: readonly Employment[];
  readonly assignments: readonly Assignment[];
  readonly components: ReadonlyMap<string, readonly ResolvedComponent[]>;
  readonly adjustments: readonly Adjustment[];
  readonly history: readonly HistoryEntry[];
}

/** Management preview only: base prorated by the assignment share, supplement by planned hours. */
export function monthPreview(
  components: readonly ResolvedComponent[],
  adjustments: readonly Adjustment[],
  input: { readonly month: string; readonly plannedHours: number; readonly share: number },
): MonthPreview {
  const applied = (key: ComponentKey) => components.find((row) => row.key === key)?.applied ?? 0;
  const base = Math.round((applied(ComponentKey.BASE_SALARY) * input.share) / 100);
  const levelSupplement = Math.round(applied(ComponentKey.LEVEL_SUPPLEMENT) * input.plannedHours);
  const extra = adjustments
    .filter((row) => row.period === input.month)
    .reduce((sum, row) => sum + row.amount, 0);
  return {
    month: input.month,
    plannedHours: input.plannedHours,
    base,
    levelSupplement,
    adjustments: extra,
    total: base + levelSupplement + extra,
  };
}
