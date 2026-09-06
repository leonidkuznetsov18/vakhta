import { Inject, Injectable } from '@nestjs/common';
import {
  activityIntervals,
  and,
  asc,
  desc,
  domainEvents,
  employees,
  eq,
  gte,
  idempotencyKeys,
  inArray,
  isNull,
  notInArray,
  orgUnits,
  presenceSessions,
  reasonCodes,
  responsibilityZones,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  ACTION_EVENT_TYPE,
  TERMINAL_STATES,
  allowedActions,
  businessDateOf,
  computeShiftSummary,
  downtimeEscalationJobId,
  isActive,
  returnReminderJobId,
  transition,
  type ActivityInterval,
  type CommandErrorCode,
  type ShiftAction,
  type ShiftSnapshot,
  type ShiftSummary,
  type TransitionContext,
  type TransitionEffect,
} from '@vakhta/domain';
import type {
  ActiveShiftView,
  ActiveShiftsQuery,
  ActivityIntervalView,
  ReasonOption,
  ShiftDetailView,
  ShiftScreenView,
  ShiftSessionView,
  ShiftSummaryView,
  TransitionResponse,
} from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { AttendanceService } from '../attendance/attendance.service.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore, type EventSource } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { TIMER_SCHEDULER, type TimerScheduler } from '../infra/timers.queue.js';
import { HandoverRepository } from '../handover/handover.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShiftChanges } from './shift-changes.js';

export interface ShiftOptions {
  readonly breakMinutes: number;
  readonly mealMinutes: number;
  readonly serviceTimeMinutes: number;
  readonly downtimeEscalationMinutes: number;
  readonly graceMinutes: number;
  readonly earlyStartWindowMinutes: number;
  readonly overtimeThresholdMinutes: number;
  readonly defaultTimezone: string;
  /** Скільки годин після закриття показувати екран «Після зміни» (ТЗ 5.1). */
  readonly afterShiftHours?: number;
  /** Нагадування про прибирання до планового кінця зміни (FR-CLN-01). */
  readonly cleaningReminderMinutes?: number;
}

export const SHIFT_OPTIONS = Symbol('SHIFT_OPTIONS');

type SessionRow = typeof shiftSessions.$inferSelect;
type IntervalRow = typeof activityIntervals.$inferSelect;

/** Що спільного в усіх команд переходу, незалежно від джерела. */
export interface CommandInput {
  readonly action: ShiftAction;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly reasonCode?: string | undefined;
  readonly comment?: string | undefined;
  readonly resumeIntoDowntime?: boolean | undefined;
}

export interface CommandMeta {
  readonly actor: Actor;
  readonly source: EventSource;
  /** Майстер оформив резервне рішення: guard-и присутності, зони й передачі пропускаються. */
  readonly masterOverride?: boolean;
  readonly now?: Date;
}

/** Робота з таймерами йде після коміту: BullMQ не бере участі в транзакції БД. */
export type DeferredTimer = () => Promise<void>;

const t = messages('ru');
const TERMINAL = [...TERMINAL_STATES];

/**
 * Зміна як машина станів у транзакції (ТЗ 4.3–4.5, документ 3.7): SELECT … FOR UPDATE,
 * перевірка expected_version, чистий перехід із @vakhta/domain, закриття й відкриття інтервалу,
 * подія, ефекти й ключ ідемпотентності в одній транзакції; таймери після коміту.
 */
