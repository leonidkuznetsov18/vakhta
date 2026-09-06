import { Inject, Injectable } from '@nestjs/common';
import {
  activityIntervals,
  and,
  asc,
  count,
  desc,
  downtimeIncidents,
  downtimeReports,
  employees,
  eq,
  gte,
  idempotencyKeys,
  inArray,
  incidentStatusHistory,
  lt,
  orgUnits,
  reasonCodes,
  responsibilityZones,
  shiftAssignments,
  shiftSessions,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  OPEN_INCIDENT_STATUSES,
  canTransitionIncident,
  escalatesImmediately,
  findDuplicateCandidate,
  incidentSlaJobId,
  isOpenIncident,
  slaBreached,
  slaDueAt,
  type IncidentSeverity,
  type IncidentStatus,
  type SlaPolicy,
} from '@vakhta/domain';
import type {
  IncidentDetailView,
  IncidentStatsQuery,
  IncidentStatsRow,
  IncidentStatsView,
  IncidentTransitionCommand,
  IncidentUpdateCommand,
  IncidentView,
  IncidentsQuery,
  ReportProblemCommand,
  ReportProblemResult,
  ReportView,
} from '@vakhta/contracts';
import { DEFAULT_LOCALE, type Locale } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore, type EventSource } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { TIMER_SCHEDULER, type TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShiftService, type DeferredTimer } from '../shift/shift.service.js';
import { IncidentChanges } from './incident-changes.js';

export interface IncidentOptions {
  readonly sla: SlaPolicy;
  readonly duplicateWindowMinutes: number;
}

export const INCIDENT_OPTIONS = Symbol('INCIDENT_OPTIONS');

type IncidentRow = typeof downtimeIncidents.$inferSelect;
type ReasonRow = typeof reasonCodes.$inferSelect;

const OPEN = [...OPEN_INCIDENT_STATUSES];

/**
 * Спільні інциденти (ТЗ 5.5, FR-DWN-01..06): повідомлення працівника, автозвʼязування дублів,
 * SLA з ескалацією, дії майстра з історією статусів. Особистий простій лишається інтервалом зміни.
 */
