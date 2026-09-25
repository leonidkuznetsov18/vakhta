import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  employees,
  eq,
  equipment,
  isNull,
  loadWorkNotice,
  maintenancePlanMaterials,
  maintenancePlanOperations,
  maintenancePlanVersions,
  maintenancePlans,
  sites,
  sql,
  workOrderOperationResults,
  workOrderReviews,
  workOrderWaits,
  workOrders,
  type Database,
  type Transaction,
} from '@vakhta/db';
import {
  MaterialsUsedKind,
  type MaterialsUsed,
  type RecordCompletionCommand,
  WorkReadinessCommand,
  type ReplanCommand,
  type ReviewCommand,
} from '@vakhta/contracts';
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
  materialsAsPlanned,
  materialsChanged,
  planInstants,
  planVersionDiff,
  nextCycle,
  transitionWork,
  type OperationResult,
  type WaitReason,
  type WorkSnapshot,
  type WorkTransition,
  MaintenanceTemplate,
} from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import { employeeActor, type Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { textOrNull } from '../common/text.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore, type EventSource } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { MediaService } from '../handover/media.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { assertMechanics } from './lookups.js';
import { MaintenanceScheduler } from './maintenance-scheduler.js';
import { versionContent } from './plan-versions.js';

type OrderRow = typeof workOrders.$inferSelect;
type AnswerValues = Omit<
  typeof workOrderOperationResults.$inferInsert,
  'id' | 'workOrderId' | 'operationId'
>;
const FINAL = [...FINAL_WORK_STATUSES];

/** How a paper record brings work to "in progress" before it is submitted. */
const ENTRY_ACTION: ReadonlyMap<WorkStatus, typeof WorkAction.START | typeof WorkAction.RESUME> =
  new Map([
    [WorkStatus.ASSIGNED, WorkAction.START],
    [WorkStatus.WAITING, WorkAction.RESUME],
  ]);
const ENTRY_EVENT = {
  [WorkAction.START]: 'WORK_ORDER_STARTED',
  [WorkAction.RESUME]: 'WORK_ORDER_RESUMED',
} as const;

/** Midday at the site: a paper record names a day, and midday keeps it on that business day. */
const PAPER_RECORD_TIME = '12:00';

function nextStatus(result: WorkTransition): WorkStatus {
  if (!result.ok) throw new DomainError(result.error, 409, 'Work transition refused');
  return result.next;
}

function paperRecordInstant(performedOn: string, timezone: string): Date {
  return planInstants(
    performedOn,
    { localStart: PAPER_RECORD_TIME, localEnd: PAPER_RECORD_TIME },
    timezone,
  ).planStartAt;
}
const MAINTENANCE_PHOTO_PURPOSE = 'maintenance';

export interface EmployeeCommand {
  readonly employeeId: string;
  readonly workOrderId: string;
  readonly now?: Date;
}

/** A Telegram photo attached to an operation answer (FR-051). */
export interface OperationPhoto {
  readonly fileId: string;
  readonly fileUniqueId: string;
  readonly sizeBytes?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

export interface AnswerCommand extends EmployeeCommand {
  readonly ordinal: number;
  readonly result: OperationResult;
  readonly reason?: string | null;
  readonly photo?: OperationPhoto | null;
}

export interface SubmitCommand extends EmployeeCommand {
  /** What was done on an emergency repair (FR-064). */
  readonly summary?: { readonly text: string; readonly cause?: string; readonly parts?: string };
  /** Materials confirmed on planned maintenance (FR-051). */
  readonly materialsUsed?: MaterialsUsed;
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
    private readonly media: MediaService,
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

  private async snapshot(tx: Transaction, order: OrderRow): Promise<WorkSnapshot> {
    const operations = order.planVersionId
      ? await tx
          .select({
            id: maintenancePlanOperations.id,
            photoRequired: maintenancePlanOperations.photoRequired,
          })
          .from(maintenancePlanOperations)
          .where(eq(maintenancePlanOperations.versionId, order.planVersionId))
      : [];
    const [material] = order.planVersionId
      ? await tx
          .select({ id: maintenancePlanMaterials.id })
          .from(maintenancePlanMaterials)
          .where(eq(maintenancePlanMaterials.versionId, order.planVersionId))
          .limit(1)
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
      materialsRequired: material !== undefined,
      materialsUsed: order.partsUsed,
      paperRecord: false,
    };
  }

  /** Applies a domain transition or refuses with its error code (FR-050, FR-053). */
  async transition(tx: Transaction, order: OrderRow, action: WorkAction): Promise<WorkStatus> {
    return nextStatus(transitionWork(await this.snapshot(tx, order), action));
  }

  /** Submission of a paper record: the same rules, without demanding photos (FR-054). */
  private async submitPaperRecord(tx: Transaction, order: OrderRow): Promise<WorkStatus> {
    const snapshot = { ...(await this.snapshot(tx, order)), paperRecord: true };
    return nextStatus(transitionWork(snapshot, WorkAction.SUBMIT));
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
      const media = cmd.photo
        ? await this.media.register(tx, {
            telegramFileId: cmd.photo.fileId,
            telegramFileUniqueId: cmd.photo.fileUniqueId,
            uploadedBy: cmd.employeeId,
            purpose: MAINTENANCE_PHOTO_PURPOSE,
            sizeBytes: cmd.photo.sizeBytes,
            width: cmd.photo.width,
            height: cmd.photo.height,
            now,
          })
        : null;
      const values = {
        result: cmd.result,
        reason: answerNeedsReason(cmd.result) ? (cmd.reason ?? null) : null,
        mediaObjectId: media?.id ?? null,
        answeredBy: cmd.employeeId,
        answeredAt: now,
      };
      await this.writeAnswer(tx, { workOrderId: order.id, operationId: operation.id, values });
      await this.save(tx, order, { updatedAt: now });
      return { ordinal: cmd.ordinal };
    });
  }

  /** The text recorded for the confirmed materials; "as planned" lists the every-cycle ones. */
  private async materialsText(
    tx: Transaction,
    order: OrderRow,
    used: MaterialsUsed | undefined | null,
  ): Promise<string | null> {
    if (!used) return null;
    if (used.kind === MaterialsUsedKind.OTHER) return used.text;
    const version = order.planVersionId ? await versionContent(tx, order.planVersionId) : null;
    return materialsAsPlanned(version?.materials ?? []);
  }

  /** Sends planned maintenance to review, or completes a repair (FR-051, FR-064). */
  async submit(cmd: SubmitCommand) {
    const now = cmd.now ?? new Date();
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, cmd.workOrderId);
      this.assertMine(order, cmd.employeeId);
      const materials = await this.materialsText(tx, order, cmd.materialsUsed);
      const withFacts = {
        ...order,
        ...(cmd.summary ? { summary: cmd.summary.text } : {}),
        ...(materials ? { partsUsed: materials } : {}),
      };
      const next = await this.transition(tx, withFacts, WorkAction.SUBMIT);
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
        ...(materials ? { partsUsed: materials } : {}),
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
      return this.answerReadiness(tx, order, {
        ready: cmd.ready,
        note: cmd.note ?? null,
        context: { actor: employeeActor(cmd.employeeId), source: 'TELEGRAM', now },
      });
    });
  }

  /** The master or chief mechanic answers for the materials from the panel (owner decision 2026-09-25). */
  async readinessFromPanel(id: string, cmd: WorkReadinessCommand, context: ChangeContext) {
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, id);
      return this.answerReadiness(tx, order, { ready: cmd.ready, note: cmd.note ?? null, context });
    });
  }

  private async answerReadiness(
    tx: Transaction,
    order: OrderRow,
    input: {
      readonly ready: boolean;
      readonly note: string | null;
      readonly context: ChangeContext;
    },
  ) {
    if (order.type !== WorkType.PLANNED_MAINTENANCE || order.status !== WorkStatus.ASSIGNED)
      throw new DomainError(
        'WORK_TRANSITION_NOT_ALLOWED',
        409,
        'Readiness is answered before the work starts',
      );
    const readiness = input.ready ? MaterialsReadiness.READY : MaterialsReadiness.MISSING;
    await this.save(tx, order, {
      readiness,
      readinessNote: input.ready ? null : input.note,
      updatedAt: input.context.now,
    });
    await this.event(tx, {
      type: 'MAINTENANCE_READINESS_REPORTED',
      order,
      context: input.context,
      payload: { readiness },
      comment: input.note,
    });
    if (!input.ready)
      await this.notifyMissing(tx, { order, note: input.note ?? '', version: order.version + 1 });
    return { readiness };
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
      template: MaintenanceTemplate.MAINTENANCE_READINESS,
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
    // FR-052: fixed-calendar dates the late work skipped stay on record as missed.
    if (cycle.missed.length)
      await this.event(tx, {
        type: 'MAINTENANCE_CYCLES_MISSED',
        order,
        context,
        payload: { planId: plan.plan.id, dates: cycle.missed },
        comment: cycle.missed.join(', '),
      });
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
      template: MaintenanceTemplate.MAINTENANCE_RETURNED,
      payload: (t) => ({
        text: format(t.maintenance.bot.returned, {
          number: input.order.number,
          comment: input.comment,
        }),
      }),
      dedupeKey: `maintenance-returned:${input.order.id}:${input.order.version}`,
    });
  }

  private assertVersion(order: OrderRow, expectedVersion: number): void {
    if (order.version !== expectedVersion)
      throw new DomainError('WORK_VERSION_CONFLICT', 409, 'Work has changed');
  }

  private async timezoneOf(tx: Transaction, equipmentId: string): Promise<string> {
    const [row] = await tx
      .select({ timezone: sites.timezone })
      .from(equipment)
      .innerJoin(sites, eq(sites.id, equipment.siteId))
      .where(eq(equipment.id, equipmentId));
    if (!row) throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
    return row.timezone;
  }

  /** The work's plan, its current version and the newer active one; refuses when none is newer. */
  private async newerVersion(tx: Transaction, order: OrderRow) {
    const [plan] = order.planId
      ? await tx.select().from(maintenancePlans).where(eq(maintenancePlans.id, order.planId))
      : [];
    const current = order.planVersionId ? await versionContent(tx, order.planVersionId) : null;
    const active = plan?.activeVersionId ? await versionContent(tx, plan.activeVersionId) : null;
    if (!plan || !current || !active || active.revision <= current.revision)
      throw new DomainError('PLAN_VERSION_CURRENT', 409, 'Work follows the active version');
    return { plan, current, active };
  }

  /**
   * Moves open planned work that has not started to the plan's active version after the diff
   * was shown (FR-023, AC-015). Changed materials ask the mechanic for readiness again.
   */
  async applyPlanVersion(id: string, expectedVersion: number, context: ChangeContext) {
    return this.db.transaction(async (tx) => {
      const order = await this.lock(tx, id);
      this.assertVersion(order, expectedVersion);
      if (order.type !== WorkType.PLANNED_MAINTENANCE || order.status !== WorkStatus.ASSIGNED)
        throw new DomainError('WORK_ALREADY_STARTED', 409, 'Only work not started can change');
      const { plan, current, active } = await this.newerVersion(tx, order);
      const resetReadiness = materialsChanged(planVersionDiff(current, active));
      await this.save(tx, order, {
        planVersionId: active.id,
        title: plan.title,
        ...(resetReadiness ? { readiness: MaterialsReadiness.UNKNOWN, readinessNote: null } : {}),
        updatedAt: context.now,
      });
      await this.event(tx, {
        type: 'WORK_ORDER_PLAN_APPLIED',
        order,
        context,
        payload: { fromRevision: current.revision, toRevision: active.revision },
      });
      await this.audit.record(tx, {
        actor: context.actor,
        action: 'work_order.apply_plan_version',
        objectType: 'work_order',
        objectId: id,
        before: { revision: current.revision },
        after: { revision: active.revision },
      });
      return { id, revision: active.revision };
    });
  }

  /**
   * Work done on paper, entered by the chief mechanic for the performer (FR-054, AC-039). It walks
   * the same transitions as the bot and goes to review; the order records both people.
   */
  async recordCompletion(id: string, cmd: RecordCompletionCommand, context: ChangeContext) {
    return this.db.transaction(async (tx) => {
      const locked = await this.lock(tx, id);
      const performedAt = await this.checkPaperRecord(tx, locked, { cmd, now: context.now });
      const order = await this.openForEntry(tx, locked, { context, performedAt });
      await this.writeRecordedAnswers(tx, order, { cmd, performedAt });
      const materials = await this.materialsText(tx, order, cmd.materialsUsed);
      const next = await this.submitPaperRecord(tx, { ...order, partsUsed: materials });
      await this.save(tx, order, {
        status: next,
        submittedAt: context.now,
        performedAt,
        performedByEmployeeId: cmd.performerId,
        enteredBy: context.actor.id ?? 'system',
        partsUsed: materials,
        updatedAt: context.now,
      });
      await this.event(tx, {
        type: 'WORK_ORDER_SUBMITTED',
        order,
        context,
        payload: { status: next, performerId: cmd.performerId, enteredOnBehalf: true },
      });
      await this.audit.record(tx, {
        actor: context.actor,
        action: 'work_order.record_completion',
        objectType: 'work_order',
        objectId: id,
        after: { performerId: cmd.performerId, performedOn: cmd.performedOn },
      });
      return { status: next };
    });
  }

  /** The record's preconditions; returns when the work was done (midday of the named day). */
  private async checkPaperRecord(
    tx: Transaction,
    order: OrderRow,
    input: { readonly cmd: RecordCompletionCommand; readonly now: Date },
  ): Promise<Date> {
    this.assertVersion(order, input.cmd.expectedVersion);
    if (order.type !== WorkType.PLANNED_MAINTENANCE)
      throw new DomainError('WORK_TRANSITION_NOT_ALLOWED', 409, 'Only planned maintenance');
    await assertMechanics(tx, [input.cmd.performerId]);
    const timezone = await this.timezoneOf(tx, order.equipmentId);
    const performedAt = paperRecordInstant(input.cmd.performedOn, timezone);
    if (performedAt > input.now)
      throw new DomainError('WORK_PERFORMED_IN_FUTURE', 422, 'The work date is in the future');
    return performedAt;
  }

  /** Brings not-started or paused work to "in progress" through the domain transitions. */
  private async openForEntry(
    tx: Transaction,
    order: OrderRow,
    input: { readonly context: ChangeContext; readonly performedAt: Date },
  ): Promise<OrderRow> {
    const action = ENTRY_ACTION.get(order.status);
    if (!action) return order;
    const next = await this.transition(tx, order, action);
    const { now } = input.context;
    if (action === WorkAction.RESUME)
      await tx
        .update(workOrderWaits)
        .set({ endedAt: now })
        .where(and(eq(workOrderWaits.workOrderId, order.id), isNull(workOrderWaits.endedAt)));
    const startedAt = order.startedAt ?? input.performedAt;
    await this.save(tx, order, { status: next, startedAt, updatedAt: now });
    await this.event(tx, { type: ENTRY_EVENT[action], order, context: input.context });
    return { ...order, status: next, startedAt, version: order.version + 1 };
  }

  private async writeRecordedAnswers(
    tx: Transaction,
    order: OrderRow,
    input: { readonly cmd: RecordCompletionCommand; readonly performedAt: Date },
  ): Promise<void> {
    const operations = order.planVersionId
      ? await tx
          .select({ id: maintenancePlanOperations.id, ordinal: maintenancePlanOperations.ordinal })
          .from(maintenancePlanOperations)
          .where(eq(maintenancePlanOperations.versionId, order.planVersionId))
      : [];
    const byOrdinal = new Map(operations.map((operation) => [operation.ordinal, operation.id]));
    const rows = input.cmd.answers.map((answer) => {
      const operationId = byOrdinal.get(answer.ordinal);
      if (!operationId)
        throw new DomainError('WORK_OPERATION_NOT_FOUND', 404, 'Operation not found');
      if (answerNeedsReason(answer.result) && !answer.reason?.trim())
        throw new DomainError('WORK_REASON_REQUIRED', 422, 'A reason is required');
      return {
        workOrderId: order.id,
        operationId,
        result: answer.result,
        reason: answerNeedsReason(answer.result) ? (answer.reason ?? null) : null,
        mediaObjectId: null,
        answeredBy: input.cmd.performerId,
        answeredAt: input.performedAt,
      };
    });
    // One statement for the whole checklist; a paper record replaces earlier answers but keeps
    // any photo the bot already stored.
    await tx
      .insert(workOrderOperationResults)
      .values(rows)
      .onConflictDoUpdate({
        target: [workOrderOperationResults.workOrderId, workOrderOperationResults.operationId],
        set: {
          result: sql`excluded.result`,
          reason: sql`excluded.reason`,
          answeredBy: sql`excluded.answered_by`,
          answeredAt: sql`excluded.answered_at`,
        },
      });
  }

  private async writeAnswer(
    tx: Transaction,
    input: {
      readonly workOrderId: string;
      readonly operationId: string;
      readonly values: AnswerValues;
    },
  ): Promise<void> {
    await tx
      .insert(workOrderOperationResults)
      .values({ workOrderId: input.workOrderId, operationId: input.operationId, ...input.values })
      .onConflictDoUpdate({
        target: [workOrderOperationResults.workOrderId, workOrderOperationResults.operationId],
        set: input.values,
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