@Injectable()
export class ShiftService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    private readonly attendance: AttendanceService,
    private readonly changes: ShiftChanges,
    @Inject(TIMER_SCHEDULER) private readonly timers: TimerScheduler,
    @Inject(SHIFT_OPTIONS) private readonly options: ShiftOptions,
    private readonly handovers: HandoverRepository = new HandoverRepository(),
  ) {}

  /* ------------------------------------------------------------------ */
  /* Читання                                                             */
  /* ------------------------------------------------------------------ */

  async activeSession(employeeId: string, tx: DbOrTx = this.db): Promise<SessionRow | null> {
    const [row] = await tx
      .select()
      .from(shiftSessions)
      .where(
        and(eq(shiftSessions.employeeId, employeeId), notInArray(shiftSessions.state, TERMINAL)),
      )
      .limit(1);
    return row ?? null;
  }

  async requireSession(sessionId: string, tx: DbOrTx = this.db): Promise<SessionRow> {
    const [row] = await tx
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId))
      .limit(1);
    if (!row) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Зміну не знайдено');
    return row;
  }

  /** Екран зміни для бота: стан, доступні дії, причини, підсумок після закриття (ADR-11). */
  async screen(employeeId: string, now: Date = new Date()): Promise<ShiftScreenView> {
    const [active, presence] = await Promise.all([
      this.activeSession(employeeId),
      this.attendance.openPresence(employeeId),
    ]);
    const recent = active ?? (await this.recentlyClosed(employeeId, now));
    const session = recent ? await this.sessionView(this.db, recent.id) : null;
    const ctx = active ? await this.context(this.db, active, { masterOverride: false }) : {};
    // Після закриття показуємо підсумок (ТЗ 5.1 «Після зміни»); нову зміну відкриває майстер.
    const actions: ShiftAction[] = active
      ? [...allowedActions({ state: active.state, resumeState: active.resumeState }, ctx)]
      : presence && !recent
        ? ['START_SHIFT']
        : [];
    const [downtimeReasons, emergencyReasons] = await Promise.all([
      this.reasons('DOWNTIME'),
      this.reasons('EMERGENCY'),
    ]);
    const offerResumeIntoDowntime =
      active !== null &&
      (active.state === 'BREAK' || active.state === 'MEAL' || active.state === 'SERVICE_TIME') &&
      (await this.previousClosedState(this.db, active.id)) === 'DOWNTIME';
    return {
      session,
      presenceOpen: presence !== null,
      allowedActions: actions,
      canAcceptZone:
        active !== null &&
        active.state === 'PREPARATION' &&
        active.zoneId !== null &&
        active.zoneAcceptedAt === null,
      offerResumeIntoDowntime,
      pendingHandovers: 0,
      downtimeReasons,
      emergencyReasons,
      summary: recent && !active ? await this.summaryView(this.db, recent.id) : null,
      timezone: this.options.defaultTimezone,
      serverTime: now.toISOString(),
    };
  }

  /** Оперативний екран (ТЗ 9.2): незакриті зміни, за бажанням і закриті сьогодні. */
  async listActive(q: ActiveShiftsQuery, now: Date = new Date()): Promise<ActiveShiftView[]> {
    const since = new Date(now.getTime() - 24 * 3_600_000);
    const conditions = [
      q.includeClosed
        ? sql`(${shiftSessions.state} NOT IN ('SHIFT_CLOSED', 'EMERGENCY_EXIT') OR ${shiftSessions.endedAt} >= ${since})`
        : notInArray(shiftSessions.state, TERMINAL),
    ];
    if (q.orgUnitId) conditions.push(eq(shiftAssignments.orgUnitId, q.orgUnitId));
    if (q.siteId) conditions.push(eq(orgUnits.siteId, q.siteId));

    const rows = await this.db
      .select({
        s: shiftSessions,
        fullName: employees.fullName,
        personnelNumber: employees.personnelNumber,
        orgUnitName: orgUnits.name,
        planStartAt: shiftAssignments.planStartAt,
        planEndAt: shiftAssignments.planEndAt,
        zoneName: responsibilityZones.name,
        presenceSince: presenceSessions.arrivedAt,
        stateSince: this.stateSinceSql(),
      })
      .from(shiftSessions)
      .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
      .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .leftJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .leftJoin(responsibilityZones, eq(shiftSessions.zoneId, responsibilityZones.id))
      .leftJoin(
        presenceSessions,
        and(
          eq(presenceSessions.employeeId, shiftSessions.employeeId),
          eq(presenceSessions.status, 'OPEN'),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(shiftSessions.startedAt));

    return rows.map((r) => this.toActiveView(r, now));
  }

  async detail(sessionId: string, now: Date = new Date()): Promise<ShiftDetailView> {
    const [row] = await this.db
      .select({
        s: shiftSessions,
        fullName: employees.fullName,
        personnelNumber: employees.personnelNumber,
        orgUnitName: orgUnits.name,
        planStartAt: shiftAssignments.planStartAt,
        planEndAt: shiftAssignments.planEndAt,
        zoneName: responsibilityZones.name,
        presenceSince: presenceSessions.arrivedAt,
        stateSince: this.stateSinceSql(),
      })
      .from(shiftSessions)
      .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
      .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .leftJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .leftJoin(responsibilityZones, eq(shiftSessions.zoneId, responsibilityZones.id))
      .leftJoin(
        presenceSessions,
        and(
          eq(presenceSessions.employeeId, shiftSessions.employeeId),
          eq(presenceSessions.status, 'OPEN'),
        ),
      )
      .where(eq(shiftSessions.id, sessionId))
      .limit(1);
    if (!row) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Зміну не знайдено');

    const [intervals, summary, events] = await Promise.all([
      this.intervals(this.db, sessionId),
      this.summaryView(this.db, sessionId),
      this.db
        .select()
        .from(domainEvents)
        .where(eq(domainEvents.shiftSessionId, sessionId))
        .orderBy(asc(domainEvents.occurredAt)),
    ]);
    return {
      session: this.toActiveView(row, now),
      intervals: intervals.map(toIntervalView),
      summary,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        occurredAt: e.occurredAt.toISOString(),
        actorType: e.actingRole,
        reasonCode: e.reasonCode,
        comment: e.comment,
        payload: e.payload,
      })),
      serverTime: now.toISOString(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Команди                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * «Почати зміну» (FR-TIME-02): потрібна відкрита присутність і призначена зміна; майстер може
   * відкрити без них із коментарем. Сесія створюється в NOT_STARTED і в тій самій транзакції
   * переходить у PREPARATION.
   */
  async start(
    employeeId: string,
    cmd: { idempotencyKey: string; comment?: string | undefined },
    meta: CommandMeta,
  ): Promise<TransitionResponse> {
    const now = meta.now ?? new Date();
    const deferred: DeferredTimer[] = [];
    const response = await this.db.transaction(async (tx) => {
      const replay = await this.replay(tx, employeeId, cmd.idempotencyKey);
      if (replay) return replay;

      const existing = await this.activeSession(employeeId, tx);
      if (existing)
        return this.fail('ALREADY_STARTED', await this.sessionView(tx, existing.id), now);

      const presence = await this.attendance.openPresence(employeeId, tx);
      if (!presence && !meta.masterOverride) return this.fail('PRESENCE_REQUIRED', null, now);

      const picked = presence?.assignmentId
        ? { id: presence.assignmentId }
        : await this.attendance.findArrivalAssignment(tx, employeeId, now);
      const assignment = picked ? await this.assignmentById(tx, picked.id) : null;
      if (!assignment && !meta.masterOverride) return this.fail('NO_ASSIGNMENT', null, now);

      let session: SessionRow;
      try {
        // Savepoint: після порушення унікальності зовнішня транзакція має лишитись робочою (AC-05).
        session = await tx.transaction(async (sp) => {
          const [row] = await sp
            .insert(shiftSessions)
            .values({
              employeeId,
              assignmentId: assignment?.id ?? null,
              presenceId: presence?.id ?? null,
              businessDate:
                assignment?.businessDate ?? businessDateOf(now, this.options.defaultTimezone),
              zoneId: assignment?.zoneId ?? null,
              startMethod: meta.masterOverride ? 'MASTER' : 'EMPLOYEE',
            })
            .returning();
          if (!row) throw new Error('shift_sessions: insert не повернув рядок');
          return row;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const other = await this.activeSession(employeeId, tx);
          return this.fail(
            'ALREADY_STARTED',
            other ? await this.sessionView(tx, other.id) : null,
            now,
          );
        }
        throw error;
      }

      const applied = await this.apply(
        tx,
        session,
        {
          action: 'START_SHIFT',
          expectedVersion: session.version,
          idempotencyKey: cmd.idempotencyKey,
          comment: cmd.comment,
        },
        { ...meta, now },
        deferred,
      );
      // FR-CLN-01: нагадування про прибирання за N хвилин до планового кінця.
      if (applied.ok && assignment && this.options.cleaningReminderMinutes) {
        const fireAt = new Date(
          assignment.planEndAt.getTime() - this.options.cleaningReminderMinutes * 60_000,
        );
        deferred.push(() => this.timers.scheduleCleaningReminder(session.id, fireAt));
      }
      return applied;
    });
    await this.afterCommit(response, deferred);
    return response;
  }

  /** Перехід від імені працівника: сесія визначається за ним (бот не носить id сесії). */
  async transition(
    employeeId: string,
    cmd: CommandInput,
    meta: CommandMeta,
  ): Promise<TransitionResponse> {
    const deferred: DeferredTimer[] = [];
    const response = await this.db.transaction((tx) =>
      this.transitionWithin(tx, employeeId, cmd, meta, deferred),
    );
    await this.settle(response, deferred);
    return response;
  }

  /**
   * Той самий перехід усередині чужої транзакції (інцидент + простій атомарно, ТЗ 5.5).
   * Викликач після коміту зобовʼязаний викликати settle() з тим самим deferred.
   */
  async transitionWithin(
    tx: DbOrTx,
    employeeId: string,
    cmd: CommandInput,
    meta: CommandMeta,
    deferred: DeferredTimer[],
  ): Promise<TransitionResponse> {
    const now = meta.now ?? new Date();
    const replay = await this.replay(tx, employeeId, cmd.idempotencyKey);
    if (replay) return replay;
    const [session] = await tx
      .select()
      .from(shiftSessions)
      .where(
        and(eq(shiftSessions.employeeId, employeeId), notInArray(shiftSessions.state, TERMINAL)),
      )
      .for('update');
    if (!session) return this.fail('NO_ACTIVE_SHIFT', null, now);
    return this.apply(tx, session, cmd, { ...meta, now }, deferred);
  }

  /** Таймери й SSE після коміту; для replay нічого не робить. */
  async settle(response: TransitionResponse, deferred: DeferredTimer[]): Promise<void> {
    return this.afterCommit(response, deferred);
  }

  /** Дія майстра з панелі по конкретній сесії; guard-и пропускаються, аудит обовʼязковий. */
  async masterTransition(
    sessionId: string,
    cmd: CommandInput,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<TransitionResponse> {
    const deferred: DeferredTimer[] = [];
    const response = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(shiftSessions)
        .where(eq(shiftSessions.id, sessionId))
        .for('update');
      if (!session) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Зміну не знайдено');
      const replay = await this.replay(tx, session.employeeId, cmd.idempotencyKey);
      if (replay) return replay;
      const result = await this.apply(
        tx,
        session,
        cmd,
        { actor, source: 'WEB', masterOverride: true, now },
        deferred,
      );
      if (result.ok) {
        await this.audit.record(tx, {
          actor,
          action: `shift.master.${cmd.action.toLowerCase()}`,
          objectType: 'shift_session',
          objectId: sessionId,
          before: { state: session.state, version: session.version },
          after: { state: result.session.state, version: result.session.version },
          reason: cmd.comment ?? cmd.reasonCode ?? null,
        });
      }
      return result;
    });
    await this.afterCommit(response, deferred);
    return response;
  }

  async masterStart(
    employeeId: string,
    cmd: { idempotencyKey: string; comment: string },
    actor: Actor,
    now: Date = new Date(),
  ): Promise<TransitionResponse> {
    const result = await this.start(employeeId, cmd, {
      actor,
      source: 'WEB',
      masterOverride: true,
      now,
    });
    if (result.ok && !result.replayed) {
      await this.audit.record(this.db, {
        actor,
        action: 'shift.master.start',
        objectType: 'shift_session',
        objectId: result.session.id,
        after: { employeeId, state: result.session.state },
        reason: cmd.comment,
      });
    }
    return result;
  }

  /** Приймання контрольної зони перед початком роботи (ТЗ 4.4: PREPARATION → WORKING). */
  async acceptZone(
    employeeId: string,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftSessionView> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(shiftSessions)
        .where(
          and(eq(shiftSessions.employeeId, employeeId), notInArray(shiftSessions.state, TERMINAL)),
        )
        .for('update');
      if (!session) throw new DomainError('NO_ACTIVE_SHIFT', 409, t.errors.NO_ACTIVE_SHIFT);
      if (session.zoneId && !session.zoneAcceptedAt) {
        await tx
          .update(shiftSessions)
          .set({ zoneAcceptedAt: now, updatedAt: now })
          .where(eq(shiftSessions.id, session.id));
        await this.events.append(tx, {
          type: 'ZONE_ACCEPTED',
          source: actor.type === 'EMPLOYEE' ? 'TELEGRAM' : 'WEB',
          actor,
          occurredAt: now,
          employeeId,
          shiftSessionId: session.id,
          zoneId: session.zoneId,
          payload: {},
        });
      }
      return this.sessionView(tx, session.id);
    });
  }

  /** Майстер позначає зміну для уточнення (NEEDS_CLARIFICATION, FR-COR-01). */
  async flagClarification(
    sessionId: string,
    reason: string,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftSessionView> {
    const view = await this.db.transaction(async (tx) => {
      const session = await this.requireSession(sessionId, tx);
      await tx
        .update(shiftSessions)
        .set({ needsClarification: true, clarificationReason: reason, updatedAt: now })
        .where(eq(shiftSessions.id, sessionId));
      await this.events.append(tx, {
        type: 'SHIFT_FLAGGED_FOR_REVIEW',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId: session.employeeId,
        shiftSessionId: sessionId,
        comment: reason,
        payload: { state: session.state },
      });
      await this.audit.record(tx, {
        actor,
        action: 'shift.flag_clarification',
        objectType: 'shift_session',
        objectId: sessionId,
        reason,
      });
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: session.employeeId,
        template: 'SHIFT_FLAGGED',
        payload: { text: t.shift.flagged },
        dedupeKey: `shift-flagged:${sessionId}:${now.getTime()}`,
      });
      return this.sessionView(tx, sessionId);
    });
    this.changes.publish({
      sessionId,
      employeeId: view.employeeId,
      state: view.state,
      version: view.version,
      at: now.toISOString(),
    });
    return view;
  }

  /* ------------------------------------------------------------------ */
  /* Ядро переходу                                                       */
  /* ------------------------------------------------------------------ */

  private async apply(
    tx: DbOrTx,
    session: SessionRow,
    cmd: CommandInput,
    meta: CommandMeta & { now: Date },
    deferred: DeferredTimer[],
  ): Promise<TransitionResponse> {
    const { now } = meta;
    if (cmd.expectedVersion !== session.version) {
      return this.fail('VERSION_CONFLICT', await this.sessionView(tx, session.id), now);
    }
    const snapshot: ShiftSnapshot = { state: session.state, resumeState: session.resumeState };
    const ctx = await this.context(tx, session, meta, cmd);
    const result = transition(snapshot, cmd.action, ctx);
    if (!result.ok) return this.fail(result.error, await this.sessionView(tx, session.id), now);

    const [closed] = await tx
      .update(activityIntervals)
      .set({ endedAt: now })
      .where(
        and(eq(activityIntervals.shiftSessionId, session.id), isNull(activityIntervals.endedAt)),
      )
      .returning();

    let opened: IntervalRow | null = null;
    if (isActive(result.next.state)) {
      const [row] = await tx
        .insert(activityIntervals)
        .values({
          shiftSessionId: session.id,
          state: result.next.state,
          startedAt: now,
          resumeState: result.next.resumeState,
          reasonCode: cmd.reasonCode ?? null,
        })
        .returning();
      opened = row ?? null;
    }

    const terminal = !isActive(result.next.state);
    const flagged = result.effects.includes('FLAG_FOR_REVIEW');
    const [updated] = await tx
      .update(shiftSessions)
      .set({
        state: result.next.state,
        resumeState: result.next.resumeState,
        version: session.version + 1,
        updatedAt: now,
        ...(cmd.action === 'START_SHIFT' ? { startedAt: now } : {}),
        ...(terminal ? { endedAt: now } : {}),
        ...(flagged
          ? { needsClarification: true, clarificationReason: cmd.reasonCode ?? cmd.action }
          : {}),
      })
      .where(eq(shiftSessions.id, session.id))
      .returning();
    if (!updated) throw new Error('shift_sessions: update не повернув рядок');

    await this.events.append(tx, {
      type: ACTION_EVENT_TYPE[cmd.action],
      source: meta.source,
      actor: meta.actor,
      occurredAt: now,
      employeeId: session.employeeId,
      shiftSessionId: session.id,
      zoneId: session.zoneId,
      reasonCode: cmd.reasonCode ?? null,
      comment: cmd.comment ?? null,
      idempotencyKey: `${session.employeeId}:${cmd.idempotencyKey}`,
      payload: {
        action: cmd.action,
        from: snapshot.state,
        to: result.next.state,
        resumeState: result.next.resumeState,
        closedIntervalId: closed?.id ?? null,
        intervalId: opened?.id ?? null,
        effects: result.effects,
        masterOverride: meta.masterOverride === true,
        version: updated.version,
      },
    });

    const summary = await this.runEffects(
      tx,
      updated,
      result.effects,
      closed ?? null,
      opened,
      deferred,
      now,
    );

    const response: TransitionResponse = {
      ok: true,
      session: await this.sessionView(tx, session.id),
      summary,
      replayed: false,
      serverTime: now.toISOString(),
    };
    await tx.insert(idempotencyKeys).values({
      scope: `shift:${session.employeeId}`,
      key: cmd.idempotencyKey,
      requestHash: `${cmd.action}:${cmd.expectedVersion}`,
      response: response as unknown as Record<string, unknown>,
    });
    return response;
  }

  private async runEffects(
    tx: DbOrTx,
    session: SessionRow,
    effects: readonly TransitionEffect[],
    closed: IntervalRow | null,
    opened: IntervalRow | null,
    deferred: DeferredTimer[],
    now: Date,
  ): Promise<ShiftSummaryView | null> {
    let summary: ShiftSummaryView | null = null;

    // Вихід із тимчасового стану: нагадування й ескалація за старим інтервалом більше не потрібні.
    if (
      closed &&
      (closed.state === 'BREAK' || closed.state === 'MEAL' || closed.state === 'SERVICE_TIME')
    ) {
      const jobId = returnReminderJobId(session.id, closed.id);
      deferred.push(() => this.timers.cancel(jobId));
    }
    if (closed && closed.state === 'DOWNTIME') {
      const jobId = downtimeEscalationJobId(session.id, closed.id);
      deferred.push(() => this.timers.cancel(jobId));
    }

    for (const effect of effects) {
      switch (effect) {
        case 'SCHEDULE_RETURN_REMINDER': {
          if (
            !opened ||
            (opened.state !== 'BREAK' && opened.state !== 'MEAL' && opened.state !== 'SERVICE_TIME')
          )
            break;
          const state = opened.state;
          const limit =
            state === 'BREAK'
              ? this.options.breakMinutes
              : state === 'MEAL'
                ? this.options.mealMinutes
                : this.options.serviceTimeMinutes;
          const fireAt = new Date(now.getTime() + limit * 60_000);
          deferred.push(() =>
            this.timers.scheduleReturnReminder(
              { sessionId: session.id, intervalId: opened.id, state, limitMinutes: limit },
              fireAt,
            ),
          );
          break;
        }
        case 'SCHEDULE_DOWNTIME_ESCALATION': {
          if (!opened) break;
          const threshold = this.options.downtimeEscalationMinutes;
          const fireAt = new Date(now.getTime() + threshold * 60_000);
          deferred.push(() =>
            this.timers.scheduleDowntimeEscalation(
              { sessionId: session.id, intervalId: opened.id, thresholdMinutes: threshold },
              fireAt,
            ),
          );
          break;
        }
        case 'FINALIZE_SHIFT': {
          summary = await this.finalize(tx, session, now);
          break;
        }
        case 'OPEN_HANDOVER_DRAFT':
          await this.handovers.ensureDraft(tx, session, now);
          break;
        case 'SUPERSEDE_HANDOVER':
          // FR-HND-07: після повернення до роботи звіт застаріває, потрібен новий.
          await this.handovers.supersede(tx, session.id, now);
          break;
        case 'NOTIFY_MASTER':
        case 'FLAG_FOR_REVIEW':
          // Стан needs_clarification уже виставлено; майстер бачить це на оперативному екрані (SSE).
          break;
        case 'CANCEL_RETURN_REMINDER':
        case 'REQUIRE_DOWNTIME_REPORT':
        case 'MARK_HANDOVER_SUBMITTED':
          // Скасування зроблено вище за закритим інтервалом; звіт про простій — інциденти; подання — HandoverService.
          break;
      }
    }
    if (session.state === 'EMERGENCY_EXIT') summary = await this.finalize(tx, session, now);
    return summary;
  }

  /** Перерахунок підсумку після корекції (FR-COR-05): фактичні інтервали, той самий код. */
  async recomputeSummary(tx: DbOrTx, sessionId: string, now: Date): Promise<ShiftSummaryView> {
    const [session] = await tx
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId))
      .limit(1);
    if (!session) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Зміну не знайдено');
    return this.finalize(tx, session, session.endedAt ?? now, { silent: true });
  }

  /** Підсумок зміни (ТЗ 6.2) і повідомлення працівнику в аутбокс тією самою транзакцією. */
  private async finalize(
    tx: DbOrTx,
    session: SessionRow,
    now: Date,
    opts: { silent?: boolean } = {},
  ): Promise<ShiftSummaryView> {
    const intervals = await this.intervals(tx, session.id);
    const plan = session.assignmentId ? await this.assignmentById(tx, session.assignmentId) : null;
    const computed = computeShiftSummary(
      intervals.map(toDomainInterval),
      session.startedAt ?? now,
      now,
      plan ? { planStartAt: plan.planStartAt, planEndAt: plan.planEndAt } : null,
      {
        graceMinutes: this.options.graceMinutes,
        earlyStartWindowMinutes: this.options.earlyStartWindowMinutes,
        overtimeThresholdMinutes: this.options.overtimeThresholdMinutes,
      },
    );
    await tx
      .insert(shiftSummaries)
      .values({
        shiftSessionId: session.id,
        employeeId: session.employeeId,
        businessDate: session.businessDate,
        plannedMinutes: computed.plannedMinutes,
        totalMinutes: computed.totalMinutes,
        workMinutes: computed.workMinutes,
        preparationMinutes: computed.preparationMinutes,
        serviceMinutes: computed.serviceMinutes,
        breakMinutes: computed.breakMinutes,
        mealMinutes: computed.mealMinutes,
        downtimeMinutes: computed.downtimeMinutes,
        lateMinutes: computed.lateMinutes,
        earlyLeaveMinutes: computed.earlyLeaveMinutes,
        overtimeMinutes: computed.overtimeMinutes,
        overtimePending: computed.overtimePending,
        computedAt: now,
      })
      .onConflictDoUpdate({
        target: shiftSummaries.shiftSessionId,
        set: {
          totalMinutes: computed.totalMinutes,
          workMinutes: computed.workMinutes,
          preparationMinutes: computed.preparationMinutes,
          serviceMinutes: computed.serviceMinutes,
          breakMinutes: computed.breakMinutes,
          mealMinutes: computed.mealMinutes,
          downtimeMinutes: computed.downtimeMinutes,
          lateMinutes: computed.lateMinutes,
          earlyLeaveMinutes: computed.earlyLeaveMinutes,
          overtimeMinutes: computed.overtimeMinutes,
          overtimePending: computed.overtimePending,
          computedAt: now,
        },
      });
    const view = toSummaryView(computed);
    await this.events.append(tx, {
      type: 'SHIFT_SUMMARY_COMPUTED',
      source: 'SYSTEM',
      actor: { type: 'SYSTEM', id: null, role: 'SYSTEM' },
      occurredAt: now,
      employeeId: session.employeeId,
      shiftSessionId: session.id,
      payload: { ...view },
    });
    if (!opts.silent) {
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: session.employeeId,
        template: 'SHIFT_SUMMARY',
        payload: { text: summaryText(view) },
        dedupeKey: `shift-summary:${session.id}`,
      });
    }
    return view;
  }

  /** Факти для guard-ів машини (ТЗ 4.4): присутність, зона, поданий звіт передачі (FR-TIME-04). */
  private async context(
    tx: DbOrTx,
    session: SessionRow,
    meta: Pick<CommandMeta, 'masterOverride'>,
    cmd?: CommandInput,
  ): Promise<TransitionContext> {
    const presence = await this.attendance.openPresence(session.employeeId, tx);
    return {
      presenceConfirmed: presence !== null,
      masterOverride: meta.masterOverride === true,
      zoneAccepted: session.zoneId === null || session.zoneAcceptedAt !== null,
      handoverComplete:
        session.zoneId === null || (await this.handovers.hasSubmitted(tx, session.id)),
      ...(cmd?.reasonCode !== undefined ? { reasonCode: cmd.reasonCode } : {}),
      ...(cmd?.resumeIntoDowntime !== undefined
        ? { resumeIntoDowntime: cmd.resumeIntoDowntime }
        : {}),
    };
  }

  private async replay(
    tx: DbOrTx,
    employeeId: string,
    key: string,
  ): Promise<TransitionResponse | null> {
    const [row] = await tx
      .select({ response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, `shift:${employeeId}`), eq(idempotencyKeys.key, key)))
      .limit(1);
    if (!row) return null;
    return {
      ...(row.response as unknown as Extract<TransitionResponse, { ok: true }>),
      replayed: true,
    };
  }

  private async afterCommit(
    response: TransitionResponse,
    deferred: DeferredTimer[],
  ): Promise<void> {
    if (!response.ok || response.replayed) return;
    for (const run of deferred) await run();
    this.changes.publish({
      sessionId: response.session.id,
      employeeId: response.session.employeeId,
      state: response.session.state,
      version: response.session.version,
      at: response.serverTime,
    });
  }

  private fail(
    error: CommandErrorCode,
    session: ShiftSessionView | null,
    now: Date,
  ): TransitionResponse {
    return { ok: false, error, session, serverTime: now.toISOString() };
  }

  /* ------------------------------------------------------------------ */
  /* Допоміжне читання                                                   */
  /* ------------------------------------------------------------------ */

  private stateSinceSql() {
    return sql<Date | null>`(SELECT ${activityIntervals.startedAt} FROM ${activityIntervals} WHERE ${activityIntervals.shiftSessionId} = ${shiftSessions.id} ORDER BY ${activityIntervals.startedAt} DESC LIMIT 1)`.mapWith(
      (v: unknown) => (v ? new Date(v as string) : null),
    );
  }

  async sessionView(tx: DbOrTx, sessionId: string): Promise<ShiftSessionView> {
    const [row] = await tx
      .select({
        s: shiftSessions,
        planStartAt: shiftAssignments.planStartAt,
        planEndAt: shiftAssignments.planEndAt,
        zoneName: responsibilityZones.name,
        stateSince: this.stateSinceSql(),
      })
      .from(shiftSessions)
      .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .leftJoin(responsibilityZones, eq(shiftSessions.zoneId, responsibilityZones.id))
      .where(eq(shiftSessions.id, sessionId))
      .limit(1);
    if (!row) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Зміну не знайдено');
    return toSessionView(row);
  }

  private toActiveView(
    row: {
      s: SessionRow;
      fullName: string;
      personnelNumber: string;
      orgUnitName: string | null;
      planStartAt: Date | null;
      planEndAt: Date | null;
      zoneName: string | null;
      presenceSince: Date | null;
      stateSince: Date | null;
    },
    now: Date,
  ): ActiveShiftView {
    const base = toSessionView(row);
    const since = row.stateSince ?? row.s.startedAt;
    return {
      ...base,
      fullName: row.fullName,
      personnelNumber: row.personnelNumber,
      orgUnitName: row.orgUnitName,
      presenceSince: row.presenceSince?.toISOString() ?? null,
      stateMinutes: since ? Math.max(0, Math.round((now.getTime() - since.getTime()) / 60_000)) : 0,
    };
  }

  private async intervals(tx: DbOrTx, sessionId: string): Promise<IntervalRow[]> {
    return tx
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId))
      .orderBy(asc(activityIntervals.startedAt));
  }

  private async summaryView(tx: DbOrTx, sessionId: string): Promise<ShiftSummaryView | null> {
    const [row] = await tx
      .select()
      .from(shiftSummaries)
      .where(eq(shiftSummaries.shiftSessionId, sessionId))
      .limit(1);
    if (!row) return null;
    return {
      totalMinutes: row.totalMinutes,
      workMinutes: row.workMinutes,
      preparationMinutes: row.preparationMinutes,
      serviceMinutes: row.serviceMinutes,
      breakMinutes: row.breakMinutes,
      mealMinutes: row.mealMinutes,
      downtimeMinutes: row.downtimeMinutes,
      plannedMinutes: row.plannedMinutes,
      lateMinutes: row.lateMinutes,
      earlyLeaveMinutes: row.earlyLeaveMinutes,
      overtimeMinutes: row.overtimeMinutes,
      overtimePending: row.overtimePending,
    };
  }

  /** Стан інтервалу, закритого безпосередньо перед відкритим (для FR-DWN-06). */
  private async previousClosedState(tx: DbOrTx, sessionId: string): Promise<string | null> {
    const rows = await tx
      .select({ state: activityIntervals.state })
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId))
      .orderBy(desc(activityIntervals.startedAt))
      .limit(2);
    return rows[1]?.state ?? null;
  }

  private async recentlyClosed(employeeId: string, now: Date): Promise<SessionRow | null> {
    const since = new Date(now.getTime() - (this.options.afterShiftHours ?? 4) * 3_600_000);
    const [row] = await this.db
      .select()
      .from(shiftSessions)
      .where(
        and(
          eq(shiftSessions.employeeId, employeeId),
          inArray(shiftSessions.state, TERMINAL),
          gte(shiftSessions.endedAt, since),
        ),
      )
      .orderBy(desc(shiftSessions.endedAt))
      .limit(1);
    return row ?? null;
  }

  private async assignmentById(tx: DbOrTx, id: string) {
    const [row] = await tx
      .select({
        id: shiftAssignments.id,
        businessDate: shiftAssignments.businessDate,
        planStartAt: shiftAssignments.planStartAt,
        planEndAt: shiftAssignments.planEndAt,
        zoneId: shiftAssignments.zoneId,
      })
      .from(shiftAssignments)
      .where(eq(shiftAssignments.id, id))
      .limit(1);
    return row ?? null;
  }

  private async reasons(kind: 'DOWNTIME' | 'EMERGENCY'): Promise<ReasonOption[]> {
    const rows = await this.db
      .select({ code: reasonCodes.code, label: reasonCodes.label })
      .from(reasonCodes)
      .where(and(eq(reasonCodes.kind, kind), eq(reasonCodes.isActive, true)))
      .orderBy(asc(reasonCodes.sortOrder), asc(reasonCodes.code));
    return rows;
  }
}

