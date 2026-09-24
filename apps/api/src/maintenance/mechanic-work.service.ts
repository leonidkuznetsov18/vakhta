import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  equipment,
  isNull,
  loadWorkNotice,
  maintenancePlanOperations,
  maintenancePlanVersions,
  notInArray,
  or,
  sites,
  workOrderOperationResults,
  workOrderWaits,
  workOrders,
  type Database,
  type WorkNoticeContext,
} from '@vakhta/db';
import {
  FINAL_WORK_STATUSES,
  type MaterialsReadiness,
  type OperationResult,
  type WaitReason,
  type WorkStatus,
  type WorkType,
} from '@vakhta/domain';
import { DATABASE } from '../infra/database.module.js';
import { maintenanceStaff } from './lookups.js';
import { MAINTENANCE_OPTIONS, type MaintenanceOptions } from './maintenance-options.js';

const FINAL = [...FINAL_WORK_STATUSES];

export interface MechanicWorkRow {
  readonly id: string;
  readonly number: number;
  readonly type: WorkType;
  readonly status: WorkStatus;
  readonly title: string;
  readonly plannedOn: string | null;
  readonly code: string;
}

/** What the mechanic's work card in Telegram shows and which buttons it offers. */
export interface MechanicCard {
  readonly notice: WorkNoticeContext;
  readonly equipmentId: string;
  /** The manual the plan cites, sent first when the mechanic asks for the manual. */
  readonly sourceDocumentId: string | null;
  readonly leadId: string | null;
  readonly readiness: MaterialsReadiness;
  readonly answers: ReadonlyMap<number, OperationResult>;
  readonly waitingFor: WaitReason | null;
}

/** The mechanic's side of maintenance work in Telegram (spec 014, US5, US7). */
@Injectable()
export class MechanicWorkService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAINTENANCE_OPTIONS) private readonly options: MaintenanceOptions,
  ) {}

  /** A mechanic of a tenant with the maintenance module on; gates every bot entry (FR-001). */
  async isMaintenanceStaff(employeeId: string): Promise<boolean> {
    if (!this.options.enabled) return false;
    const rows = await maintenanceStaff(this.db, [employeeId]);
    return rows.length > 0;
  }

  /** Open work assigned to or led by the mechanic, repairs first. */
  async list(employeeId: string): Promise<MechanicWorkRow[]> {
    return this.db
      .select({
        id: workOrders.id,
        number: workOrders.number,
        type: workOrders.type,
        status: workOrders.status,
        title: workOrders.title,
        plannedOn: workOrders.plannedOn,
        code: equipment.code,
      })
      .from(workOrders)
      .innerJoin(equipment, eq(equipment.id, workOrders.equipmentId))
      .innerJoin(sites, eq(sites.id, equipment.siteId))
      .where(
        and(
          notInArray(workOrders.status, FINAL),
          or(
            eq(workOrders.assigneeEmployeeId, employeeId),
            eq(workOrders.leadEmployeeId, employeeId),
          ),
        ),
      )
      .orderBy(asc(workOrders.type), asc(workOrders.plannedOn), asc(workOrders.number));
  }

  async card(workOrderId: string): Promise<MechanicCard | null> {
    const notice = await loadWorkNotice(this.db, workOrderId);
    if (!notice) return null;
    const [order, answers, wait] = await Promise.all([
      this.db
        .select({
          equipmentId: workOrders.equipmentId,
          leadId: workOrders.leadEmployeeId,
          readiness: workOrders.readiness,
          sourceDocumentId: maintenancePlanVersions.sourceDocumentId,
        })
        .from(workOrders)
        .leftJoin(maintenancePlanVersions, eq(maintenancePlanVersions.id, workOrders.planVersionId))
        .where(eq(workOrders.id, workOrderId)),
      this.db
        .select({
          ordinal: maintenancePlanOperations.ordinal,
          result: workOrderOperationResults.result,
        })
        .from(workOrderOperationResults)
        .innerJoin(
          maintenancePlanOperations,
          eq(maintenancePlanOperations.id, workOrderOperationResults.operationId),
        )
        .where(eq(workOrderOperationResults.workOrderId, workOrderId)),
      this.db
        .select({ reason: workOrderWaits.reason })
        .from(workOrderWaits)
        .where(and(eq(workOrderWaits.workOrderId, workOrderId), isNull(workOrderWaits.endedAt))),
    ]);
    const [head] = order;
    if (!head) return null;
    return {
      notice,
      equipmentId: head.equipmentId,
      sourceDocumentId: head.sourceDocumentId,
      leadId: head.leadId,
      readiness: head.readiness,
      answers: new Map(answers.map((row) => [row.ordinal, row.result])),
      waitingFor: wait[0]?.reason ?? null,
    };
  }
}
