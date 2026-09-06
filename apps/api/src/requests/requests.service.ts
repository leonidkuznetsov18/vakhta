import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  employeePositions,
  employees,
  eq,
  gte,
  idempotencyKeys,
  inArray,
  isNull,
  lte,
  ne,
  or,
  overtimeApprovals,
  requestDecisions,
  requests,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  shiftTemplates,
  sites,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  PERIOD_TYPES,
  SCHEDULE_AFFECTING,
  applyDecision,
  canDecideStep,
  isRequestOpen,
  routeFor,
  stepDeadline,
  type RequestType,
} from '@vakhta/domain';
import type {
  AssignmentInput,
  CorrectionProposalCommand,
  CreateRequestCommand,
  DecideOvertimeCommand,
  DecideRequestCommand,
  OvertimeView,
  RequestDecisionView,
  RequestDetailView,
  RequestView,
  RequestsQuery,
} from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore, type EventSource } from '../events/event-store.js';
import { MediaService } from '../handover/media.service.js';
import { DATABASE } from '../infra/database.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ScheduleService } from '../scheduling/schedule.service.js';
import { CorrectionsService } from './corrections.service.js';
import { RequestChanges } from './request-changes.js';

/** Хто вирішує: ролі панелі або працівник (другий у обміні). */
export interface Decider extends Actor {
  readonly roles: readonly string[];
  readonly employeeId?: string | null;
}

type RequestRow = typeof requests.$inferSelect;
type AssignmentRow = typeof shiftAssignments.$inferSelect;

const OPEN = ['SUBMITTED', 'IN_REVIEW'] as const;

/**
 * Звернення працівника (ТЗ 8, FR-REQ-01..04): маршрут за матрицею ТЗ 2.1, рішення з коментарем,
 * схвалення змін графіка як нова версія (FR-REQ-04), корекції як компенсуючі події (FR-COR-03),
 * медичні документи лише для HR (FR-REQ-02).
 */
