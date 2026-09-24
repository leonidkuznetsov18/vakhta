import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  employees,
  eq,
  equipment,
  isNull,
  loadWorkNotice,
  maintenancePlanOperations,
  maintenancePlanVersions,
  maintenancePlans,
  notInArray,
  or,
  sites,
  workOrderOperationResults,
  workOrderReviews,
  workOrderWaits,
  workOrders,
  type Database,
  type Transaction,
} from '@vakhta/db';
import type { ReplanCommand, ReviewCommand } from '@vakhta/contracts';
import {
  FINAL_WORK_STATUSES,
  MaterialsReadiness,
  PlanState,
  ReviewDecision,
  WorkAction,
  WorkStatus,
  WorkType,
  answerNeedsReason,
  businessDateOf,
  nextCycle,
  transitionWork,
  type OperationResult,
  type WaitReason,
} from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import { employeeActor, type Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { textOrNull } from '../common/text.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore, type EventSource } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { assertMechanics } from './lookups.js';
import { MaintenanceScheduler } from './maintenance-scheduler.js';

type OrderRow = typeof workOrders.$inferSelect;
const FINAL = [...FINAL_WORK_STATUSES];

export interface EmployeeCommand {
  readonly employeeId: string;
  readonly workOrderId: string;
  readonly now?: Date;
}

export interface AnswerCommand extends EmployeeCommand {
  readonly ordinal: number;
  readonly result: OperationResult;
  readonly reason?: string | null;
  readonly mediaObjectId?: string | null;
}

export interface ChangeContext {
  readonly actor: Actor;
  readonly source: EventSource;
  readonly now: Date;
}

/** Changes of a work order from the panel and from the mechanic's bot (spec 014, US4–US6). */
@Injectable()
export class WorkActionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    private readonly scheduler: MaintenanceScheduler,
  ) {}

  async lock(tx: Transaction, id: string): Promise<OrderRow> {
    const [order] = await tx.select().from(workOrders).where(eq(workOrders.id, id)).for('update');
    if (!order) throw new DomainError('WORK_NOT_FOUND', 404, 'Work order not found');
    return order;
  }

  /** The assignee or the lead may act on the order from the bot. */
  assertMine(order: OrderRow, employeeId: string): void {
    if (order.assigneeEmployeeId !== employeeId && order.leadEmployeeId !== employeeId)
      throw new DomainError('WORK_NOT_YOURS', 403, 'Work is assigned to another mechanic');
  }

  private async snapshot(tx: Transaction, order: OrderRow) {
    const operations = order.planVersionId
      ? await tx
          .select({
            id: maintenancePlanOperations.id,
            photoRequired: maintenancePlanOperations.photoRequired,
          })
          .from(maintenancePlanOperations)
          .where(eq(maintenancePlanOperations.versionId, order.planVersionId))
      : [];
    const answers = await tx
      .select({
        operationId: workOrderOperationResults.operationId,
        result: workOrderOperationResults.result,
        mediaObjectId: workOrderOperationResults.mediaObjectId,
      })
      .from(workOrderOperationResults)
      .where(eq(workOrderOperationResults.workOrderId, order.id));
    return {
      type: order.type,
      status: order.status,
      accepted: !!order.acceptedAt,
      operations,
      answers: answers.map((a) => ({
        operationId: a.operationId,
        result: a.result,
        hasPhoto: !!a.mediaObjectId,
      })),
      summary: order.summary,
    };
  }

  /** Applies a domain transition or refuses with its error code (FR-050, FR-053). */
  async transition(tx: Transaction, order: OrderRow, action: WorkAction): Promise<WorkStatus> {
    const result = transitionWork(await this.snapshot(tx, order), action);
    if (!result.ok) throw new DomainError(result.error, 409, 'Work transition refused');
    return result.next;
  }

  private async event(
    tx: Transaction,
    input: {
      type: string;
      order: OrderRow;
      context: ChangeContext;
      payload?: Record<string, unknown>;
      comment?: string | null;
    },
  ) {
    await this.events.append(tx, {
      type: input.type,
      source: input.context.source,
      actor: input.context.actor,
      occurredAt: input.context.now,
      incidentId: input.order.incidentId,
      comment: input.comment ?? null,
      payload: {
        workOrderId: input.order.id,
        equipmentId: input.order.equipmentId,
        ...input.payload,
      },
    });
  }

  private async save(
    tx: Transaction,
    order: OrderRow,
    changes: Partial<OrderRow> & { updatedAt: Date },
  ) {
    await tx
      .update(workOrders)
      .set({ ...changes, version: order.version + 1 })
      .where(eq(workOrders.id, order.id));
  }

  // ---------- bot ----------

  async myWork(employeeId: string) {
    return this.db
      .select({
        id: workOrders.id,
        number: workOrders.number,
        type: workOrders.type,
        status: workOrders.status,
        title: workOrders.title,
        plannedOn: workOrders.plannedOn,
        dueOn: workOrders.dueOn,
        code: equipment.code,
        timezone: sites.timezone,
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

  async start(cmd: EmployeeCommand) {
    const now = cmd.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, cmd.workOrderId);
      this.assertMine(order, cmd.employeeId);
      const next = await this.transition(tx, order, WorkAction.START);
      await this.save(tx, order, {
        status: next,
        startedAt: order.startedAt ?? now,
        updatedAt: now,
      });
      await this.event(tx, {
        type: 'WORK_ORDER_STARTED',
        order,
        context: { actor: employeeActor(cmd.employeeId), source: 'TELEGRAM', now },
      });
      return { status: next };
    });
  }

  /** Records one operation's answer; "not done" and "not applicable" carry a reason (TZ-M R05). */
  async answer(cmd: AnswerCommand) {
    const now = cmd.now ?? new Date();
    if (answerNeedsReason(cmd.result) && !cmd.reason?.trim())
      throw new DomainError('WORK_REASON_REQUIRED', 422, 'A reason is required');
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, cmd.workOrderId);
      this.assertMine(order, cmd.employeeId);
      if (order.status !== WorkStatus.IN_PROGRESS || !order.planVersionId)
        throw new DomainError('WORK_TRANSITION_NOT_ALLOWED', 409, 'Work is not in progress');
      const [operation] = await tx
        .select({ id: maintenancePlanOperations.id })
        .from(maintenancePlanOperations)
        .where(
          and(
            eq(maintenancePlanOperations.versionId, order.planVersionId),
            eq(maintenancePlanOperations.ordinal, cmd.ordinal),
          ),
        );
      if (!operation) throw new DomainError('WORK_OPERATION_NOT_FOUND', 404, 'Operation not found');
      const values = {
        result: cmd.result,
        reason: answerNeedsReason(cmd.result) ? (cmd.reason ?? null) : null,
        mediaObjectId: cmd.mediaObjectId ?? null,
        answeredBy: cmd.employeeId,
        answeredAt: now,
      };
      await tx
        .insert(workOrderOperationResults)
        .values({ workOrderId: order.id, operationId: operation.id, ...values })
        .onConflictDoUpdate({
          target: [workOrderOperationResults.workOrderId, workOrderOperationResults.operationId],
          set: values,
        });
      await this.save(tx, order, { updatedAt: now });
      return { ordinal: cmd.ordinal };
    });
  }

  /** Sends planned maintenance to review, or completes a repair (FR-051, FR-064). */
  async submit(
    cmd: EmployeeCommand & { readonly summary?: { text: string; cause?: string; parts?: string } },
  ) {
    const now = cmd.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, cmd.workOrderId);
      this.assertMine(order, cmd.employeeId);
      const withSummary = cmd.summary ? { ...order, summary: cmd.summary.text } : order;
      const next = await this.transition(tx, withSummary, WorkAction.SUBMIT);
      const completed = next === WorkStatus.COMPLETED;
      await this.save(tx, order, {
        status: next,
        submittedAt: now,
        performedAt: now,
        performedByEmployeeId: cmd.employeeId,
        completedAt: completed ? now : null,
        ...(cmd.summary
          ? {
              summary: cmd.summary.text,
              cause: cmd.summary.cause ?? null,
              partsUsed: cmd.summary.parts ?? null,
            }
          : {}),
        updatedAt: now,
      });
      await this.event(tx, {
        type: 'WORK_ORDER_SUBMITTED',
        order,
        context: { actor: employeeActor(cmd.employeeId), source: 'TELEGRAM', now },
        payload: { status: next },
      });
      return { status: next, number: order.number };
    });
  }

  async pause(
    cmd: EmployeeCommand & { readonly reason: WaitReason; readonly note?: string | null },
  ) {
    const now = cmd.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, cmd.workOrderId);
      this.assertMine(order, cmd.employeeId);
      const next = await this.transition(tx, order, WorkAction.WAIT);
      await tx.insert(workOrderWaits).values({
        workOrderId: order.id,
        reason: cmd.reason,
        note: cmd.note ?? null,
        startedAt: now,
      });
      await this.save(tx, order, { status: next, updatedAt: now });
      await this.event(tx, {
        type: 'WORK_ORDER_WAITING',
        order,
        context: { actor: employeeActor(cmd.employeeId), source: 'TELEGRAM', now },
        payload: { reason: cmd.reason },
        comment: cmd.note ?? null,
      });
      return { status: next };
    });
  }

  async resume(cmd: EmployeeCommand) {
    const now = cmd.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, cmd.workOrderId);
      this.assertMine(order, cmd.employeeId);
      const next = await this.transition(tx, order, WorkAction.RESUME);
      await tx
        .update(workOrderWaits)
        .set({ endedAt: now })
        .where(and(eq(workOrderWaits.workOrderId, order.id), isNull(workOrderWaits.endedAt)));
      await this.save(tx, order, { status: next, updatedAt: now });
      await this.event(tx, {
        type: 'WORK_ORDER_RESUMED',
        order,
        context: { actor: employeeActor(cmd.employeeId), source: 'TELEGRAM', now },
      });
      return { status: next };
    });
  }

  /** The mechanic's answer to a reminder; "missing" informs the unit master (AC-030). */
  async readiness(
    cmd: EmployeeCommand & { readonly ready: boolean; readonly note?: string | null },
  ) {
    const now = cmd.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, cmd.workOrderId);
      this.assertMine(order, cmd.employeeId);
      if (order.type !== WorkType.PLANNED_MAINTENANCE || order.status !== WorkStatus.ASSIGNED)
        throw new DomainError(
          'WORK_TRANSITION_NOT_ALLOWED',
          409,
          'Readiness is answered before the work starts',
        );
      const readiness = cmd.ready ? MaterialsReadiness.READY : MaterialsReadiness.MISSING;
      await this.save(tx, order, {
        readiness,
        readinessNote: cmd.ready ? null : (cmd.note ?? null),
        updatedAt: now,
      });
      await this.event(tx, {
        type: 'MAINTENANCE_READINESS_REPORTED',
        order,
        context: { actor: employeeActor(cmd.employeeId), source: 'TELEGRAM', now },
        payload: { readiness },
        comment: cmd.note ?? null,
      });
      if (!cmd.ready)
        await this.notifyMissing(tx, { order, note: cmd.note ?? '', version: order.version + 1 });
      return { readiness };
    });
  }

  private async notifyMissing(
    tx: Transaction,
    input: { order: OrderRow; note: string; version: number },
  ) {
    const notice = await loadWorkNotice(tx, input.order.id);
    if (!notice?.masterId) return;
    const [mechanic] = await tx
      .select({ name: employees.fullName })
      .from(employees)
      .where(eq(employees.id, input.order.assigneeEmployeeId));
    await this.notifications.enqueue(tx, {
      recipientType: 'EMPLOYEE',
      recipientId: notice.masterId,
      template: 'MAINTENANCE_READINESS',
      payload: (t) => ({
        text: format(t.maintenance.bot.readinessToMaster, {
          name: mechanic?.name ?? '',
          number: input.order.number,
          machine: format(t.maintenance.bot.machine, {
            code: notice.data.equipmentCode,
            name: notice.data.equipmentName,
          }),
          note: input.note,
        }),
      }),
      dedupeKey: `maintenance-readiness:${input.order.id}:${input.version}`,
    });
  }

  // ---------- panel ----------

  /** Accepting dates the next cycle from the performed day; returning sends it back (FR-052, AC-037). */
  async review(id: string, cmd: ReviewCommand, context: ChangeContext) {
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, id);
      const action =
        cmd.decision === ReviewDecision.ACCEPTED ? WorkAction.ACCEPT_REVIEW : WorkAction.RETURN;
      const next = await this.transition(tx, order, action);
      const [done] = await tx
        .select({ n: count() })
        .from(workOrderReviews)
        .where(eq(workOrderReviews.workOrderId, id));
      await tx.insert(workOrderReviews).values({
        workOrderId: id,
        iteration: (done?.n ?? 0) + 1,
        decision: cmd.decision,
        comment: textOrNull(cmd.comment),
        reviewer: context.actor.id ?? 'system',
        reviewedAt: context.now,
      });
      const accepted = next === WorkStatus.COMPLETED;
      await this.save(tx, order, {
        status: next,
        completedAt: accepted ? context.now : null,
        updatedAt: context.now,
      });
      await this.event(tx, {
        type: 'WORK_ORDER_REVIEWED',
        order,
        context,
        payload: { decision: cmd.decision },
        comment: cmd.comment ?? null,
      });
      if (accepted) await this.nextCycleWithin(tx, order, context);
      else await this.notifyReturned(tx, { order, comment: cmd.comment ?? '' });
      return { status: next };
    });
  }

  private async nextCycleWithin(tx: Transaction, order: OrderRow, context: ChangeContext) {
    if (!order.planId || !order.dueOn) return;
    const [plan] = await tx
      .select({
        plan: maintenancePlans,
        version: maintenancePlanVersions,
        timezone: sites.timezone,
      })
      .from(maintenancePlans)
      .innerJoin(
        maintenancePlanVersions,
        eq(maintenancePlanVersions.id, maintenancePlans.activeVersionId),
      )
      .innerJoin(equipment, eq(equipment.id, maintenancePlans.equipmentId))
      .innerJoin(sites, eq(sites.id, equipment.siteId))
      .where(eq(maintenancePlans.id, order.planId));
    if (plan?.plan.state !== PlanState.ACTIVE || !plan.version.assigneeEmployeeId) return;
    const performedOn = businessDateOf(order.performedAt ?? context.now, plan.timezone);
    const cycle = nextCycle(plan.version, order.dueOn, performedOn);
    await this.scheduler.createCycleWithin(
      tx,
      {
        planId: plan.plan.id,
        versionId: plan.version.id,
        equipmentId: order.equipmentId,
        title: plan.plan.title,
        assigneeId: order.assigneeEmployeeId,
        dueOn: cycle.nextDueOn,
      },
      context,
    );
  }

  private async notifyReturned(tx: Transaction, input: { order: OrderRow; comment: string }) {
    await this.notifications.enqueue(tx, {
      recipientType: 'EMPLOYEE',
      recipientId: input.order.assigneeEmployeeId,
      template: 'MAINTENANCE_RETURNED',
      payload: (t) => ({
        text: format(t.maintenance.bot.returned, {
          number: input.order.number,
          comment: input.comment,
        }),
      }),
      dedupeKey: `maintenance-returned:${input.order.id}:${input.order.version}`,
    });
  }

  /** Moves the planned date; the due date and any overdue fact stay (FR-034). */
  async replan(id: string, cmd: ReplanCommand, context: ChangeContext) {
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, id);
      if (order.type !== WorkType.PLANNED_MAINTENANCE || FINAL.includes(order.status))
        throw new DomainError(
          'WORK_TRANSITION_NOT_ALLOWED',
          409,
          'Only open planned maintenance can be moved',
        );
      await this.save(tx, order, { plannedOn: cmd.plannedOn, updatedAt: context.now });
      await this.event(tx, {
        type: 'WORK_ORDER_REPLANNED',
        order,
        context,
        payload: { from: order.plannedOn, to: cmd.plannedOn },
        comment: cmd.reason,
      });
      await this.scheduler.planRemindersWithin(tx, {
        workOrderId: id,
        now: context.now,
        noticeNow: false,
      });
      await this.scheduler.notifyReplannedWithin(tx, id);
      return { id };
    });
  }

  async cancel(id: string, reason: string, context: ChangeContext) {
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, id);
      const next = await this.transition(tx, order, WorkAction.CANCEL);
      await this.save(tx, order, {
        status: next,
        cancelledAt: context.now,
        cancelReason: reason,
        updatedAt: context.now,
      });
      await this.event(tx, { type: 'WORK_ORDER_CANCELLED', order, context, comment: reason });
      await this.audit.record(tx, {
        actor: context.actor,
        action: 'work_order.cancel',
        objectType: 'work_order',
        objectId: id,
        reason,
      });
      return { id };
    });
  }

  async reassign(
    id: string,
    input: { employeeId: string; reason: string },
    context: ChangeContext,
  ) {
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, id);
      if (FINAL.includes(order.status))
        throw new DomainError('WORK_TRANSITION_NOT_ALLOWED', 409, 'Work is closed');
      await assertMechanics(tx, [input.employeeId]);
      await this.save(tx, order, {
        assigneeEmployeeId: input.employeeId,
        leadEmployeeId: null,
        updatedAt: context.now,
      });
      await this.event(tx, {
        type: 'WORK_ORDER_REASSIGNED',
        order,
        context,
        payload: { employeeId: input.employeeId },
        comment: input.reason,
      });
      if (order.type === WorkType.PLANNED_MAINTENANCE)
        await this.scheduler.notifyAssignedWithin(tx, id);
      return { id, type: order.type };
    });
  }
}
