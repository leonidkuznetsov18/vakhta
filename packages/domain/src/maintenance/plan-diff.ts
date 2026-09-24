import type { AnchorMode, IntervalUnit, MaterialKind, MaterialMode } from './codes.js';

/** What a work item's plan version fixes: the rule, the operations and the materials (FR-023). */
export interface PlanVersionContent {
  readonly intervalUnit: IntervalUnit;
  readonly intervalCount: number;
  readonly anchorMode: AnchorMode;
  readonly estimatedMinutes: number;
  readonly requiresStop: boolean;
  readonly operations: readonly PlanOperationFacts[];
  readonly materials: readonly PlanMaterialFacts[];
}

export interface PlanOperationFacts {
  readonly text: string;
  readonly place: string | null;
  readonly photoRequired: boolean;
}

export interface PlanMaterialFacts {
  readonly kind: MaterialKind;
  readonly name: string;
  readonly article: string | null;
  readonly quantity: number;
  readonly unit: string;
  readonly mode: MaterialMode;
}

/** Plan rule fields that can differ between two versions. */
export const PlanDiffField = {
  INTERVAL: 'INTERVAL',
  ANCHOR: 'ANCHOR',
  DURATION: 'DURATION',
  STOP: 'STOP',
} as const;
export type PlanDiffField = (typeof PlanDiffField)[keyof typeof PlanDiffField];
export const PLAN_DIFF_FIELDS = [
  PlanDiffField.INTERVAL,
  PlanDiffField.ANCHOR,
  PlanDiffField.DURATION,
  PlanDiffField.STOP,
] as const;

export interface ListDiff<T> {
  readonly added: readonly T[];
  readonly removed: readonly T[];
}

export interface PlanVersionDiff {
  readonly fields: readonly PlanDiffField[];
  readonly operations: ListDiff<PlanOperationFacts>;
  readonly materials: ListDiff<PlanMaterialFacts>;
}

const FIELD_CHANGED: Readonly<
  Record<PlanDiffField, (from: PlanVersionContent, to: PlanVersionContent) => boolean>
> = {
  INTERVAL: (from, to) =>
    from.intervalUnit !== to.intervalUnit || from.intervalCount !== to.intervalCount,
  ANCHOR: (from, to) => from.anchorMode !== to.anchorMode,
  DURATION: (from, to) => from.estimatedMinutes !== to.estimatedMinutes,
  STOP: (from, to) => from.requiresStop !== to.requiresStop,
};

function operationKey(operation: PlanOperationFacts): string {
  return JSON.stringify([operation.text, operation.place, operation.photoRequired]);
}

function materialKey(material: PlanMaterialFacts): string {
  return JSON.stringify([
    material.kind,
    material.name,
    material.article,
    material.quantity,
    material.unit,
    material.mode,
  ]);
}

/** Items of `a` left after removing one equal item of `b` for each item of `b` (a multiset). */
function missingFrom<T>(a: readonly T[], b: readonly T[], key: (item: T) => string): T[] {
  const counts = new Map<string, number>();
  for (const item of b) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  const left: T[] = [];
  for (const item of a) {
    const remaining = counts.get(key(item)) ?? 0;
    if (remaining > 0) counts.set(key(item), remaining - 1);
    else left.push(item);
  }
  return left;
}

function listDiff<T>(from: readonly T[], to: readonly T[], key: (item: T) => string): ListDiff<T> {
  return { added: missingFrom(to, from, key), removed: missingFrom(from, to, key) };
}

/**
 * What changes for an open work item if the newer plan version is applied to it (FR-023, AC-015).
 * An edited operation shows as one removed and one added; reordering alone is no difference.
 */
export function planVersionDiff(from: PlanVersionContent, to: PlanVersionContent): PlanVersionDiff {
  return {
    fields: PLAN_DIFF_FIELDS.filter((field) => FIELD_CHANGED[field](from, to)),
    operations: listDiff(from.operations, to.operations, operationKey),
    materials: listDiff(from.materials, to.materials, materialKey),
  };
}

/** Whether applying the version changes what the mechanic prepares (readiness must be asked again). */
export function materialsChanged(diff: PlanVersionDiff): boolean {
  return diff.materials.added.length > 0 || diff.materials.removed.length > 0;
}