@Injectable()
export class RequestsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    private readonly schedule: ScheduleService,
    private readonly media: MediaService,
    private readonly corrections: CorrectionsService,
    private readonly changes: RequestChanges,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Працівник                                                           */
  /* ------------------------------------------------------------------ */

  async create(
    employeeId: string,
    cmd: CreateRequestCommand,
    actor: Actor,
    source: EventSource = 'TELEGRAM',
    now: Date = new Date(),
  ): Promise<RequestView> {
    const replay = await this.replay(`request:${employeeId}`, cmd.idempotencyKey);
    if (replay) return this.view(replay);
    let mediaId: string | null = null;
    const id = await this.db.transaction(async (tx) => {
      const base = await this.validate(tx, employeeId, cmd, now);
      let medicalMediaId: string | null = null;
      if (cmd.type === 'SICK' && cmd.medicalPhoto) {
        const media = await this.media.register(tx, {
          telegramFileId: cmd.medicalPhoto.telegramFileId,
          telegramFileUniqueId: cmd.medicalPhoto.telegramFileUniqueId,
          uploadedBy: employeeId,
          purpose: 'medical',
          now,
        });
        medicalMediaId = media.id;
        mediaId = media.id;
      }
      const steps = routeFor(cmd.type);
      const [row] = await tx
        .insert(requests)
        .values({
          type: cmd.type,
          employeeId,
          status: 'SUBMITTED',
          currentStep: 0,
          ...base,
          comment: 'comment' in cmd ? (cmd.comment ?? null) : null,
          medicalMediaId,
          submittedAt: now,
          stepDeadlineAt: steps[0] ? stepDeadline(steps[0], now) : null,
          createdBy: actor.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new Error('requests: insert не повернув рядок');
      await this.events.append(tx, {
        type: 'REQUEST_SUBMITTED',
        source,
        actor,
        occurredAt: now,
        employeeId,
        shiftSessionId: row.shiftSessionId,
        payload: {
          requestId: row.id,
          type: row.type,
          periodFrom: row.periodFrom,
          periodTo: row.periodTo,
          assignmentId: row.assignmentId,
        },
      });
      if (cmd.type === 'SWAP') {
        await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: cmd.counterpartEmployeeId,
          template: 'REQUEST_COUNTERPART',
          payload: (t) => ({
            text: t.requests.counterpartAsk,
            buttons: [
              [
                { text: t.requests.counterpartYes, callbackData: `rq:ok:${row.id}` },
                { text: t.requests.counterpartNo, callbackData: `rq:no:${row.id}` },
              ],
            ],
          }),
          dedupeKey: `request-counterpart:${row.id}`,
        });
      }
      await tx.insert(idempotencyKeys).values({
        scope: `request:${employeeId}`,
        key: cmd.idempotencyKey,
        requestHash: cmd.type,
        response: { requestId: row.id },
      });
      return row.id;
    });
    if (mediaId) await this.media.enqueue(mediaId);
    this.changes.publish({ requestId: id, status: 'SUBMITTED', at: now.toISOString() });
    return this.view(id);
  }

  async cancel(
    employeeId: string,
    id: string,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<RequestView> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(requests).where(eq(requests.id, id)).for('update');
      if (!row || row.employeeId !== employeeId)
        throw new DomainError('REQUEST_NOT_FOUND', 404, 'Звернення не знайдено');
      if (!isRequestOpen(row.status))
        throw new DomainError('REQUEST_CLOSED', 409, 'Звернення вже закрите');
      await tx
        .update(requests)
        .set({ status: 'CANCELLED', decidedAt: now, updatedAt: now })
        .where(eq(requests.id, id));
      await this.events.append(tx, {
        type: 'REQUEST_CANCELLED',
        source: 'TELEGRAM',
        actor,
        occurredAt: now,
        employeeId,
        payload: { requestId: id },
      });
    });
    this.changes.publish({ requestId: id, status: 'CANCELLED', at: now.toISOString() });
    return this.view(id);
  }

  async mine(employeeId: string, limit = 10): Promise<RequestView[]> {
    const rows = await this.baseQuery()
      .where(eq(requests.employeeId, employeeId))
      .orderBy(desc(requests.submittedAt))
      .limit(limit);
    return rows.map((r) => this.toView(r, new Date(), true));
  }

  /** Обміни, що чекають згоди цього працівника (крок COUNTERPART). */
  async pendingCounterpart(employeeId: string): Promise<RequestView[]> {
    const rows = await this.baseQuery()
      .where(
        and(
          eq(requests.counterpartEmployeeId, employeeId),
          eq(requests.type, 'SWAP'),
          eq(requests.status, 'SUBMITTED'),
          eq(requests.currentStep, 0),
        ),
      )
      .orderBy(asc(requests.submittedAt));
    return rows.map((r) => this.toView(r, new Date(), false));
  }

  /* ------------------------------------------------------------------ */
  /* Рішення                                                             */
  /* ------------------------------------------------------------------ */

  async decide(
    id: string,
    cmd: DecideRequestCommand,
    decider: Decider,
    now: Date = new Date(),
  ): Promise<RequestView> {
    const outcome = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(requests).where(eq(requests.id, id)).for('update');
      if (!row) throw new DomainError('REQUEST_NOT_FOUND', 404, 'Звернення не знайдено');
      if (!isRequestOpen(row.status))
        throw new DomainError('REQUEST_CLOSED', 409, 'Звернення вже закрите');
      const steps = routeFor(row.type);
      const step = steps[row.currentStep];
      if (!step) throw new DomainError('REQUEST_ROUTE_BROKEN', 409, 'Маршрут звернення порушено');
      if (
        !canDecideStep(
          step,
          { roles: decider.roles, employeeId: decider.employeeId ?? null },
          row.counterpartEmployeeId,
        )
      ) {
        throw new DomainError('REQUEST_NOT_YOUR_STEP', 403, 'Цей крок вирішує інша роль');
      }
      // Апеляцію розглядає не автор оскаржуваного рішення (ТЗ 7.7).
      if (row.type === 'APPEAL' && decider.id && row.payload.text === decider.id) {
        throw new DomainError('APPEAL_SAME_AUTHOR', 403, 'Апеляцію розглядає інший керівник');
      }

      await tx.insert(requestDecisions).values({
        requestId: id,
        step: row.currentStep,
        stepKey: step.key,
        actorType: decider.type,
        actorId: decider.id,
        actingRole: decider.role,
        decision: cmd.decision,
        comment: cmd.comment,
        at: now,
      });
      const progress = applyDecision(
        row.type,
        { currentStep: row.currentStep, status: row.status },
        cmd.decision,
      );
      const nextStep = steps[progress.currentStep];
      const finalApproved = progress.status === 'APPROVED';
      const patch: Partial<typeof requests.$inferInsert> = {
        status: progress.status,
        currentStep: progress.currentStep,
        updatedAt: now,
        stepDeadlineAt:
          progress.status === 'IN_REVIEW' && nextStep ? stepDeadline(nextStep, now) : null,
        decidedAt: isRequestOpen(progress.status) ? null : now,
      };
      if (
        cmd.approvedMinutes !== undefined &&
        (row.type === 'LATE' || row.type === 'EARLY_LEAVE')
      ) {
        patch.payload = { ...row.payload, approvedMinutes: cmd.approvedMinutes };
      }

      if (finalApproved) {
        if (SCHEDULE_AFFECTING.includes(row.type)) {
          const versionId = await this.applyScheduleEffect(tx, row, decider, now);
          patch.resultVersionId = versionId;
        }
        if (row.type === 'CORRECTION') {
          const proposal = cmd.proposal ?? row.payload.proposal;
          if (!proposal)
            throw new DomainError(
              'CORRECTION_PROPOSAL_REQUIRED',
              422,
              'Для корекції потрібна пропозиція часу або стану',
            );
          if (!row.shiftSessionId)
            throw new DomainError('SHIFT_NOT_FOUND', 404, 'Зміну не знайдено');
          const result = await this.corrections.applyWithin(
            tx,
            row.shiftSessionId,
            {
              proposal: normalizeProposal(proposal),
              reasonCode: row.payload.reasonCode ?? 'OTHER',
              comment: cmd.comment,
              requestId: row.id,
            },
            decider,
            now,
          );
          patch.compensatingEventId = result.compensatingEventId;
        }
      }
      await tx.update(requests).set(patch).where(eq(requests.id, id));
      await this.events.append(tx, {
        type: 'REQUEST_DECIDED',
        source: decider.type === 'EMPLOYEE' ? 'TELEGRAM' : 'WEB',
        actor: decider,
        occurredAt: now,
        employeeId: row.employeeId,
        shiftSessionId: row.shiftSessionId,
        comment: cmd.comment,
        payload: {
          requestId: id,
          type: row.type,
          step: step.key,
          decision: cmd.decision,
          status: progress.status,
          resultVersionId: patch.resultVersionId ?? null,
        },
      });
      if (decider.type === 'WEB_USER') {
        await this.audit.record(tx, {
          actor: decider,
          action: `request.${cmd.decision.toLowerCase()}`,
          objectType: 'request',
          objectId: id,
          before: { status: row.status, step: row.currentStep },
          after: { status: progress.status, step: progress.currentStep },
          reason: cmd.comment,
        });
      }
      if (!isRequestOpen(progress.status)) {
        await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: row.employeeId,
          template: 'REQUEST_DECIDED',
          payload: (t) => ({
            text: format(t.requests.decidedNotification, {
              type: t.requests.types[row.type],
              decision:
                progress.status === 'APPROVED'
                  ? t.requests.approvedShort
                  : t.requests.rejectedShort,
              comment: cmd.comment,
            }),
          }),
          dedupeKey: `request-decided:${id}:${progress.status}`,
        });
      }
      return progress.status;
    });
    this.changes.publish({ requestId: id, status: outcome, at: now.toISOString() });
    return this.view(id);
  }

  /* ------------------------------------------------------------------ */
  /* Переробка (FR-TIME-06, AC-14)                                       */
  /* ------------------------------------------------------------------ */

  async overtime(scope: 'pending' | 'all' = 'pending'): Promise<OvertimeView[]> {
    const rows = await this.db
      .select({
        summary: shiftSummaries,
        session: shiftSessions,
        name: employees.fullName,
        approval: overtimeApprovals,
      })
      .from(shiftSummaries)
      .innerJoin(shiftSessions, eq(shiftSummaries.shiftSessionId, shiftSessions.id))
      .innerJoin(employees, eq(shiftSummaries.employeeId, employees.id))
      .leftJoin(
        overtimeApprovals,
        eq(overtimeApprovals.shiftSessionId, shiftSummaries.shiftSessionId),
      )
      .where(
        scope === 'pending'
          ? and(eq(shiftSummaries.overtimePending, true), isNull(overtimeApprovals.id))
          : eq(shiftSummaries.overtimePending, true),
      )
      .orderBy(desc(shiftSessions.endedAt));
    return rows.map((r) => ({
      id: r.approval?.id ?? null,
      shiftSessionId: r.session.id,
      employeeId: r.session.employeeId,
      employeeName: r.name,
      businessDate: r.session.businessDate,
      minutes: r.summary.overtimeMinutes,
      status: r.approval?.status ?? 'PENDING',
      decidedBy: r.approval?.decidedBy ?? null,
      comment: r.approval?.comment ?? null,
      decidedAt: r.approval?.decidedAt?.toISOString() ?? null,
    }));
  }

  async decideOvertime(
    sessionId: string,
    cmd: DecideOvertimeCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<OvertimeView> {
    await this.db.transaction(async (tx) => {
      const [summary] = await tx
        .select()
        .from(shiftSummaries)
        .where(eq(shiftSummaries.shiftSessionId, sessionId))
        .limit(1);
      if (!summary) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Підсумок зміни не знайдено');
      const [existing] = await tx
        .select()
        .from(overtimeApprovals)
        .where(eq(overtimeApprovals.shiftSessionId, sessionId))
        .limit(1);
      if (existing)
        throw new DomainError('OVERTIME_ALREADY_DECIDED', 409, 'Рішення по переробці вже є');
      await tx.insert(overtimeApprovals).values({
        shiftSessionId: sessionId,
        minutes: summary.overtimeMinutes,
        status: cmd.decision,
        decidedBy: actor.id,
        comment: cmd.comment,
        decidedAt: now,
        createdAt: now,
      });
      await this.events.append(tx, {
        type: 'OVERTIME_DECIDED',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId: summary.employeeId,
        shiftSessionId: sessionId,
        comment: cmd.comment,
        payload: { minutes: summary.overtimeMinutes, decision: cmd.decision },
      });
      await this.audit.record(tx, {
        actor,
        action: `overtime.${cmd.decision.toLowerCase()}`,
        objectType: 'shift_session',
        objectId: sessionId,
        after: { minutes: summary.overtimeMinutes, decision: cmd.decision },
        reason: cmd.comment,
      });
    });
    const [view] = (await this.overtime('all')).filter((o) => o.shiftSessionId === sessionId);
    if (!view) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Підсумок зміни не знайдено');
    return view;
  }

  /* ------------------------------------------------------------------ */
  /* Читання для панелі                                                  */
  /* ------------------------------------------------------------------ */

  async list(
    q: RequestsQuery,
    viewer: { roles: readonly string[] },
    now: Date = new Date(),
  ): Promise<RequestView[]> {
    const conditions = [];
    if ((q.scope ?? 'inbox') === 'inbox') conditions.push(inArray(requests.status, [...OPEN]));
    if (q.status) conditions.push(eq(requests.status, q.status));
    if (q.type) conditions.push(eq(requests.type, q.type));
    if (q.employeeId) conditions.push(eq(requests.employeeId, q.employeeId));
    const rows = await this.baseQuery()
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(requests.submittedAt))
      .limit(500);
    const hr = viewer.roles.includes('HR') || viewer.roles.includes('ADMIN');
    const views = rows.map((r) => this.toView(r, now, hr));
    if ((q.scope ?? 'inbox') !== 'inbox') return views;
    return views.filter((v) => {
      const step = routeFor(v.type)[v.currentStep];
      return step ? canDecideStep(step, { roles: viewer.roles }, null) : false;
    });
  }

  async detail(
    id: string,
    viewer: { roles: readonly string[]; employeeId?: string | null },
    now: Date = new Date(),
  ): Promise<RequestDetailView> {
    const hr = viewer.roles.includes('HR') || viewer.roles.includes('ADMIN');
    const [row] = await this.baseQuery().where(eq(requests.id, id)).limit(1);
    if (!row) throw new DomainError('REQUEST_NOT_FOUND', 404, 'Звернення не знайдено');
    const own = viewer.employeeId !== undefined && viewer.employeeId === row.r.employeeId;
    const decisions = await this.db
      .select()
      .from(requestDecisions)
      .where(eq(requestDecisions.requestId, id))
      .orderBy(asc(requestDecisions.at));
    return {
      request: this.toView(row, now, hr || own),
      decisions: decisions.map((d): RequestDecisionView => ({
        id: d.id,
        step: d.step,
        stepKey: d.stepKey,
        actorType: d.actorType,
        actorId: d.actorId,
        actingRole: d.actingRole,
        decision: d.decision,
        comment: d.comment,
        at: d.at.toISOString(),
      })),
      serverTime: now.toISOString(),
    };
  }

  async view(id: string, now: Date = new Date()): Promise<RequestView> {
    const [row] = await this.baseQuery().where(eq(requests.id, id)).limit(1);
    if (!row) throw new DomainError('REQUEST_NOT_FOUND', 404, 'Звернення не знайдено');
    return this.toView(row, now, true);
  }

  /** Медичний документ лише для HR (FR-REQ-02, T-40): доступ і перегляд в аудиті. */
  async medicalLink(requestId: string, viewer: Decider, now: Date = new Date()) {
    if (!viewer.roles.includes('HR') && !viewer.roles.includes('ADMIN')) {
      await this.audit.record(this.db, {
        actor: viewer,
        action: 'medical.denied',
        objectType: 'request',
        objectId: requestId,
      });
      throw new DomainError('MEDICAL_FORBIDDEN', 403, 'Медичні документи доступні лише HR');
    }
    const [row] = await this.db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!row?.medicalMediaId) throw new DomainError('MEDIA_NOT_FOUND', 404, 'Документа немає');
    return this.media.link(row.medicalMediaId, viewer, now);
  }

  /* ------------------------------------------------------------------ */
  /* Допоміжне для бота                                                  */
  /* ------------------------------------------------------------------ */

  /** Заплановані зміни працівника на найближчі дні для вибору в боті. */
  async upcomingAssignments(employeeId: string, days = 14, now: Date = new Date()) {
    return this.db
      .select({
        id: shiftAssignments.id,
        businessDate: shiftAssignments.businessDate,
        planStartAt: shiftAssignments.planStartAt,
        templateCode: shiftTemplates.code,
      })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .innerJoin(shiftTemplates, eq(shiftAssignments.templateId, shiftTemplates.id))
      .where(
        and(
          eq(shiftAssignments.employeeId, employeeId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          gte(shiftAssignments.planStartAt, now),
          lte(shiftAssignments.planStartAt, new Date(now.getTime() + days * 86_400_000)),
        ),
      )
      .orderBy(asc(shiftAssignments.planStartAt));
  }

  /** Колеги з опублікованими змінами в тому ж підрозділі: кандидати на обмін. */
  async swapCandidates(employeeId: string, assignmentId: string, now: Date = new Date()) {
    const [mine] = await this.db
      .select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.id, assignmentId))
      .limit(1);
    if (!mine) return [];
    const rows = await this.db
      .selectDistinct({ id: employees.id, fullName: employees.fullName })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .innerJoin(employees, eq(shiftAssignments.employeeId, employees.id))
      .where(
        and(
          eq(shiftAssignments.orgUnitId, mine.orgUnitId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          ne(shiftAssignments.employeeId, employeeId),
          eq(employees.status, 'ACTIVE'),
          gte(shiftAssignments.planStartAt, now),
          lte(shiftAssignments.planStartAt, new Date(now.getTime() + 14 * 86_400_000)),
        ),
      )
      .orderBy(asc(employees.fullName))
      .limit(20);
    return rows;
  }

  /** Шаблони змін майданчика працівника для «додаткової зміни». */
  async templatesFor(employeeId: string) {
    const [pos] = await this.db
      .select({ siteId: sites.id })
      .from(employeePositions)
      .innerJoin(sql`org_units`, sql`org_units.id = ${employeePositions.orgUnitId}`)
      .innerJoin(sites, sql`${sites.id} = org_units.site_id`)
      .where(and(eq(employeePositions.employeeId, employeeId), isNull(employeePositions.validTo)))
      .limit(1);
    if (!pos) return [];
    return this.db
      .select({ id: shiftTemplates.id, code: shiftTemplates.code, name: shiftTemplates.name })
      .from(shiftTemplates)
      .where(and(eq(shiftTemplates.siteId, pos.siteId), eq(shiftTemplates.isActive, true)));
  }

  /* ------------------------------------------------------------------ */
  /* Внутрішнє                                                           */
  /* ------------------------------------------------------------------ */

  private async validate(tx: DbOrTx, employeeId: string, cmd: CreateRequestCommand, now: Date) {
    const base: Partial<typeof requests.$inferInsert> = { payload: {} };
    if (PERIOD_TYPES.includes(cmd.type) && 'periodFrom' in cmd) {
      if (cmd.periodFrom > cmd.periodTo)
        throw new DomainError('PERIOD_INVALID', 422, 'Дата початку пізніша за кінець');
      base.periodFrom = cmd.periodFrom;
      base.periodTo = cmd.periodTo;
    }
    if ('assignmentId' in cmd) {
      const a = await this.ownedAssignment(tx, employeeId, cmd.assignmentId);
      if (a.planStartAt.getTime() < now.getTime() - 12 * 3_600_000) {
        throw new DomainError('ASSIGNMENT_PAST', 422, 'Зміна вже минула');
      }
      base.assignmentId = a.id;
    }
    if (cmd.type === 'SWAP') {
      const theirs = await this.ownedAssignment(
        tx,
        cmd.counterpartEmployeeId,
        cmd.counterpartAssignmentId,
      );
      base.counterpartEmployeeId = cmd.counterpartEmployeeId;
      base.payload = { counterpartAssignmentId: theirs.id };
    }
    if (cmd.type === 'LATE' || cmd.type === 'EARLY_LEAVE') base.payload = { minutes: cmd.minutes };
    if (cmd.type === 'EXTRA_SHIFT') {
      base.periodFrom = cmd.businessDate;
      base.periodTo = cmd.businessDate;
      base.payload = { templateId: cmd.templateId };
    }
    if (cmd.type === 'CORRECTION' || cmd.type === 'APPEAL') {
      const [session] = await tx
        .select()
        .from(shiftSessions)
        .where(
          and(eq(shiftSessions.id, cmd.shiftSessionId), eq(shiftSessions.employeeId, employeeId)),
        )
        .limit(1);
      if (!session) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Зміну не знайдено');
      base.shiftSessionId = session.id;
      if (cmd.type === 'CORRECTION') {
        base.payload = {
          reasonCode: cmd.reasonCode,
          ...(cmd.proposal ? { proposal: normalizeProposal(cmd.proposal) } : {}),
        };
      } else {
        base.payload = { scoreId: cmd.scoreId ?? null };
      }
    }
    return base;
  }

  private async ownedAssignment(
    tx: DbOrTx,
    employeeId: string,
    assignmentId: string,
  ): Promise<AssignmentRow> {
    const [row] = await tx
      .select({ a: shiftAssignments })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .where(
        and(
          eq(shiftAssignments.id, assignmentId),
          eq(shiftAssignments.employeeId, employeeId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    if (!row)
      throw new DomainError(
        'ASSIGNMENT_NOT_FOUND',
        404,
        'Зміну не знайдено в опублікованому графіку',
      );
    return row.a;
  }

  /**
   * FR-REQ-04: схвалення змінює графік новою версією на базі опублікованої: відсутність прибирає
   * зміни періоду, обмін міняє працівників місцями, додаткова зміна додає призначення.
   */
  private async applyScheduleEffect(
    tx: DbOrTx,
    row: RequestRow,
    decider: Decider,
    _now: Date,
  ): Promise<string | null> {
    void tx;
    const affected = await this.affectedAssignments(row);
    let versionId: string | null = null;
    const groups = new Map<
      string,
      { siteId: string; orgUnitId: string; periodMonth: string; publishedId: string }
    >();
    for (const a of affected) groups.set(a.publishedId, a);
    if (row.type === 'EXTRA_SHIFT' && row.periodFrom) {
      const place = await this.placeForEmployee(row.employeeId);
      if (!place)
        throw new DomainError('POSITION_REQUIRED', 422, 'У працівника немає чинної посади');
      const month = row.periodFrom.slice(0, 7);
      const [published] = await this.db
        .select()
        .from(scheduleVersions)
        .where(
          and(
            eq(scheduleVersions.siteId, place.siteId),
            eq(scheduleVersions.orgUnitId, place.orgUnitId),
            eq(scheduleVersions.periodMonth, month),
            eq(scheduleVersions.status, 'PUBLISHED'),
          ),
        )
        .limit(1);
      if (!published)
        throw new DomainError(
          'SCHEDULE_NOT_PUBLISHED',
          409,
          'На цей місяць немає опублікованого графіка',
        );
      groups.set(published.id, {
        siteId: place.siteId,
        orgUnitId: place.orgUnitId,
        periodMonth: month,
        publishedId: published.id,
      });
    }
    for (const group of groups.values()) {
      const current = await this.db
        .select()
        .from(shiftAssignments)
        .where(
          and(
            eq(shiftAssignments.scheduleVersionId, group.publishedId),
            eq(shiftAssignments.status, 'PLANNED'),
          ),
        );
      let items: AssignmentInput[] = current.map(toInput);
      switch (row.type) {
        case 'VACATION':
        case 'DAY_OFF':
        case 'SICK':
          items = items.filter(
            (i) =>
              !(
                i.employeeId === row.employeeId &&
                row.periodFrom &&
                row.periodTo &&
                i.businessDate >= row.periodFrom &&
                i.businessDate <= row.periodTo
              ),
          );
          break;
        case 'CANNOT_ATTEND': {
          const target = current.find((a) => a.id === row.assignmentId);
          items = items.filter(
            (i) =>
              !(
                target &&
                i.employeeId === target.employeeId &&
                i.businessDate === target.businessDate
              ),
          );
          break;
        }
        case 'SWAP': {
          const mine = current.find((a) => a.id === row.assignmentId);
          const theirs = current.find((a) => a.id === row.payload.counterpartAssignmentId);
          if (!mine || !theirs)
            throw new DomainError('ASSIGNMENT_NOT_FOUND', 409, 'Одна зі змін уже змінилась');
          items = items.map((i) => {
            if (i.employeeId === mine.employeeId && i.businessDate === mine.businessDate)
              return { ...i, employeeId: theirs.employeeId };
            if (i.employeeId === theirs.employeeId && i.businessDate === theirs.businessDate)
              return { ...i, employeeId: mine.employeeId };
            return i;
          });
          break;
        }
        case 'EXTRA_SHIFT':
          items.push({
            employeeId: row.employeeId,
            templateId: row.payload.templateId!,
            businessDate: row.periodFrom!,
            kind: 'EXTRA',
          });
          break;
        default:
          break;
      }
      const draft = await this.schedule.createVersion(
        {
          siteId: group.siteId,
          orgUnitId: group.orgUnitId,
          periodMonth: group.periodMonth,
          basedOnVersionId: group.publishedId,
        },
        decider,
      );
      await this.schedule.putAssignments(draft.id, { items }, decider);
      await this.schedule.submit(draft.id, decider);
      const published = await this.schedule.publish(
        draft.id,
        { changeReason: `${messages().requests.types[row.type]}: ${row.comment ?? ''}`.trim() },
        decider,
      );
      versionId = versionId ?? published.id;
    }
    return versionId;
  }

  private async affectedAssignments(
    row: RequestRow,
  ): Promise<{ siteId: string; orgUnitId: string; periodMonth: string; publishedId: string }[]> {
    const ids: string[] = [];
    if (row.assignmentId) ids.push(row.assignmentId);
    if (row.payload.counterpartAssignmentId) ids.push(row.payload.counterpartAssignmentId);
    const conditions = [eq(scheduleVersions.status, 'PUBLISHED')];
    if (ids.length > 0) conditions.push(inArray(shiftAssignments.id, ids));
    else if (row.periodFrom && row.periodTo) {
      conditions.push(
        eq(shiftAssignments.employeeId, row.employeeId),
        eq(shiftAssignments.status, 'PLANNED'),
        gte(shiftAssignments.businessDate, row.periodFrom),
        lte(shiftAssignments.businessDate, row.periodTo),
      );
    } else return [];
    const rows = await this.db
      .selectDistinct({
        siteId: scheduleVersions.siteId,
        orgUnitId: scheduleVersions.orgUnitId,
        periodMonth: scheduleVersions.periodMonth,
        publishedId: scheduleVersions.id,
      })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .where(and(...conditions));
    return rows;
  }

  private async placeForEmployee(
    employeeId: string,
  ): Promise<{ siteId: string; orgUnitId: string } | null> {
    const [row] = await this.db
      .select({
        orgUnitId: employeePositions.orgUnitId,
        siteId: sql<string>`(SELECT site_id FROM org_units WHERE org_units.id = ${employeePositions.orgUnitId})`,
      })
      .from(employeePositions)
      .where(
        and(
          eq(employeePositions.employeeId, employeeId),
          or(isNull(employeePositions.validTo), gte(employeePositions.validTo, new Date())),
        ),
      )
      .orderBy(desc(employeePositions.validFrom))
      .limit(1);
    return row ? { siteId: row.siteId, orgUnitId: row.orgUnitId } : null;
  }

  private baseQuery() {
    const counterpart = sql<
      string | null
    >`(SELECT full_name FROM employees e2 WHERE e2.id = ${requests.counterpartEmployeeId})`;
    return this.db
      .select({
        r: requests,
        employeeName: employees.fullName,
        counterpartName: counterpart,
        assignmentDate: shiftAssignments.businessDate,
      })
      .from(requests)
      .innerJoin(employees, eq(requests.employeeId, employees.id))
      .leftJoin(shiftAssignments, eq(requests.assignmentId, shiftAssignments.id))
      .$dynamic();
  }

  private toView(
    row: {
      r: RequestRow;
      employeeName: string;
      counterpartName: string | null;
      assignmentDate: string | null;
    },
    now: Date,
    showMedical: boolean,
  ): RequestView {
    const r = row.r;
    const steps = routeFor(r.type);
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      employeeId: r.employeeId,
      employeeName: row.employeeName,
      currentStep: r.currentStep,
      currentStepKey: isRequestOpen(r.status) ? (steps[r.currentStep]?.key ?? null) : null,
      totalSteps: steps.length,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      assignmentId: r.assignmentId,
      assignmentDate: row.assignmentDate,
      counterpartEmployeeId: r.counterpartEmployeeId,
      counterpartName: row.counterpartName,
      shiftSessionId: r.shiftSessionId,
      comment: r.comment,
      minutes: r.payload.minutes ?? null,
      approvedMinutes: r.payload.approvedMinutes ?? null,
      hasMedicalDocument: r.medicalMediaId !== null,
      medicalMediaId: showMedical ? r.medicalMediaId : null,
      submittedAt: r.submittedAt.toISOString(),
      stepDeadlineAt: r.stepDeadlineAt?.toISOString() ?? null,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      resultVersionId: r.resultVersionId,
      overdue:
        isRequestOpen(r.status) &&
        r.stepDeadlineAt !== null &&
        r.stepDeadlineAt.getTime() < now.getTime(),
    };
  }

  private async replay(scope: string, key: string): Promise<string | null> {
    const [row] = await this.db
      .select({ response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
      .limit(1);
    return row ? String((row.response as { requestId: string }).requestId) : null;
  }
}

function toInput(a: AssignmentRow): AssignmentInput {
  return {
    employeeId: a.employeeId,
    templateId: a.templateId,
    businessDate: a.businessDate,
    kind: a.kind,
    ...(a.positionId ? { positionId: a.positionId } : {}),
    ...(a.teamId ? { teamId: a.teamId } : {}),
    ...(a.zoneId ? { zoneId: a.zoneId } : {}),
  };
}

/** Пропозиція в payload зберігається в ISO-формі команди; домен працює з epoch у CorrectionsService. */
function normalizeProposal(p: CorrectionProposalCommand): CorrectionProposalCommand {
  return p;
}

export type { RequestType };
