import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  assignmentAcknowledgements,
  desc,
  employees,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  max,
  ne,
  orgUnits,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
  sql,
  telegramAccounts,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  buildMonthPlan,
  diffSchedules,
  formatLocal,
  hasBlockingIssues,
  monthDates,
  nextScheduleStatus,
  planInstants,
  validateSchedule,
  type PlannedShift,
  type ScheduleAction,
  type ScheduleRules,
  type ValidationIssue,
} from '@vakhta/domain';
import type {
  AcknowledgementStatusView,
  AssignmentView,
  CreateScheduleVersionCommand,
  ListScheduleVersionsQuery,
  MyPlanView,
  PublishScheduleCommand,
  PutAssignmentsCommand,
  RemindResult,
  ReturnToDraftCommand,
  ScheduleVersionDetail,
  ScheduleVersionView,
  ValidationIssueView,
} from '@vakhta/contracts';
import { format, type Messages } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isForeignKeyViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { TIMER_SCHEDULER, type TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrgService } from '../org/org.service.js';
import { TemplatesService } from './templates.service.js';

export interface ScheduleOptions {
  readonly rules: ScheduleRules;
  readonly shiftReminderMinutes: number;
  readonly ackReminderHours: number;
  readonly defaultTimezone: string;
}

export const SCHEDULE_OPTIONS = Symbol('SCHEDULE_OPTIONS');

type VersionRow = typeof scheduleVersions.$inferSelect;
type AssignmentRow = typeof shiftAssignments.$inferSelect;

interface AssignmentWithTemplate {
  readonly a: AssignmentRow;
  readonly templateCode: string;
  readonly isNight: boolean;
  readonly acknowledgedAt: Date | null;
}

export interface NextShift {
  readonly assignmentId: string;
  readonly versionId: string;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
  readonly isNight: boolean;
  readonly zoneName: string | null;
  readonly timezone: string;
  readonly acknowledged: boolean;
}

function monthLabel(t: Messages, periodMonth: string): { month: string; year: string } {
  const [year, m] = periodMonth.split('-');
  return { month: t.schedule.months[Number(m) - 1] ?? periodMonth, year: year ?? '' };
}

/**
 * Версії графіка (ТЗ 3): чернетка, погодження, публікація, ознайомлення, «Мій план».
 * Опубліковані версії не редагуються; зміна є новою версією (FR-SCH-03).
 */