@Injectable()
export class IncidentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    private readonly shift: ShiftService,
    private readonly changes: IncidentChanges,
    @Inject(TIMER_SCHEDULER) private readonly timers: TimerScheduler,
    @Inject(INCIDENT_OPTIONS) private readonly options: IncidentOptions,
  ) {}

  /** Активні причини виду для кнопок бота (простій, екстрений вихід, зауваження передачі). */
  async reasonOptions(
    kind: 'DOWNTIME' | 'EMERGENCY' | 'HANDOVER' | 'CORRECTION',
  ): Promise<{ code: string; label: string }[]> {
    return this.db
      .select({ code: reasonCodes.code, label: reasonCodes.label })
      .from(reasonCodes)
      .where(and(eq(reasonCodes.kind, kind), eq(reasonCodes.isActive, true)))
      .orderBy(asc(reasonCodes.sortOrder), asc(reasonCodes.code));
  }

  /** Причина простою з довідника; null, якщо коду немає або він вимкнений. */
  async reason(
    code: string,
    kind: 'DOWNTIME' | 'EMERGENCY' = 'DOWNTIME',
  ): Promise<ReasonRow | null> {
    const [row] = await this.db
      .select()
      .from(reasonCodes)
      .where(
        and(eq(reasonCodes.kind, kind), eq(reasonCodes.code, code), eq(reasonCodes.isActive, true)),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * «Сообщить о проблеме»: інцидент (новий або наявний) плюс, за відповіддю «Да», особистий
   * DOWNTIME у тій самій транзакції. Проблема без зупинки не створює простою (AC-08).
   */
  async report(
    employeeId: string,
    cmd: ReportProblemCommand,
    actor: Actor,
    source: EventSource = 'TELEGRAM',
    now: Date = new Date(),
  ): Promise<ReportProblemResult> {
    const replay = await this.replay(employeeId, cmd.idempotencyKey);
    if (replay) return replay;

    const reason = await this.reason(cmd.reasonCode);
    if (!reason) throw new DomainError('REASON_UNKNOWN', 422, 'Невідома причина простою');
    if (reason.requiresComment && !cmd.comment?.trim()) {
      throw new DomainError('COMMENT_REQUIRED', 422, 'Для цієї причини потрібен коментар');
    }
    const session = await this.shift.activeSession(employeeId);
    if (!session)
      throw new DomainError(
        'NO_ACTIVE_SHIFT',
        409,
        'A problem can be reported only during an open shift',
      );

    const place = session.assignmentId ? await this.placeOf(session.assignmentId) : null;
    const deferred: DeferredTimer[] = [];
    let scheduleSla: { id: string; dueAt: Date } | null = null;

    const result = await this.db.transaction(async (tx): Promise<ReportProblemResult> => {
      const candidates = session.zoneId
        ? await tx
            .select({
              id: downtimeIncidents.id,
              zoneId: downtimeIncidents.zoneId,
              reasonCode: downtimeIncidents.reasonCode,
              status: downtimeIncidents.status,
              openedAt: downtimeIncidents.openedAt,
            })
            .from(downtimeIncidents)
            .where(
              and(
                eq(downtimeIncidents.zoneId, session.zoneId),
                inArray(downtimeIncidents.status, OPEN),
              ),
            )
            .for('update')
        : [];
      const existing = findDuplicateCandidate(
        candidates,
        { zoneId: session.zoneId, reasonCode: cmd.reasonCode, reportedAt: now },
        this.options.duplicateWindowMinutes,
      );

      let incident: IncidentRow;
      if (existing) {
        const [row] = await tx
          .update(downtimeIncidents)
          .set({
            reportsCount: sql`${downtimeIncidents.reportsCount} + 1`,
            lastComment: cmd.comment ?? sql`${downtimeIncidents.lastComment}`,
            updatedAt: now,
          })
          .where(eq(downtimeIncidents.id, existing.id))
          .returning();
        if (!row) throw new Error('downtime_incidents: update не повернув рядок');
        incident = row;
      } else {
        const severity: IncidentSeverity = reason.severity;
        const dueAt = slaDueAt(now, severity, this.options.sla);
        const [row] = await tx
          .insert(downtimeIncidents)
          .values({
            siteId: place?.siteId ?? null,
            orgUnitId: place?.orgUnitId ?? null,
            zoneId: session.zoneId,
            reasonCode: cmd.reasonCode,
            severity,
            status: 'REPORTED',
            openedAt: now,
            slaDueAt: dueAt,
            escalatedAt: escalatesImmediately(severity) ? now : null,
            reportsCount: 1,
            lastComment: cmd.comment ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new Error('downtime_incidents: insert не повернув рядок');
        incident = row;
        await tx.insert(incidentStatusHistory).values({
          incidentId: incident.id,
          fromStatus: null,
          toStatus: 'REPORTED',
          actorType: actor.type,
          actorId: actor.id,
          at: now,
          comment: cmd.comment ?? null,
        });
        if (!escalatesImmediately(severity)) scheduleSla = { id: incident.id, dueAt };
      }

      const [report] = await tx
        .insert(downtimeReports)
        .values({
          incidentId: incident.id,
          shiftSessionId: session.id,
          employeeId,
          zoneId: session.zoneId,
          reasonCode: cmd.reasonCode,
          comment: cmd.comment ?? null,
          stoppedWork: cmd.stoppedWork,
          reportedAt: now,
          telegramFileId: cmd.photoFileId ?? null,
        })
        .returning();
      if (!report) throw new Error('downtime_reports: insert не повернув рядок');

      await this.events.append(tx, {
        type: existing ? 'INCIDENT_REPORT_LINKED' : 'INCIDENT_REPORTED',
        source,
        actor,
        occurredAt: now,
        employeeId,
        shiftSessionId: session.id,
        zoneId: session.zoneId,
        incidentId: incident.id,
        reasonCode: cmd.reasonCode,
        comment: cmd.comment ?? null,
        payload: {
          reportId: report.id,
          stoppedWork: cmd.stoppedWork,
          severity: incident.severity,
          hasPhoto: cmd.photoFileId !== undefined,
          notifyMaster: reason.notifyMaster,
        },
      });
      if (!existing && escalatesImmediately(incident.severity)) {
        await this.events.append(tx, {
          type: 'INCIDENT_ESCALATED',
          source: 'SYSTEM',
          actor: { type: 'SYSTEM', id: null, role: 'SYSTEM' },
          occurredAt: now,
          employeeId,
          incidentId: incident.id,
          zoneId: session.zoneId,
          reasonCode: cmd.reasonCode,
          payload: { immediate: true, severity: incident.severity },
        });
      }

      let downtimeStarted = false;
      let downtimeError: string | null = null;
      if (cmd.stoppedWork) {
        const transition = await this.shift.transitionWithin(
          tx,
          employeeId,
          {
            action: 'START_DOWNTIME',
            expectedVersion: session.version,
            idempotencyKey: `${cmd.idempotencyKey}:downtime`,
            reasonCode: cmd.reasonCode,
            ...(cmd.comment !== undefined ? { comment: cmd.comment } : {}),
          },
          { actor, source, now },
          deferred,
        );
        downtimeStarted = transition.ok;
        downtimeError = transition.ok ? null : transition.error;
        if (transition.ok) deferred.push(() => this.shift.settle(transition, []));
      }

      const response: ReportProblemResult = {
        incidentId: incident.id,
        linkedToExisting: existing !== null,
        severity: incident.severity,
        downtimeStarted,
        downtimeError,
        serverTime: now.toISOString(),
      };
      await tx.insert(idempotencyKeys).values({
        scope: `incident:${employeeId}`,
        key: cmd.idempotencyKey,
        requestHash: `${cmd.reasonCode}:${cmd.stoppedWork}`,
        response: response as unknown as Record<string, unknown>,
      });
      return response;
    });

    for (const run of deferred) await run();
    if (scheduleSla) {
      const { id, dueAt } = scheduleSla;
      await this.timers.scheduleIncidentSla(id, dueAt);
    }
    this.changes.publish({
      incidentId: result.incidentId,
      status: 'REPORTED',
      severity: result.severity,
      at: now.toISOString(),
    });
    return result;
  }

  /** Дія майстра над статусом (FR-DWN-05): таблиця переходів, історія, аудит, сповіщення. */
  async transition(
    id: string,
    cmd: IncidentTransitionCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<IncidentView> {
    const needsComment = cmd.to === 'REJECTED' || cmd.to === 'RESOLVED';
    if (needsComment && !(cmd.comment && cmd.comment.trim().length >= 3)) {
      throw new DomainError('COMMENT_REQUIRED', 422, 'Для цієї дії потрібен коментар');
    }
    const updated = await this.db.transaction(async (tx) => {
      const [incident] = await tx
        .select()
        .from(downtimeIncidents)
        .where(eq(downtimeIncidents.id, id))
        .for('update');
      if (!incident) throw new DomainError('INCIDENT_NOT_FOUND', 404, 'Інцидент не знайдено');
      if (!canTransitionIncident(incident.status, cmd.to)) {
        throw new DomainError(
          'INCIDENT_TRANSITION_NOT_ALLOWED',
          409,
          `Перехід ${incident.status} → ${cmd.to} не дозволений`,
        );
      }
      let duplicateOfId: string | null = null;
      if (cmd.to === 'DUPLICATE') {
        if (!cmd.duplicateOfId || cmd.duplicateOfId === id) {
          throw new DomainError(
            'DUPLICATE_TARGET_REQUIRED',
            422,
            'Вкажіть інцидент, дублем якого є цей',
          );
        }
        const [primary] = await tx
          .select({ id: downtimeIncidents.id, status: downtimeIncidents.status })
          .from(downtimeIncidents)
          .where(eq(downtimeIncidents.id, cmd.duplicateOfId))
          .limit(1);
        if (!primary || primary.status === 'DUPLICATE') {
          throw new DomainError('DUPLICATE_TARGET_INVALID', 422, 'Цільовий інцидент не підходить');
        }
        duplicateOfId = primary.id;
      }

      const patch: Partial<IncidentRow> = { status: cmd.to, updatedAt: now };
      if (cmd.comment) patch.lastComment = cmd.comment;
      if (cmd.to === 'ACKNOWLEDGED' || cmd.to === 'IN_PROGRESS') {
        if (!incident.acknowledgedAt) patch.acknowledgedAt = now;
        if (cmd.to === 'ACKNOWLEDGED') patch.resolvedAt = null;
      }
      if (cmd.to === 'RESOLVED') {
        patch.resolvedAt = now;
        if (!incident.acknowledgedAt) patch.acknowledgedAt = now;
      }
      if (cmd.to === 'IN_PROGRESS' && incident.status === 'RESOLVED') patch.resolvedAt = null;
      if (cmd.to === 'CLOSED' || cmd.to === 'REJECTED' || cmd.to === 'DUPLICATE') {
        patch.closedAt = now;
        if (cmd.to === 'DUPLICATE') patch.duplicateOfId = duplicateOfId;
      }
      const [row] = await tx
        .update(downtimeIncidents)
        .set(patch)
        .where(eq(downtimeIncidents.id, id))
        .returning();
      if (!row) throw new Error('downtime_incidents: update не повернув рядок');

      await tx.insert(incidentStatusHistory).values({
        incidentId: id,
        fromStatus: incident.status,
        toStatus: cmd.to,
        actorType: actor.type,
        actorId: actor.id,
        at: now,
        comment: cmd.comment ?? null,
      });
      await this.events.append(tx, {
        type: 'INCIDENT_STATUS_CHANGED',
        source: 'WEB',
        actor,
        occurredAt: now,
        incidentId: id,
        zoneId: incident.zoneId,
        reasonCode: incident.reasonCode,
        comment: cmd.comment ?? null,
        payload: { from: incident.status, to: cmd.to, duplicateOfId },
      });
      await this.audit.record(tx, {
        actor,
        action: `incident.${cmd.to.toLowerCase()}`,
        objectType: 'downtime_incident',
        objectId: id,
        before: { status: incident.status },
        after: { status: cmd.to, duplicateOfId },
        reason: cmd.comment ?? null,
      });

      // Рішення інциденту не закриває особистий простій: працівник сам повертається (FR-DWN-06).
      if (cmd.to === 'RESOLVED' || cmd.to === 'CLOSED') {
        const stopped = await tx
          .selectDistinct({ employeeId: downtimeReports.employeeId })
          .from(downtimeReports)
          .innerJoin(shiftSessions, eq(downtimeReports.shiftSessionId, shiftSessions.id))
          .where(and(eq(downtimeReports.incidentId, id), eq(shiftSessions.state, 'DOWNTIME')));
        for (const s of stopped) {
          await this.notifications.enqueue(tx, {
            recipientType: 'EMPLOYEE',
            recipientId: s.employeeId,
            template: 'INCIDENT_RESOLVED',
            payload: (t) => ({ text: t.incidents.resolvedNotice }),
            dedupeKey: `incident-resolved:${id}:${s.employeeId}:${cmd.to}`,
          });
        }
      }
      return row;
    });

    if (!isOpenIncident(updated.status)) await this.timers.cancel(incidentSlaJobId(id));
    this.changes.publish({
      incidentId: id,
      status: updated.status,
      severity: updated.severity,
      at: now.toISOString(),
    });
    return (await this.view(id, now)) as IncidentView;
  }

  /**
   * Критичне зауваження приймаючої зміни створює інцидент і сповіщає майстра (FR-HND-04).
   * Викликається всередині транзакції передачі; SSE публікується викликачем після коміту.
   */
  async openFromReview(
    tx: DbOrTx,
    input: {
      employeeId: string;
      shiftSessionId: string;
      zoneId: string;
      reasonCode: string;
      severity: IncidentSeverity;
      comment: string;
      siteId: string | null;
      orgUnitId: string | null;
      actor: Actor;
      now: Date;
    },
  ): Promise<string> {
    const dueAt = slaDueAt(input.now, input.severity, this.options.sla);
    const [incident] = await tx
      .insert(downtimeIncidents)
      .values({
        siteId: input.siteId,
        orgUnitId: input.orgUnitId,
        zoneId: input.zoneId,
        reasonCode: input.reasonCode,
        severity: input.severity,
        status: 'REPORTED',
        openedAt: input.now,
        slaDueAt: dueAt,
        escalatedAt: escalatesImmediately(input.severity) ? input.now : null,
        reportsCount: 1,
        lastComment: input.comment,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!incident) throw new Error('downtime_incidents: insert не повернув рядок');
    await tx.insert(incidentStatusHistory).values({
      incidentId: incident.id,
      fromStatus: null,
      toStatus: 'REPORTED',
      actorType: input.actor.type,
      actorId: input.actor.id,
      at: input.now,
      comment: input.comment,
    });
    await tx.insert(downtimeReports).values({
      incidentId: incident.id,
      shiftSessionId: input.shiftSessionId,
      employeeId: input.employeeId,
      zoneId: input.zoneId,
      reasonCode: input.reasonCode,
      comment: input.comment,
      stoppedWork: false,
      reportedAt: input.now,
    });
    await this.events.append(tx, {
      type: 'INCIDENT_REPORTED',
      source: 'TELEGRAM',
      actor: input.actor,
      occurredAt: input.now,
      employeeId: input.employeeId,
      shiftSessionId: input.shiftSessionId,
      zoneId: input.zoneId,
      incidentId: incident.id,
      reasonCode: input.reasonCode,
      comment: input.comment,
      payload: { origin: 'HANDOVER_REVIEW', severity: input.severity },
    });
    return incident.id;
  }

  /** Уточнення причини або призначення відповідального (FR-DWN-05). */
  async update(
    id: string,
    cmd: IncidentUpdateCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<IncidentView> {
    const reason = cmd.reasonCode ? await this.reason(cmd.reasonCode) : null;
    if (cmd.reasonCode && !reason)
      throw new DomainError('REASON_UNKNOWN', 422, 'Невідома причина простою');
    await this.db.transaction(async (tx) => {
      const [incident] = await tx
        .select()
        .from(downtimeIncidents)
        .where(eq(downtimeIncidents.id, id))
        .for('update');
      if (!incident) throw new DomainError('INCIDENT_NOT_FOUND', 404, 'Інцидент не знайдено');
      await tx
        .update(downtimeIncidents)
        .set({
          ...(reason ? { reasonCode: reason.code, severity: reason.severity } : {}),
          ...(cmd.assigneeId !== undefined ? { assigneeId: cmd.assigneeId } : {}),
          lastComment: cmd.comment,
          updatedAt: now,
        })
        .where(eq(downtimeIncidents.id, id));
      await this.events.append(tx, {
        type: 'INCIDENT_UPDATED',
        source: 'WEB',
        actor,
        occurredAt: now,
        incidentId: id,
        reasonCode: reason?.code ?? incident.reasonCode,
        comment: cmd.comment,
        payload: {
          reasonCode: { from: incident.reasonCode, to: reason?.code ?? incident.reasonCode },
          assigneeId: cmd.assigneeId ?? incident.assigneeId,
        },
      });
      await this.audit.record(tx, {
        actor,
        action: 'incident.update',
        objectType: 'downtime_incident',
        objectId: id,
        before: { reasonCode: incident.reasonCode, assigneeId: incident.assigneeId },
        after: {
          reasonCode: reason?.code ?? incident.reasonCode,
          assigneeId: cmd.assigneeId ?? incident.assigneeId,
        },
        reason: cmd.comment,
      });
    });
    const view = (await this.view(id, now)) as IncidentView;
    this.changes.publish({
      incidentId: id,
      status: view.status,
      severity: view.severity,
      at: now.toISOString(),
    });
    return view;
  }

  /* ------------------------------------------------------------------ */
  /* Читання                                                             */
  /* ------------------------------------------------------------------ */

  async list(q: IncidentsQuery, now: Date = new Date()): Promise<IncidentView[]> {
    const conditions = [];
    if ((q.scope ?? 'open') === 'open') conditions.push(inArray(downtimeIncidents.status, OPEN));
    if (q.siteId) conditions.push(eq(downtimeIncidents.siteId, q.siteId));
    if (q.zoneId) conditions.push(eq(downtimeIncidents.zoneId, q.zoneId));
    const rows = await this.baseQuery()
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(downtimeIncidents.openedAt));
    return rows.map((r) => this.toView(r, now));
  }

  async detail(id: string, now: Date = new Date()): Promise<IncidentDetailView> {
    const incident = await this.view(id, now);
    if (!incident) throw new DomainError('INCIDENT_NOT_FOUND', 404, 'Інцидент не знайдено');
    const duplicateRows = await this.baseQuery()
      .where(eq(downtimeIncidents.duplicateOfId, id))
      .orderBy(asc(downtimeIncidents.openedAt));
    const ids = [id, ...duplicateRows.map((d) => d.i.id)];
    const [reports, history] = await Promise.all([
      this.db
        .select({ r: downtimeReports, fullName: employees.fullName })
        .from(downtimeReports)
        .innerJoin(employees, eq(downtimeReports.employeeId, employees.id))
        .where(inArray(downtimeReports.incidentId, ids))
        .orderBy(asc(downtimeReports.reportedAt)),
      this.db
        .select()
        .from(incidentStatusHistory)
        .where(eq(incidentStatusHistory.incidentId, id))
        .orderBy(asc(incidentStatusHistory.at)),
    ]);
    return {
      incident,
      reports: reports.map(({ r, fullName }) => toReportView(r, fullName)),
      history: history.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorType: h.actorType,
        actorId: h.actorId,
        at: h.at.toISOString(),
        comment: h.comment,
      })),
      duplicates: duplicateRows.map((r) => this.toView(r, now)),
      serverTime: now.toISOString(),
    };
  }

  /** Звіт по причинах і зонах за період (ТЗ 9.1): інциденти, повідомлення, хвилини простою, SLA. */
  async stats(
    q: IncidentStatsQuery,
    locale: Locale = DEFAULT_LOCALE,
    now: Date = new Date(),
  ): Promise<IncidentStatsView> {
    const from = new Date(q.from);
    const to = new Date(q.to);
    const scope = [gte(downtimeIncidents.openedAt, from), lt(downtimeIncidents.openedAt, to)];
    if (q.siteId) scope.push(eq(downtimeIncidents.siteId, q.siteId));

    const incidents = await this.db
      .select({
        id: downtimeIncidents.id,
        reasonCode: downtimeIncidents.reasonCode,
        zoneId: downtimeIncidents.zoneId,
        status: downtimeIncidents.status,
        openedAt: downtimeIncidents.openedAt,
        slaDueAt: downtimeIncidents.slaDueAt,
        acknowledgedAt: downtimeIncidents.acknowledgedAt,
        resolvedAt: downtimeIncidents.resolvedAt,
        reportsCount: downtimeIncidents.reportsCount,
      })
      .from(downtimeIncidents)
      .where(and(...scope));

    const downtime = await this.db
      .select({
        reasonCode: activityIntervals.reasonCode,
        zoneId: shiftSessions.zoneId,
        minutes:
          sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(${activityIntervals.endedAt}, ${sql`now()`}) - ${activityIntervals.startedAt})) / 60), 0)`.mapWith(
            Number,
          ),
      })
      .from(activityIntervals)
      .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
      .where(
        and(
          eq(activityIntervals.state, 'DOWNTIME'),
          gte(activityIntervals.startedAt, from),
          lt(activityIntervals.startedAt, to),
        ),
      )
      .groupBy(activityIntervals.reasonCode, shiftSessions.zoneId);

    const [reasons, zones] = await Promise.all([
      this.db
        .select({ code: reasonCodes.code, label: reasonCodes.label })
        .from(reasonCodes)
        .where(eq(reasonCodes.kind, 'DOWNTIME')),
      this.db
        .select({ id: responsibilityZones.id, name: responsibilityZones.name })
        .from(responsibilityZones),
    ]);
    const reasonLabel = new Map(reasons.map((r) => [r.code, r.label]));
    const zoneLabel = new Map(zones.map((z) => [z.id, z.name]));

    const build = (
      keyOf: (i: (typeof incidents)[number]) => string,
      labelOf: (k: string) => string,
      dtKey: (d: (typeof downtime)[number]) => string,
    ): IncidentStatsRow[] => {
      const rows = new Map<
        string,
        IncidentStatsRow & { resolutionSum: number; resolved: number }
      >();
      const get = (key: string) => {
        let row = rows.get(key);
        if (!row) {
          row = {
            key,
            label: labelOf(key),
            incidents: 0,
            reports: 0,
            downtimeMinutes: 0,
            avgResolutionMinutes: null,
            slaBreached: 0,
            resolutionSum: 0,
            resolved: 0,
          };
          rows.set(key, row);
        }
        return row;
      };
      for (const i of incidents) {
        if (i.status === 'DUPLICATE') continue;
        const row = get(keyOf(i));
        row.incidents += 1;
        row.reports += i.reportsCount;
        if (slaBreached(i, now)) row.slaBreached += 1;
        if (i.resolvedAt) {
          row.resolved += 1;
          row.resolutionSum += (i.resolvedAt.getTime() - i.openedAt.getTime()) / 60_000;
        }
      }
      for (const d of downtime) {
        const row = get(dtKey(d));
        row.downtimeMinutes += Math.round(d.minutes);
      }
      return [...rows.values()]
        .map(({ resolutionSum, resolved, ...row }) => ({
          ...row,
          avgResolutionMinutes: resolved > 0 ? Math.round(resolutionSum / resolved) : null,
        }))
        .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes || b.incidents - a.incidents);
    };

    const byReason = build(
      (i) => i.reasonCode,
      (k) => reasonLabel.get(k) ?? k,
      (d) => d.reasonCode ?? 'UNKNOWN',
    );
    const byZone = build(
      (i) => i.zoneId ?? 'NONE',
      (k) => zoneLabel.get(k) ?? (k === 'NONE' ? '—' : k),
      (d) => d.zoneId ?? 'NONE',
    );
    const totals = byReason.reduce<IncidentStatsRow>(
      (acc, r) => ({
        ...acc,
        incidents: acc.incidents + r.incidents,
        reports: acc.reports + r.reports,
        downtimeMinutes: acc.downtimeMinutes + r.downtimeMinutes,
        slaBreached: acc.slaBreached + r.slaBreached,
      }),
      {
        key: 'TOTAL',
        label: messages(locale).admin.incidents.totals,
        incidents: 0,
        reports: 0,
        downtimeMinutes: 0,
        avgResolutionMinutes: null,
        slaBreached: 0,
      },
    );
    const resolvedAll = incidents.filter((i) => i.resolvedAt && i.status !== 'DUPLICATE');
    totals.avgResolutionMinutes =
      resolvedAll.length > 0
        ? Math.round(
            resolvedAll.reduce(
              (s, i) => s + (i.resolvedAt!.getTime() - i.openedAt.getTime()) / 60_000,
              0,
            ) / resolvedAll.length,
          )
        : null;
    return { from: from.toISOString(), to: to.toISOString(), byReason, byZone, totals };
  }

  /* ------------------------------------------------------------------ */
  /* Допоміжне                                                           */
  /* ------------------------------------------------------------------ */

  private baseQuery() {
    const stoppedNow =
      sql<number>`(SELECT COUNT(DISTINCT ${downtimeReports.employeeId}) FROM ${downtimeReports} JOIN ${shiftSessions} ON ${shiftSessions.id} = ${downtimeReports.shiftSessionId} WHERE ${downtimeReports.incidentId} = ${downtimeIncidents.id} AND ${shiftSessions.state} = 'DOWNTIME')`.mapWith(
        Number,
      );
    return this.db
      .select({
        i: downtimeIncidents,
        zoneName: responsibilityZones.name,
        reasonLabel: reasonCodes.label,
        stoppedNow,
      })
      .from(downtimeIncidents)
      .leftJoin(responsibilityZones, eq(downtimeIncidents.zoneId, responsibilityZones.id))
      .leftJoin(
        reasonCodes,
        and(eq(reasonCodes.kind, 'DOWNTIME'), eq(reasonCodes.code, downtimeIncidents.reasonCode)),
      )
      .$dynamic();
  }

  private async view(id: string, now: Date): Promise<IncidentView | null> {
    const [row] = await this.baseQuery().where(eq(downtimeIncidents.id, id)).limit(1);
    return row ? this.toView(row, now) : null;
  }

  private toView(
    row: {
      i: IncidentRow;
      zoneName: string | null;
      reasonLabel: string | null;
      stoppedNow: number;
    },
    now: Date,
  ): IncidentView {
    const i = row.i;
    return {
      id: i.id,
      siteId: i.siteId,
      orgUnitId: i.orgUnitId,
      zoneId: i.zoneId,
      zoneName: row.zoneName,
      reasonCode: i.reasonCode,
      reasonLabel: row.reasonLabel ?? i.reasonCode,
      severity: i.severity,
      status: i.status,
      duplicateOfId: i.duplicateOfId,
      assigneeId: i.assigneeId,
      openedAt: i.openedAt.toISOString(),
      slaDueAt: i.slaDueAt.toISOString(),
      acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      closedAt: i.closedAt?.toISOString() ?? null,
      escalatedAt: i.escalatedAt?.toISOString() ?? null,
      slaBreached:
        isOpenIncident(i.status) || i.acknowledgedAt !== null ? slaBreached(i, now) : false,
      reportsCount: i.reportsCount,
      stoppedNow: row.stoppedNow,
      lastComment: i.lastComment,
    };
  }

  private async placeOf(
    assignmentId: string,
  ): Promise<{ siteId: string; orgUnitId: string } | null> {
    const [row] = await this.db
      .select({ orgUnitId: shiftAssignments.orgUnitId, siteId: orgUnits.siteId })
      .from(shiftAssignments)
      .innerJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .where(eq(shiftAssignments.id, assignmentId))
      .limit(1);
    return row ?? null;
  }

  private async replay(employeeId: string, key: string): Promise<ReportProblemResult | null> {
    const [row] = await this.db
      .select({ response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, `incident:${employeeId}`), eq(idempotencyKeys.key, key)))
      .limit(1);
    return row ? (row.response as unknown as ReportProblemResult) : null;
  }

  /** Скільки відкритих інцидентів: для бейджа на екрані майстра. */
  async openCount(): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(downtimeIncidents)
      .where(inArray(downtimeIncidents.status, OPEN));
    return row?.n ?? 0;
  }
}

function toReportView(r: typeof downtimeReports.$inferSelect, fullName: string): ReportView {
  return {
    id: r.id,
    incidentId: r.incidentId,
    shiftSessionId: r.shiftSessionId,
    employeeId: r.employeeId,
    fullName,
    zoneId: r.zoneId,
    reasonCode: r.reasonCode,
    comment: r.comment,
    stoppedWork: r.stoppedWork,
    reportedAt: r.reportedAt.toISOString(),
    hasPhoto: r.telegramFileId !== null || r.mediaObjectId !== null,
  };
}

export type { IncidentStatus };