/* -------------------------------------------------------------------- */
/* Мапінги                                                              */
/* -------------------------------------------------------------------- */

function toSessionView(row: {
  s: SessionRow;
  planStartAt: Date | null;
  planEndAt: Date | null;
  zoneName: string | null;
  stateSince: Date | null;
}): ShiftSessionView {
  const s = row.s;
  return {
    id: s.id,
    employeeId: s.employeeId,
    assignmentId: s.assignmentId,
    businessDate: s.businessDate,
    state: s.state,
    resumeState: s.resumeState,
    version: s.version,
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
    stateSince: (row.stateSince ?? s.startedAt)?.toISOString() ?? null,
    planStartAt: row.planStartAt?.toISOString() ?? null,
    planEndAt: row.planEndAt?.toISOString() ?? null,
    zoneId: s.zoneId,
    zoneName: row.zoneName,
    zoneAccepted: s.zoneId === null || s.zoneAcceptedAt !== null,
    needsClarification: s.needsClarification,
    clarificationReason: s.clarificationReason,
  };
}

function toIntervalView(row: IntervalRow): ActivityIntervalView {
  return {
    id: row.id,
    state: row.state,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    resumeState: row.resumeState,
    reasonCode: row.reasonCode,
  };
}

function toDomainInterval(row: IntervalRow): ActivityInterval {
  return {
    state: row.state,
    startedAt: row.startedAt.getTime(),
    endedAt: row.endedAt?.getTime() ?? null,
    resumeState: row.resumeState,
  };
}

