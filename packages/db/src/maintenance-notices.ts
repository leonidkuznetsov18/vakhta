import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  WorkType,
  formatLocal,
  type MaintenanceNoticeData,
  type MaterialMode,
  type WorkStatus,
} from '@vakhta/domain';
import type { DbOrTx } from './client.js';
import { authUser } from './schema/auth.js';
import { employees } from './schema/identity.js';
import {
  equipment,
  equipmentDocumentLinks,
  equipmentDocuments,
  maintenancePlanMaterials,
  maintenancePlanOperations,
  maintenancePlanVersions,
  maintenancePlans,
  workOrders,
} from './schema/maintenance.js';
import { orgUnits, responsibilityZones, sites } from './schema/org.js';

/** A work order with everything its Telegram notices show and whom they concern (spec 014). */
export interface WorkNoticeContext {
  readonly data: MaintenanceNoticeData;
  readonly status: WorkStatus;
  readonly type: WorkType;
  readonly assigneeId: string;
  readonly backupId: string | null;
  /** The unit master, an employee who can receive Telegram escalations (spec A-3). */
  readonly masterId: string | null;
  readonly timezone: string;
  /** The plan's own reminder days; null means the client parameters apply. */
  readonly reminderDays: readonly number[] | null;
  /** ISO business dates, for the handlers' own checks. */
  readonly plannedOn: string | null;
  readonly dueOn: string | null;
  readonly acceptedAt: Date | null;
  readonly ackDueAt: Date | null;
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY', as the bot shows dates. */
export function localDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

function localTime(instant: Date | null, timezone: string): string | null {
  return instant ? formatLocal(instant, timezone).local.slice(11, 16) : null;
}

async function loadHead(db: DbOrTx, workOrderId: string) {
  const reporterEmployee = sql<
    string | null
  >`(SELECT ${employees.fullName} FROM ${employees} WHERE ${employees.id}::text = ${workOrders.reportedBy})`;
  const reporterUser = sql<
    string | null
  >`(SELECT ${authUser.name} FROM ${authUser} WHERE ${authUser.id}::text = ${workOrders.reportedBy})`;
  const [row] = await db
    .select({
      order: workOrders,
      code: equipment.code,
      name: equipment.name,
      model: equipment.model,
      backupId: equipment.backupEmployeeId,
      unitName: orgUnits.name,
      masterId: orgUnits.masterEmployeeId,
      zoneName: responsibilityZones.name,
      timezone: sites.timezone,
      reminderDays: maintenancePlans.reminderDays,
      reporter: sql<string | null>`coalesce(${reporterEmployee}, ${reporterUser})`,
    })
    .from(workOrders)
    .leftJoin(maintenancePlans, eq(maintenancePlans.id, workOrders.planId))
    .innerJoin(equipment, eq(equipment.id, workOrders.equipmentId))
    .innerJoin(orgUnits, eq(orgUnits.id, equipment.orgUnitId))
    .innerJoin(sites, eq(sites.id, equipment.siteId))
    .leftJoin(responsibilityZones, eq(responsibilityZones.id, equipment.zoneId))
    .where(eq(workOrders.id, workOrderId))
    .limit(1);
  return row ?? null;
}

async function loadVersion(db: DbOrTx, versionId: string | null) {
  if (!versionId) return { version: null, operations: [], materials: [] };
  const [version] = await db
    .select({
      estimatedMinutes: maintenancePlanVersions.estimatedMinutes,
      requiresStop: maintenancePlanVersions.requiresStop,
      sourceReference: maintenancePlanVersions.sourceReference,
      sourceNote: maintenancePlanVersions.sourceNote,
      documentTitle: equipmentDocuments.title,
    })
    .from(maintenancePlanVersions)
    .leftJoin(
      equipmentDocuments,
      eq(equipmentDocuments.id, maintenancePlanVersions.sourceDocumentId),
    )
    .where(eq(maintenancePlanVersions.id, versionId));
  const operations = await db
    .select({
      text: maintenancePlanOperations.text,
      photoRequired: maintenancePlanOperations.photoRequired,
    })
    .from(maintenancePlanOperations)
    .where(eq(maintenancePlanOperations.versionId, versionId))
    .orderBy(asc(maintenancePlanOperations.ordinal));
  const materials = await db
    .select({
      name: maintenancePlanMaterials.name,
      quantity: maintenancePlanMaterials.quantity,
      unit: maintenancePlanMaterials.unit,
      mode: maintenancePlanMaterials.mode,
    })
    .from(maintenancePlanMaterials)
    .where(eq(maintenancePlanMaterials.versionId, versionId))
    .orderBy(asc(maintenancePlanMaterials.ordinal));
  return { version: version ?? null, operations, materials };
}

async function hasDocument(db: DbOrTx, equipmentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: equipmentDocumentLinks.id })
    .from(equipmentDocumentLinks)
    .where(
      and(
        eq(equipmentDocumentLinks.equipmentId, equipmentId),
        isNull(equipmentDocumentLinks.unlinkedAt),
      ),
    )
    .limit(1);
  return !!row;
}

function sourceLabel(
  version: {
    documentTitle: string | null;
    sourceReference: string | null;
    sourceNote: string | null;
  } | null,
): string | null {
  if (!version) return null;
  if (version.documentTitle)
    return [version.documentTitle, version.sourceReference].filter(Boolean).join(', ');
  return version.sourceNote;
}

/** Trims trailing zeros of a numeric quantity: 0.500 → 0.5, 2.000 → 2. */
function quantity(value: string): string {
  return String(Number(value));
}

export async function loadWorkNotice(
  db: DbOrTx,
  workOrderId: string,
): Promise<WorkNoticeContext | null> {
  const head = await loadHead(db, workOrderId);
  if (!head) return null;
  const { order } = head;
  const { version, operations, materials } = await loadVersion(db, order.planVersionId);
  const data: MaintenanceNoticeData = {
    workOrderId: order.id,
    number: order.number,
    type: order.type,
    priority: order.priority,
    title: order.title,
    equipmentCode: head.code,
    equipmentName: head.name,
    equipmentModel: head.model,
    location: [head.unitName, head.zoneName].filter(Boolean).join(' · '),
    plannedOn: order.plannedOn ? localDate(order.plannedOn) : null,
    estimatedMinutes: version?.estimatedMinutes ?? null,
    requiresStop: version?.requiresStop ?? null,
    operations,
    materials: materials.map((m) => ({
      ...m,
      quantity: quantity(m.quantity),
      mode: m.mode as MaterialMode,
    })),
    source: sourceLabel(version),
    hasDocument: await hasDocument(db, order.equipmentId),
    description: order.type === WorkType.EMERGENCY_REPAIR ? order.description : null,
    reporterName: head.reporter,
    reportedAtLocal: localTime(order.reportedAt, head.timezone),
    ackDueLocal: order.acceptedAt ? null : localTime(order.ackDueAt, head.timezone),
  };
  return {
    data,
    status: order.status,
    type: order.type,
    assigneeId: order.assigneeEmployeeId,
    backupId: head.backupId,
    masterId: head.masterId,
    timezone: head.timezone,
    reminderDays: head.reminderDays,
    plannedOn: order.plannedOn,
    dueOn: order.dueOn,
    acceptedAt: order.acceptedAt,
    ackDueAt: order.ackDueAt,
  };
}
