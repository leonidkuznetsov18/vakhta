import { MaterialMode } from './codes.js';
import type { PlanMaterialFacts } from './plan-diff.js';

/** Recorded when the plan lists only "if needed" materials and none were used. */
export const NO_MATERIALS_USED = '—';

/** "Used as in the plan" (FR-051): every-cycle materials with their quantities, as one line. */
export function materialsAsPlanned(materials: readonly PlanMaterialFacts[]): string {
  const used = materials.filter((material) => material.mode === MaterialMode.EVERY_CYCLE);
  if (!used.length) return NO_MATERIALS_USED;
  return used
    .map((material) => `${material.name} ${material.quantity} ${material.unit}`)
    .join('; ');
}