function toSummaryView(s: ShiftSummary): ShiftSummaryView {
  return {
    totalMinutes: s.totalMinutes,
    workMinutes: s.workMinutes,
    preparationMinutes: s.preparationMinutes,
    serviceMinutes: s.serviceMinutes,
    breakMinutes: s.breakMinutes,
    mealMinutes: s.mealMinutes,
    downtimeMinutes: s.downtimeMinutes,
    plannedMinutes: s.plannedMinutes,
    lateMinutes: s.lateMinutes,
    earlyLeaveMinutes: s.earlyLeaveMinutes,
    overtimeMinutes: s.overtimeMinutes,
    overtimePending: s.overtimePending,
  };
}

/** Текст «Після зміни» (ТЗ 5.1) для бота й нотифікації. */
export function summaryText(s: ShiftSummaryView): string {
  const lines = [
    format(t.shift.summaryTotals, {
      total: s.totalMinutes,
      work: s.workMinutes + s.preparationMinutes + s.serviceMinutes,
      breaks: s.breakMinutes,
      meal: s.mealMinutes,
      downtime: s.downtimeMinutes,
    }),
  ];
  if (s.lateMinutes > 0) lines.push(format(t.shift.summaryLate, { minutes: s.lateMinutes }));
  if (s.earlyLeaveMinutes > 0)
    lines.push(format(t.shift.summaryEarly, { minutes: s.earlyLeaveMinutes }));
  if (s.overtimeMinutes > 0)
    lines.push(format(t.shift.summaryOvertime, { minutes: s.overtimeMinutes }));
  if (s.overtimePending) lines.push(t.shift.summaryOvertimePending);
  return lines.join('\n');
}
