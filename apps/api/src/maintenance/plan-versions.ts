import {
  asc,
  eq,
  maintenancePlanMaterials,
  maintenancePlanOperations,
  maintenancePlanVersions,
  type DbOrTx,
} from '@vakhta/db';
import type { PlanVersionContent } from '@vakhta/domain';

export interface VersionContent extends PlanVersionContent {
  readonly id: string;
  readonly revision: number;
}

/** A published or draft plan version with its operations and materials in plan order. */
export async function versionContent(
  db: DbOrTx,
  versionId: string,
): Promise<VersionContent | null> {
  const [version] = await db
    .select()
    .from(maintenancePlanVersions)
    .where(eq(maintenancePlanVersions.id, versionId));
  if (!version) return null;
  const [operations, materials] = await Promise.all([
    db
      .select({
        text: maintenancePlanOperations.text,
        place: maintenancePlanOperations.place,
        photoRequired: maintenancePlanOperations.photoRequired,
      })
      .from(maintenancePlanOperations)
      .where(eq(maintenancePlanOperations.versionId, versionId))
      .orderBy(asc(maintenancePlanOperations.ordinal)),
    db
      .select()
      .from(maintenancePlanMaterials)
      .where(eq(maintenancePlanMaterials.versionId, versionId))
      .orderBy(asc(maintenancePlanMaterials.ordinal)),
  ]);
  return {
    id: version.id,
    revision: version.revision,
    intervalUnit: version.intervalUnit,
    intervalCount: version.intervalCount,
    anchorMode: version.anchorMode,
    estimatedMinutes: version.estimatedMinutes,
    requiresStop: version.requiresStop,
    operations,
    materials: materials.map((material) => ({
      kind: material.kind,
      name: material.name,
      article: material.article,
      quantity: Number(material.quantity),
      unit: material.unit,
      mode: material.mode,
    })),
  };
}