@Injectable()
export class ScheduleService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly org: OrgService,
    private readonly templates: TemplatesService,
    private readonly notifications: NotificationsService,
    @Inject(TIMER_SCHEDULER) private readonly timers: TimerScheduler,
    @Inject(SCHEDULE_OPTIONS) private readonly options: ScheduleOptions,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Версії                                                              */
  /* ------------------------------------------------------------------ */

  async list(query: ListScheduleVersionsQuery): Promise<ScheduleVersionView[]> {
    const conditions = [];
    if (query.siteId) conditions.push(eq(scheduleVersions.siteId, query.siteId));
    if (query.orgUnitId) conditions.push(eq(scheduleVersions.orgUnitId, query.orgUnitId));
    if (query.periodMonth) conditions.push(eq(scheduleVersions.periodMonth, query.periodMonth));
    const rows = await this.db
      .select({
        v: scheduleVersions,
        // Written as plain SQL: drizzle drops the table qualifier of columns in a single-table
        // select, which makes `schedule_versions.id` ambiguous inside the subqueries.
        count: sql<number>`(select count(*)::int from shift_assignments sa where sa.schedule_version_id = schedule_versions.id and sa.status = 'PLANNED')`,
        worked: sql<boolean>`exists (select 1 from shift_sessions ss join shift_assignments sa on ss.assignment_id = sa.id where sa.schedule_version_id = schedule_versions.id)`,
      })
      .from(scheduleVersions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(scheduleVersions.periodMonth), desc(scheduleVersions.versionNo))
      .limit(200);
    return rows.map((r) => this.toVersionView(r.v, r.count, r.worked));
  }

  async createVersion(
    cmd: CreateScheduleVersionCommand,
    actor: Actor,
  ): Promise<ScheduleVersionView> {
    await this.org.requireOrgUnit(cmd.orgUnitId, cmd.siteId);
    return this.db.transaction(async (tx) => {
      const [agg] = await tx
        .select({ maxNo: max(scheduleVersions.versionNo) })
        .from(scheduleVersions)
        .where(
          and(
            eq(scheduleVersions.siteId, cmd.siteId),
            eq(scheduleVersions.orgUnitId, cmd.orgUnitId),
            eq(scheduleVersions.periodMonth, cmd.periodMonth),
          ),
        );
      const versionNo = (agg?.maxNo ?? 0) + 1;

      let source: VersionRow | null = null;
      if (cmd.basedOnVersionId) {
        source = await this.requireVersion(cmd.basedOnVersionId, tx);
      } else {
        source = await this.publishedFor(cmd.siteId, cmd.orgUnitId, cmd.periodMonth, tx);
      }

      const [row] = await tx
        .insert(scheduleVersions)
        .values({
          siteId: cmd.siteId,
          orgUnitId: cmd.orgUnitId,
          periodMonth: cmd.periodMonth,
          versionNo,
          createdBy: actor.id,
        })
        .returning();
      if (!row) throw new Error('schedule_versions: insert не повернув рядок');

      let copied = 0;
      if (source) {
        const rows = await tx
          .select()
          .from(shiftAssignments)
          .where(
            and(
              eq(shiftAssignments.scheduleVersionId, source.id),
              eq(shiftAssignments.status, 'PLANNED'),
            ),
          );
        if (rows.length > 0) {
          await tx.insert(shiftAssignments).values(
            rows.map((a) => ({
              scheduleVersionId: row.id,
              employeeId: a.employeeId,
              templateId: a.templateId,
              businessDate: a.businessDate,
              planStartAt: a.planStartAt,
              planEndAt: a.planEndAt,
              positionId: a.positionId,
              orgUnitId: a.orgUnitId,
              teamId: a.teamId,
              zoneId: a.zoneId,
              kind: a.kind,
            })),
          );
          copied = rows.length;
        }
      }

      await this.events.append(tx, {
        type: 'SCHEDULE_VERSION_CREATED',
        source: 'WEB',
        actor,
        scheduleVersionId: row.id,
        payload: { periodMonth: cmd.periodMonth, versionNo, basedOn: source?.id ?? null, copied },
      });
      await this.audit.record(tx, {
        actor,
        action: 'schedule.version.create',
        objectType: 'schedule_version',
        objectId: row.id,
        after: { periodMonth: cmd.periodMonth, versionNo, basedOn: source?.id ?? null },
      });
      return this.toVersionView(row, copied);
    });
  }

  /** Only a draft can go: published and superseded versions are history (spec 3.2). */
  /**
   * Drafts and superseded versions can be deleted (spec 3.2 keeps the published one as the live
   * schedule). A superseded version whose assignments were worked stays as history.
   */
  async deleteVersion(id: string, actor: Actor): Promise<void> {
    try {
      await this.deleteVersionWithin(id, actor);
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        throw new DomainError(
          'SCHEDULE_VERSION_IN_USE',
          409,
          `Version ${id} is referenced by other records and stays as history`,
        );
      }
      throw e;
    }
  }

  private async deleteVersionWithin(id: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const version = await this.requireVersion(id, tx);
      if (version.status !== 'DRAFT' && version.status !== 'SUPERSEDED') {
        throw new DomainError(
          'SCHEDULE_TRANSITION_NOT_ALLOWED',
          409,
          `Only a draft or a superseded version can be deleted; version ${id} is ${version.status}`,
        );
      }
      if (await this.hasWorkedShifts(version.id, tx)) {
        throw new DomainError(
          'SCHEDULE_VERSION_IN_USE',
          409,
          `Version ${id} has worked shifts and stays as history`,
        );
      }
      await tx
        .delete(assignmentAcknowledgements)
        .where(eq(assignmentAcknowledgements.scheduleVersionId, version.id));
      await tx.delete(shiftAssignments).where(eq(shiftAssignments.scheduleVersionId, version.id));
      await tx.delete(scheduleVersions).where(eq(scheduleVersions.id, version.id));
      await this.events.append(tx, {
        type: 'SCHEDULE_VERSION_DELETED',
        source: 'WEB',
        actor,
        scheduleVersionId: version.id,
        payload: {
          periodMonth: version.periodMonth,
          versionNo: version.versionNo,
          status: version.status,
        },
      });
      await this.audit.record(tx, {
        actor,
        action: 'schedule.version.delete',
        objectType: 'schedule_version',
        objectId: version.id,
        before: {
          periodMonth: version.periodMonth,
          versionNo: version.versionNo,
          status: version.status,
        },
      });
    });
  }

  async detail(id: string): Promise<ScheduleVersionDetail> {
    const version = await this.requireVersion(id);
    const assignments = await this.loadAssignments(id);
    const issues = await this.validateRows(version, assignments);
    return {
      version: this.toVersionView(
        version,
        assignments.filter((x) => x.a.status === 'PLANNED').length,
        await this.hasWorkedShifts(id),
      ),
      assignments: assignments.map((x) => this.toAssignmentView(x)),
      issues,
    };
  }

  async requireVersion(id: string, tx: DbOrTx = this.db): Promise<VersionRow> {
    const [row] = await tx
      .select()
      .from(scheduleVersions)
      .where(eq(scheduleVersions.id, id))
      .limit(1);
    if (!row) throw new DomainError('SCHEDULE_VERSION_NOT_FOUND', 404, `Версію ${id} не знайдено`);
    return row;
  }

  /* ------------------------------------------------------------------ */
  /* Призначення                                                         */
  /* ------------------------------------------------------------------ */

  /** Повна заміна призначень чернетки (FR-SCH-05: працівник сам себе не призначає). */
  async putAssignments(
    id: string,
    cmd: PutAssignmentsCommand,
    actor: Actor,
  ): Promise<ScheduleVersionDetail> {
    return this.db.transaction(async (tx) => {
      const [version] = await tx
        .select()
        .from(scheduleVersions)
        .where(eq(scheduleVersions.id, id))
        .for('update');
      if (!version)
        throw new DomainError('SCHEDULE_VERSION_NOT_FOUND', 404, `Версію ${id} не знайдено`);
      if (version.status !== 'DRAFT') {
        throw new DomainError(
          'SCHEDULE_NOT_EDITABLE',
          409,
          'Редагувати можна лише чернетку; створіть нову версію',
        );
      }
      const site = await this.org.requireSite(version.siteId, tx);
      const templates = await this.templates.activeBySite(version.siteId, tx);

      const employeeIds = [...new Set(cmd.items.map((i) => i.employeeId))];
      const activeEmployees = employeeIds.length
        ? await tx
            .select({ id: employees.id, status: employees.status })
            .from(employees)
            .where(inArray(employees.id, employeeIds))
        : [];
      const activeSet = new Set(
        activeEmployees.filter((e) => e.status === 'ACTIVE').map((e) => e.id),
      );

      const zoneIds = [...new Set(cmd.items.map((i) => i.zoneId).filter((z): z is string => !!z))];
      const zones = zoneIds.length
        ? await tx
            .select()
            .from(responsibilityZones)
            .where(inArray(responsibilityZones.id, zoneIds))
        : [];
      const zoneMap = new Map(zones.map((z) => [z.id, z]));

      const seen = new Set<string>();
      const values = cmd.items.map((item) => {
        if (!activeSet.has(item.employeeId)) {
          throw new DomainError(
            'EMPLOYEE_NOT_ACTIVE',
            422,
            `Працівник ${item.employeeId} не активний або не існує`,
          );
        }
        const template = templates.get(item.templateId);
        if (!template)
          throw new DomainError(
            'TEMPLATE_NOT_FOUND',
            422,
            `Шаблон ${item.templateId} не належить майданчику`,
          );
        if (item.zoneId) {
          const zone = zoneMap.get(item.zoneId);
          if (!zone || zone.orgUnitId !== version.orgUnitId) {
            throw new DomainError(
              'ZONE_MISMATCH',
              422,
              `Зона ${item.zoneId} не належить підрозділу версії`,
            );
          }
        }
        if (!item.businessDate.startsWith(version.periodMonth)) {
          throw new DomainError(
            'DATE_OUTSIDE_PERIOD',
            422,
            `Дата ${item.businessDate} поза місяцем ${version.periodMonth}`,
          );
        }
        const key = `${item.employeeId}:${item.businessDate}`;
        if (seen.has(key))
          throw new DomainError(
            'DUPLICATE_ASSIGNMENT',
            422,
            `Дві зміни для працівника ${item.employeeId} на ${item.businessDate}`,
          );
        seen.add(key);

        const plan = planInstants(item.businessDate, template, site.timezone);
        return {
          scheduleVersionId: version.id,
          employeeId: item.employeeId,
          templateId: item.templateId,
          businessDate: item.businessDate,
          planStartAt: plan.planStartAt,
          planEndAt: plan.planEndAt,
          positionId: item.positionId ?? null,
          orgUnitId: version.orgUnitId,
          teamId: item.teamId ?? null,
          zoneId: item.zoneId ?? null,
          kind: item.kind,
        };
      });

      await tx.delete(shiftAssignments).where(eq(shiftAssignments.scheduleVersionId, version.id));
      if (values.length > 0) await tx.insert(shiftAssignments).values(values);
      await tx
        .update(scheduleVersions)
        .set({ updatedAt: new Date() })
        .where(eq(scheduleVersions.id, version.id));

      await this.events.append(tx, {
        type: 'SCHEDULE_ASSIGNMENTS_REPLACED',
        source: 'WEB',
        actor,
        scheduleVersionId: version.id,
        payload: { count: values.length, employees: employeeIds.length },
      });
      await this.audit.record(tx, {
        actor,
        action: 'schedule.assignments.replace',
        objectType: 'schedule_version',
        objectId: version.id,
        after: { count: values.length },
      });

      const assignments = await this.loadAssignments(version.id, tx);
      const issues = await this.validateRows(version, assignments, tx);
      return {
        version: this.toVersionView(version, values.length),
        assignments: assignments.map((x) => this.toAssignmentView(x)),
        issues,
      };
    });
  }

  async validate(id: string): Promise<ValidationIssueView[]> {
    const version = await this.requireVersion(id);
    return this.validateRows(version, await this.loadAssignments(id));
  }

  /* ------------------------------------------------------------------ */
  /* Життєвий цикл                                                       */
  /* ------------------------------------------------------------------ */

  async submit(id: string, actor: Actor): Promise<ScheduleVersionView> {
    return this.transition(id, 'SUBMIT', actor, {
      requireNoErrors: true,
      set: { submittedAt: new Date() },
    });
  }

  async returnToDraft(
    id: string,
    cmd: ReturnToDraftCommand,
    actor: Actor,
  ): Promise<ScheduleVersionView> {
    return this.transition(id, 'RETURN', actor, {
      comment: cmd.comment,
      set: { submittedAt: null },
    });
  }

  /**
   * Публікація (ТЗ 3.2, FR-SCH-03): попередня опублікована версія стає SUPERSEDED, працівники
   * отримують нотифікацію з кнопкою «Ознайомлений», ставляться нагадування.
   */
  async publish(
    id: string,
    cmd: PublishScheduleCommand,
    actor: Actor,
  ): Promise<ScheduleVersionView> {
    const now = new Date();
    const result = await this.db.transaction(async (tx) => {
      const [version] = await tx
        .select()
        .from(scheduleVersions)
        .where(eq(scheduleVersions.id, id))
        .for('update');
      if (!version)
        throw new DomainError('SCHEDULE_VERSION_NOT_FOUND', 404, `Версію ${id} не знайдено`);
      const next = nextScheduleStatus(version.status, 'PUBLISH');
      if (!next)
        throw new DomainError(
          'SCHEDULE_TRANSITION_NOT_ALLOWED',
          409,
          `Публікація неможлива зі статусу ${version.status}`,
        );

      const assignments = await this.loadAssignments(version.id, tx);
      const issues = await this.validateRows(version, assignments, tx);
      if (hasBlockingIssues(issues)) {
        throw new DomainError(
          'SCHEDULE_HAS_ERRORS',
          422,
          'Версія має помилки валідації; виправте перед публікацією',
        );
      }

      const previous = await this.publishedFor(
        version.siteId,
        version.orgUnitId,
        version.periodMonth,
        tx,
        true,
      );
      const previousShifts = previous
        ? this.toPlanned(await this.loadAssignments(previous.id, tx))
        : [];
      if (previous) {
        await tx
          .update(scheduleVersions)
          .set({ status: 'SUPERSEDED', updatedAt: now })
          .where(eq(scheduleVersions.id, previous.id));
        await this.events.append(tx, {
          type: 'SCHEDULE_VERSION_SUPERSEDED',
          source: 'WEB',
          actor,
          scheduleVersionId: previous.id,
          payload: { supersededBy: version.id },
        });
      }

      const [updated] = await tx
        .update(scheduleVersions)
        .set({
          status: 'PUBLISHED',
          publishedAt: now,
          approvedBy: actor.id,
          supersedesId: previous?.id ?? null,
          changeReason: cmd.changeReason ?? null,
          updatedAt: now,
        })
        .where(eq(scheduleVersions.id, version.id))
        .returning();
      if (!updated) throw new Error('schedule_versions: update не повернув рядок');

      const nextShifts = this.toPlanned(assignments);
      const diff = diffSchedules(previousShifts, nextShifts);
      const affected = [...diff.keys()];

      const linked = affected.length
        ? await tx
            .select({ employeeId: telegramAccounts.employeeId })
            .from(telegramAccounts)
            .where(
              and(
                inArray(telegramAccounts.employeeId, affected),
                eq(telegramAccounts.status, 'ACTIVE'),
              ),
            )
        : [];
      const linkedSet = new Set(linked.map((l) => l.employeeId));
      let notified = 0;
      for (const employeeId of affected) {
        if (!linkedSet.has(employeeId)) continue;
        const changes = diff.get(employeeId)!;
        const employeeShifts = nextShifts.filter((s) => s.employeeId === employeeId);
        const queued = await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: employeeId,
          template: previous ? 'SCHEDULE_CHANGED' : 'SCHEDULE_PUBLISHED',
          payload: (t) => ({
            text: previous
              ? format(t.schedule.changed, {
                  ...monthLabel(t, version.periodMonth),
                  added: changes.added.length,
                  removed: changes.removed.length,
                  changed: changes.changed.length,
                })
              : format(t.schedule.published, {
                  ...monthLabel(t, version.periodMonth),
                  shifts: employeeShifts.length,
                }),
            buttons: [[{ text: t.schedule.ackButton, callbackData: `ack:${version.id}` }]],
          }),
          dedupeKey: `schedule:${version.id}:${employeeId}`,
        });
        if (queued) notified += 1;
      }

      await this.events.append(tx, {
        type: 'SCHEDULE_PUBLISHED',
        source: 'WEB',
        actor,
        scheduleVersionId: version.id,
        comment: cmd.changeReason ?? null,
        payload: {
          supersedes: previous?.id ?? null,
          assignments: nextShifts.length,
          affected: affected.length,
          notified,
        },
      });
      await this.audit.record(tx, {
        actor,
        action: 'schedule.version.publish',
        objectType: 'schedule_version',
        objectId: version.id,
        before: { status: version.status },
        after: { status: 'PUBLISHED', supersedes: previous?.id ?? null },
        reason: cmd.changeReason ?? null,
      });
      return { updated, nextShifts };
    });

    // Таймери живуть у Redis, поза транзакцією; воркер перевіряє актуальність при спрацюванні.
    const reminderMs = this.options.shiftReminderMinutes * 60_000;
    for (const s of result.nextShifts) {
      await this.timers.scheduleShiftReminder(s.id, new Date(s.planStartAt.getTime() - reminderMs));
    }
    const ackAt = new Date(now.getTime() + this.options.ackReminderHours * 3_600_000);
    for (const employeeId of new Set(result.nextShifts.map((s) => s.employeeId))) {
      await this.timers.scheduleAckReminder(result.updated.id, employeeId, ackAt);
    }
    return this.toVersionView(result.updated, result.nextShifts.length);
  }

  private async transition(
    id: string,
    action: ScheduleAction,
    actor: Actor,
    opts: {
      requireNoErrors?: boolean;
      comment?: string;
      set?: Partial<typeof scheduleVersions.$inferInsert>;
    },
  ): Promise<ScheduleVersionView> {
    return this.db.transaction(async (tx) => {
      const [version] = await tx
        .select()
        .from(scheduleVersions)
        .where(eq(scheduleVersions.id, id))
        .for('update');
      if (!version)
        throw new DomainError('SCHEDULE_VERSION_NOT_FOUND', 404, `Версію ${id} не знайдено`);
      const next = nextScheduleStatus(version.status, action);
      if (!next)
        throw new DomainError(
          'SCHEDULE_TRANSITION_NOT_ALLOWED',
          409,
          `Дія ${action} неможлива зі статусу ${version.status}`,
        );

      const assignments = await this.loadAssignments(version.id, tx);
      if (opts.requireNoErrors) {
        const issues = await this.validateRows(version, assignments, tx);
        if (hasBlockingIssues(issues)) {
          throw new DomainError(
            'SCHEDULE_HAS_ERRORS',
            422,
            'Версія має помилки валідації; виправте перед поданням',
          );
        }
        if (assignments.length === 0) {
          throw new DomainError('SCHEDULE_EMPTY', 422, 'Порожню версію подати не можна');
        }
      }
      const [updated] = await tx
        .update(scheduleVersions)
        .set({ ...opts.set, status: next, updatedAt: new Date() })
        .where(eq(scheduleVersions.id, version.id))
        .returning();
      if (!updated) throw new Error('schedule_versions: update не повернув рядок');

      await this.events.append(tx, {
        type: `SCHEDULE_${action}`,
        source: 'WEB',
        actor,
        scheduleVersionId: version.id,
        comment: opts.comment ?? null,
        payload: { from: version.status, to: next },
      });
      await this.audit.record(tx, {
        actor,
        action: `schedule.version.${action.toLowerCase()}`,
        objectType: 'schedule_version',
        objectId: version.id,
        before: { status: version.status },
        after: { status: next },
        reason: opts.comment ?? null,
      });
      return this.toVersionView(updated, assignments.length);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Ознайомлення і «Мій план»                                           */
  /* ------------------------------------------------------------------ */

  /** «Ознайомлений» по всіх запланованих змінах працівника у версії (ТЗ 3.2). */
  async acknowledge(
    versionId: string,
    employeeId: string,
    source: 'TELEGRAM' | 'WEB',
  ): Promise<{ acknowledged: number; total: number }> {
    return this.db.transaction(async (tx) => {
      const version = await this.requireVersion(versionId, tx);
      if (version.status !== 'PUBLISHED') {
        throw new DomainError(
          'SCHEDULE_NOT_PUBLISHED',
          409,
          'Ознайомитись можна лише з опублікованою версією',
        );
      }
      const rows = await tx
        .select({ id: shiftAssignments.id })
        .from(shiftAssignments)
        .where(
          and(
            eq(shiftAssignments.scheduleVersionId, versionId),
            eq(shiftAssignments.employeeId, employeeId),
            eq(shiftAssignments.status, 'PLANNED'),
          ),
        );
      if (rows.length === 0) return { acknowledged: 0, total: 0 };
      const inserted = await tx
        .insert(assignmentAcknowledgements)
        .values(
          rows.map((r) => ({
            assignmentId: r.id,
            employeeId,
            scheduleVersionId: versionId,
            source,
          })),
        )
        .onConflictDoNothing({ target: assignmentAcknowledgements.assignmentId })
        .returning({ id: assignmentAcknowledgements.id });
      if (inserted.length > 0) {
        await this.events.append(tx, {
          type: 'SCHEDULE_ACKNOWLEDGED',
          source: source === 'TELEGRAM' ? 'TELEGRAM' : 'WEB',
          actor: { type: 'EMPLOYEE', id: employeeId, role: 'EMPLOYEE' },
          employeeId,
          scheduleVersionId: versionId,
          payload: { assignments: inserted.length },
        });
      }
      return { acknowledged: inserted.length, total: rows.length };
    });
  }

  /** Усі опубліковані версії, де у працівника є непідтверджені зміни. */
  async unacknowledgedVersions(
    employeeId: string,
  ): Promise<{ versionId: string; periodMonth: string }[]> {
    const rows = await this.db
      .selectDistinct({ versionId: scheduleVersions.id, periodMonth: scheduleVersions.periodMonth })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .leftJoin(
        assignmentAcknowledgements,
        eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
      )
      .where(
        and(
          eq(shiftAssignments.employeeId, employeeId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          isNull(assignmentAcknowledgements.id),
        ),
      );
    return rows;
  }

  /**
   * Manual nudge from the panel: everyone with unacknowledged shifts in a published version gets
   * the same reminder the worker sends after 24 hours. One reminder per employee per day.
   */
  async remindAcknowledgement(versionId: string, actor: Actor): Promise<RemindResult> {
    const version = await this.requireVersion(versionId);
    if (version.status !== 'PUBLISHED') {
      throw new DomainError(
        'SCHEDULE_NOT_PUBLISHED',
        409,
        'Only a published version can be reminded',
      );
    }
    const status = await this.acknowledgementStatus(versionId);
    const pending = status.filter((s) => s.telegramLinked && s.acknowledged < s.assignments);
    const [year, m] = version.periodMonth.split('-');
    const day = new Date().toISOString().slice(0, 10);
    let reminded = 0;
    await this.db.transaction(async (tx) => {
      for (const row of pending) {
        const queued = await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: row.employeeId,
          template: 'ACK_REMINDER',
          payload: (t) => ({
            text: format(t.schedule.ackReminder, {
              month: t.schedule.months[Number(m) - 1] ?? version.periodMonth,
              year: year ?? '',
            }),
            buttons: [[{ text: t.schedule.ackButton, callbackData: `ack:${version.id}` }]],
          }),
          dedupeKey: `ack-reminder:manual:${version.id}:${row.employeeId}:${day}`,
        });
        if (queued) reminded += 1;
      }
      await this.audit.record(tx, {
        actor,
        action: 'schedule.version.remind',
        objectType: 'schedule_version',
        objectId: version.id,
        after: { reminded, pending: pending.length },
      });
    });
    return { reminded };
  }

  async acknowledgementStatus(versionId: string): Promise<AcknowledgementStatusView[]> {
    const rows = await this.db
      .select({
        employeeId: employees.id,
        fullName: employees.fullName,
        personnelNumber: employees.personnelNumber,
        assignments: sql<number>`count(${shiftAssignments.id})::int`,
        acknowledged: sql<number>`count(${assignmentAcknowledgements.id})::int`,
        telegramLinked: sql<boolean>`bool_or(${telegramAccounts.id} is not null)`,
      })
      .from(shiftAssignments)
      .innerJoin(employees, eq(shiftAssignments.employeeId, employees.id))
      .leftJoin(
        assignmentAcknowledgements,
        eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
      )
      .leftJoin(
        telegramAccounts,
        and(eq(telegramAccounts.employeeId, employees.id), eq(telegramAccounts.status, 'ACTIVE')),
      )
      .where(
        and(
          eq(shiftAssignments.scheduleVersionId, versionId),
          eq(shiftAssignments.status, 'PLANNED'),
        ),
      )
      .groupBy(employees.id, employees.fullName, employees.personnelNumber)
      .orderBy(asc(employees.fullName));
    return rows;
  }

  /** Календар місяця працівника з усіх опублікованих версій (FR-SCH-01). */
  async myPlan(employeeId: string, month: string): Promise<MyPlanView> {
    const rows = await this.db
      .select({
        a: shiftAssignments,
        templateCode: shiftTemplates.code,
        isNight: shiftTemplates.isNight,
        zoneName: responsibilityZones.name,
        orgUnitName: orgUnits.name,
        timezone: sites.timezone,
        acknowledgedAt: assignmentAcknowledgements.acknowledgedAt,
      })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .innerJoin(shiftTemplates, eq(shiftAssignments.templateId, shiftTemplates.id))
      .innerJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .innerJoin(sites, eq(scheduleVersions.siteId, sites.id))
      .leftJoin(responsibilityZones, eq(shiftAssignments.zoneId, responsibilityZones.id))
      .leftJoin(
        assignmentAcknowledgements,
        eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
      )
      .where(
        and(
          eq(shiftAssignments.employeeId, employeeId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          eq(scheduleVersions.periodMonth, month),
        ),
      )
      .orderBy(asc(shiftAssignments.planStartAt));

    const planned = rows.map<PlannedShift>((r) => ({
      id: r.a.id,
      employeeId: r.a.employeeId,
      businessDate: r.a.businessDate,
      planStartAt: r.a.planStartAt,
      planEndAt: r.a.planEndAt,
      isNight: r.isNight,
      templateCode: r.templateCode,
      zoneId: r.a.zoneId,
    }));
    const byId = new Map(rows.map((r) => [r.a.id, r]));
    const plan = buildMonthPlan(planned, month);
    const unacknowledged = new Set(
      rows.filter((r) => r.acknowledgedAt === null).map((r) => r.a.scheduleVersionId),
    );

    return {
      month,
      timezone: rows[0]?.timezone ?? this.options.defaultTimezone,
      days: plan.days.map((d) => {
        const r = d.shift ? byId.get(d.shift.id) : undefined;
        return {
          date: d.date,
          weekday: d.weekday,
          kind: d.kind,
          assignment: r
            ? {
                id: r.a.id,
                versionId: r.a.scheduleVersionId,
                planStartAt: r.a.planStartAt.toISOString(),
                planEndAt: r.a.planEndAt.toISOString(),
                templateCode: r.templateCode,
                zoneName: r.zoneName,
                orgUnitName: r.orgUnitName,
                acknowledged: r.acknowledgedAt !== null,
              }
            : null,
        };
      }),
      totals: plan.totals,
      unacknowledgedVersionIds: [...unacknowledged],
    };
  }

  /** Найближча (поточна або майбутня) зміна для головного екрана бота. */
  async nextShift(employeeId: string, now: Date = new Date()): Promise<NextShift | null> {
    const [r] = await this.db
      .select({
        a: shiftAssignments,
        isNight: shiftTemplates.isNight,
        zoneName: responsibilityZones.name,
        timezone: sites.timezone,
        acknowledgedAt: assignmentAcknowledgements.acknowledgedAt,
      })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .innerJoin(shiftTemplates, eq(shiftAssignments.templateId, shiftTemplates.id))
      .innerJoin(sites, eq(scheduleVersions.siteId, sites.id))
      .leftJoin(responsibilityZones, eq(shiftAssignments.zoneId, responsibilityZones.id))
      .leftJoin(
        assignmentAcknowledgements,
        eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
      )
      .where(
        and(
          eq(shiftAssignments.employeeId, employeeId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          gt(shiftAssignments.planEndAt, now),
        ),
      )
      .orderBy(asc(shiftAssignments.planStartAt))
      .limit(1);
    if (!r) return null;
    return {
      assignmentId: r.a.id,
      versionId: r.a.scheduleVersionId,
      planStartAt: r.a.planStartAt,
      planEndAt: r.a.planEndAt,
      isNight: r.isNight,
      zoneName: r.zoneName,
      timezone: r.timezone,
      acknowledged: r.acknowledgedAt !== null,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Внутрішнє                                                           */
  /* ------------------------------------------------------------------ */

  private async publishedFor(
    siteId: string,
    orgUnitId: string,
    periodMonth: string,
    tx: DbOrTx,
    lock = false,
  ): Promise<VersionRow | null> {
    const query = tx
      .select()
      .from(scheduleVersions)
      .where(
        and(
          eq(scheduleVersions.siteId, siteId),
          eq(scheduleVersions.orgUnitId, orgUnitId),
          eq(scheduleVersions.periodMonth, periodMonth),
          eq(scheduleVersions.status, 'PUBLISHED'),
        ),
      )
      .limit(1);
    const [row] = lock ? await query.for('update') : await query;
    return row ?? null;
  }

  private async loadAssignments(
    versionId: string,
    tx: DbOrTx = this.db,
  ): Promise<AssignmentWithTemplate[]> {
    const rows = await tx
      .select({
        a: shiftAssignments,
        templateCode: shiftTemplates.code,
        isNight: shiftTemplates.isNight,
        acknowledgedAt: assignmentAcknowledgements.acknowledgedAt,
      })
      .from(shiftAssignments)
      .innerJoin(shiftTemplates, eq(shiftAssignments.templateId, shiftTemplates.id))
      .leftJoin(
        assignmentAcknowledgements,
        eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
      )
      .where(eq(shiftAssignments.scheduleVersionId, versionId))
      .orderBy(asc(shiftAssignments.employeeId), asc(shiftAssignments.planStartAt));
    return rows;
  }

  /** Контекст валідації: опубліковані зміни тих самих працівників поза цією версією і її ключем. */
  private async validateRows(
    version: VersionRow,
    assignments: AssignmentWithTemplate[],
    tx: DbOrTx = this.db,
  ): Promise<ValidationIssueView[]> {
    const own = this.toPlanned(assignments.filter((x) => x.a.status === 'PLANNED'));
    const employeeIds = [...new Set(own.map((s) => s.employeeId))];
    if (employeeIds.length === 0) return [];

    const dates = monthDates(version.periodMonth);
    const from = new Date(`${dates[0]}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 2);
    const to = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
    to.setUTCDate(to.getUTCDate() + 3);

    const rows = await tx
      .select({
        a: shiftAssignments,
        templateCode: shiftTemplates.code,
        isNight: shiftTemplates.isNight,
      })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .innerJoin(shiftTemplates, eq(shiftAssignments.templateId, shiftTemplates.id))
      .where(
        and(
          inArray(shiftAssignments.employeeId, employeeIds),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          ne(scheduleVersions.id, version.id),
          sql`not (${scheduleVersions.siteId} = ${version.siteId} and ${scheduleVersions.orgUnitId} = ${version.orgUnitId} and ${scheduleVersions.periodMonth} = ${version.periodMonth})`,
          gte(shiftAssignments.planStartAt, from),
          lte(shiftAssignments.planStartAt, to),
        ),
      );
    const context = this.toPlanned(rows.map((r) => ({ ...r, acknowledgedAt: null })));
    return validateSchedule(own, context, this.options.rules).map(toIssueView);
  }

  private toPlanned(rows: readonly AssignmentWithTemplate[]): PlannedShift[] {
    return rows.map((r) => ({
      id: r.a.id,
      employeeId: r.a.employeeId,
      businessDate: r.a.businessDate,
      planStartAt: r.a.planStartAt,
      planEndAt: r.a.planEndAt,
      isNight: r.isNight,
      templateCode: r.templateCode,
      zoneId: r.a.zoneId,
    }));
  }

  /** A shift session opened against an assignment of the version: the version is history. */
  private async hasWorkedShifts(versionId: string, tx: DbOrTx = this.db): Promise<boolean> {
    const [worked] = await tx
      .select({ id: shiftSessions.id })
      .from(shiftSessions)
      .innerJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .where(eq(shiftAssignments.scheduleVersionId, versionId))
      .limit(1);
    return worked !== undefined;
  }

  /** `worked` matters only for superseded versions; drafts never had sessions. */
  private toVersionView(
    row: VersionRow,
    assignmentsCount: number,
    worked = false,
  ): ScheduleVersionView {
    return {
      id: row.id,
      siteId: row.siteId,
      orgUnitId: row.orgUnitId,
      periodMonth: row.periodMonth,
      versionNo: row.versionNo,
      status: row.status,
      createdBy: row.createdBy,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedBy: row.approvedBy,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      supersedesId: row.supersedesId,
      changeReason: row.changeReason,
      createdAt: row.createdAt.toISOString(),
      assignmentsCount,
      deletable: row.status === 'DRAFT' || (row.status === 'SUPERSEDED' && !worked),
    };
  }

  private toAssignmentView(x: AssignmentWithTemplate): AssignmentView {
    return {
      id: x.a.id,
      scheduleVersionId: x.a.scheduleVersionId,
      employeeId: x.a.employeeId,
      templateId: x.a.templateId,
      templateCode: x.templateCode,
      businessDate: x.a.businessDate,
      planStartAt: x.a.planStartAt.toISOString(),
      planEndAt: x.a.planEndAt.toISOString(),
      positionId: x.a.positionId,
      orgUnitId: x.a.orgUnitId,
      teamId: x.a.teamId,
      zoneId: x.a.zoneId,
      kind: x.a.kind,
      status: x.a.status,
      acknowledgedAt: x.acknowledgedAt?.toISOString() ?? null,
    };
  }
}

/** Локальний час 'HH:mm' для текстів бота. */
export function localTime(instant: Date, timezone: string): string {
  return formatLocal(instant, timezone).local.slice(11, 16);
}

function toIssueView(issue: ValidationIssue): ValidationIssueView {
  return {
    code: issue.code,
    severity: issue.severity,
    employeeId: issue.employeeId,
    assignmentIds: [...issue.assignmentIds],
    details: { ...issue.details },
  };
}
