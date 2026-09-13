import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  assignmentAcknowledgements,
  desc,
  employees,
  eq,
  gt,
  inArray,
  isNull,
  max,
  orgUnits,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  sql,
  telegramAccounts,
  type Database,
  type DbOrTx,
  type Transaction,
  employeeQualifications,
  zoneStaffingRequirements,
  assignmentSegments,
  assignmentBreaks,
} from '@vakhta/db';
import {
  buildMonthPlan,
  diffSchedules,
  formatLocal,
  nextScheduleStatus,
  type PlannedShift,
  type ScheduleAction,
  canActOn,
  scheduleZoneScope,
  zoneScopeViolations,
  SCHEDULE_APPROVE_ROLES,
  SCHEDULE_EDIT_ROLES,
  type RoleGrant,
  qualifiedFor,
  evaluatePlan,
  assignmentInstants,
  resolveSegments,
  resolveBreaks,
} from '@vakhta/domain';
import type {
  AcknowledgementStatusView,
  AssignmentInput,
  AssignmentView,
  CreateScheduleVersionCommand,
  ListScheduleVersionsQuery,
  MyPlanView,
  PublishScheduleCommand,
  PutAssignmentsCommand,
  ReviseScheduleCommand,
  RemindResult,
  ReturnToDraftCommand,
  ScheduleVersionDetail,
  ScheduleVersionView,
  ScheduleWebCommand,
  ScheduleCommandResult,
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
import { acknowledgementSnapshot, type AcknowledgementScope } from './acknowledgement-snapshot.js';
import {
  loadAbsences,
  loadContextIntervals,
  loadPreferences,
  loadRules,
  monthContextRange,
  toPlannedIntervals,
  loadUnitMembership,
} from './plan-context.js';

export interface ScheduleOptions {
  readonly shiftReminderMinutes: number;
  readonly ackReminderHours: number;
  readonly defaultTimezone: string;
}

export const SCHEDULE_OPTIONS = Symbol('SCHEDULE_OPTIONS');

/**
 * Everything the database will refuse to let go of, listed the way the foreign keys are: a version
 * another one supersedes, a version a request produced, and assignments a shift, an arrival, a QR
 * scan or a request still points at. The panel asks this before offering a delete — it used to ask
 * only about worked shifts and offered deletes that came back as "still in use".
 */
const IN_USE = (versionId: unknown) => sql<boolean>`(
  exists (select 1 from schedule_versions later where later.supersedes_id = ${versionId})
  or exists (select 1 from requests rq where rq.result_version_id = ${versionId})
  or exists (
    select 1 from shift_assignments sa
    where sa.schedule_version_id = ${versionId}
      and (
        exists (select 1 from shift_sessions x where x.assignment_id = sa.id)
        or exists (select 1 from presence_sessions x where x.assignment_id = sa.id)
        or exists (select 1 from qr_challenge_uses x where x.assignment_id = sa.id)
        or exists (select 1 from requests x where x.assignment_id = sa.id)
      )
  )
)`;

type VersionRow = typeof scheduleVersions.$inferSelect;
type AssignmentRow = typeof shiftAssignments.$inferSelect;

type SegmentRow = typeof assignmentSegments.$inferSelect;
type BreakRow = typeof assignmentBreaks.$inferSelect;
interface AssignmentWithTemplate {
  readonly a: AssignmentRow;
  readonly templateCode: string;
  readonly isNight: boolean;
  readonly acknowledgedAt: Date | null;
  readonly segments: readonly SegmentRow[];
  readonly breaks: readonly BreakRow[];
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

  /** Internal command executor. The caller owns authorization, receipt and transaction. */
  async applyCommandWithin(
    tx: Transaction,
    command: ScheduleWebCommand,
    actor: Actor,
    restriction: ReadonlySet<string> | null = null,
  ): Promise<ScheduleCommandResult> {
    const commandId = command.commandId;
    switch (command.action) {
      case 'CREATE':
        return {
          commandId,
          kind: 'VERSION',
          version: await this.createVersionWithin(tx, command.payload, actor),
        };
      case 'SAVE':
        return {
          commandId,
          kind: 'DETAIL',
          detail: await this.putAssignmentsWithin(
            tx,
            command.versionId,
            command.payload,
            actor,
            command.expectedRevision,
            restriction,
          ),
        };
      case 'DELETE':
        try {
          await this.deleteVersionWithin(tx, command.versionId, actor, command.expectedRevision);
        } catch (error) {
          if (isForeignKeyViolation(error))
            throw new DomainError(
              'SCHEDULE_VERSION_IN_USE',
              409,
              'Version is referenced by other records and stays as history',
            );
          throw error;
        }
        return { commandId, kind: 'DELETED', versionId: command.versionId };
      case 'SUBMIT':
        return {
          commandId,
          kind: 'VERSION',
          version: await this.transitionWithin(tx, command.versionId, 'SUBMIT', actor, {
            expectedRevision: command.expectedRevision,
            requireNoErrors: true,
            set: { submittedAt: new Date() },
          }),
        };
      case 'RETURN':
        return {
          commandId,
          kind: 'VERSION',
          version: await this.transitionWithin(tx, command.versionId, 'RETURN', actor, {
            expectedRevision: command.expectedRevision,
            comment: command.payload.comment,
            set: { submittedAt: null },
          }),
        };
      case 'PUBLISH': {
        const result = await this.publishWithin(
          tx,
          command.versionId,
          command.payload,
          actor,
          new Date(),
          command.expectedRevision,
        );
        return {
          commandId,
          kind: 'VERSION',
          version: this.toVersionView(result.updated, result.nextShifts.length),
        };
      }
      case 'REVISE':
        return {
          commandId,
          kind: 'VERSION',
          version: await this.reviseWithin(
            tx,
            command.versionId,
            command.payload,
            actor,
            new Date(),
            command.expectedRevision,
          ),
        };
    }
  }

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
        inUse: IN_USE(sql`schedule_versions.id`),
      })
      .from(scheduleVersions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(scheduleVersions.periodMonth), desc(scheduleVersions.versionNo))
      .limit(200);
    return rows.map((r) => this.toVersionView(r.v, r.count, r.inUse));
  }

  async createVersion(
    cmd: CreateScheduleVersionCommand,
    actor: Actor,
  ): Promise<ScheduleVersionView> {
    return this.db.transaction((tx) => this.createVersionWithin(tx, cmd, actor));
  }

  private async createVersionWithin(
    tx: Transaction,
    cmd: CreateScheduleVersionCommand,
    actor: Actor,
  ): Promise<ScheduleVersionView> {
    await this.org.requireOrgUnit(cmd.orgUnitId, cmd.siteId, tx);
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
      if (
        source.siteId !== cmd.siteId ||
        source.orgUnitId !== cmd.orgUnitId ||
        source.periodMonth !== cmd.periodMonth
      ) {
        throw new DomainError(
          'SCHEDULE_SOURCE_SCOPE_MISMATCH',
          422,
          'Source version must belong to the same site, unit and month',
        );
      }
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
        const copies = await tx
          .insert(shiftAssignments)
          .values(
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
              customStart: a.customStart,
              customEnd: a.customEnd,
            })),
          )
          .returning({
            id: shiftAssignments.id,
            employeeId: shiftAssignments.employeeId,
            businessDate: shiftAssignments.businessDate,
          });
        const sourceSegments = await tx
          .select()
          .from(assignmentSegments)
          .where(
            inArray(
              assignmentSegments.assignmentId,
              rows.map((a) => a.id),
            ),
          );
        const byOld = new Map(rows.map((a) => [a.id, `${a.employeeId}:${a.businessDate}`]));
        const byKey = new Map(copies.map((c) => [`${c.employeeId}:${c.businessDate}`, c.id]));
        const sourceBreaks = await tx
          .select()
          .from(assignmentBreaks)
          .where(
            inArray(
              assignmentBreaks.assignmentId,
              rows.map((a) => a.id),
            ),
          );
        if (sourceBreaks.length > 0)
          await tx.insert(assignmentBreaks).values(
            sourceBreaks.map((pause) => ({
              assignmentId: byKey.get(byOld.get(pause.assignmentId) ?? '') as string,
              position: pause.position,
              localStart: pause.localStart,
              localEnd: pause.localEnd,
              reliefEmployeeId: pause.reliefEmployeeId,
            })),
          );
        if (sourceSegments.length > 0) {
          await tx.insert(assignmentSegments).values(
            sourceSegments.map((segment) => ({
              assignmentId: byKey.get(byOld.get(segment.assignmentId) ?? '') as string,
              position: segment.position,
              zoneId: segment.zoneId,
              localStart: segment.localStart,
              localEnd: segment.localEnd,
            })),
          );
        }
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
  }

  /** Only a draft can go: published and superseded versions are history (spec 3.2). */
  /**
   * Drafts and superseded versions can be deleted (spec 3.2 keeps the published one as the live
   * schedule). A superseded version whose assignments were worked stays as history.
   */
  async deleteVersion(id: string, actor: Actor, expectedRevision?: number): Promise<void> {
    try {
      await this.db.transaction((tx) => this.deleteVersionWithin(tx, id, actor, expectedRevision));
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

  private async deleteVersionWithin(
    tx: Transaction,
    id: string,
    actor: Actor,
    expectedRevision?: number,
  ): Promise<void> {
    const version = await this.lockVersion(id, tx, expectedRevision);
    if (version.status !== 'DRAFT' && version.status !== 'SUPERSEDED') {
      throw new DomainError(
        'SCHEDULE_TRANSITION_NOT_ALLOWED',
        409,
        `Only a draft or a superseded version can be deleted; version ${id} is ${version.status}`,
      );
    }
    if (await this.isInUse(version.id, tx)) {
      throw new DomainError(
        'SCHEDULE_VERSION_IN_USE',
        409,
        `Version ${id} is worked or replaced by a later one and stays as history`,
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
  }

  async detail(id: string): Promise<ScheduleVersionDetail> {
    return this.db.transaction(
      async (tx) => {
        const version = await this.requireVersion(id, tx);
        const assignments = await this.loadAssignments(id, tx);
        return {
          version: this.toVersionView(
            version,
            assignments.filter((x) => x.a.status === 'PLANNED').length,
            await this.isInUse(id, tx),
          ),
          assignments: assignments.map((x) => this.toAssignmentView(x)),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** Internal transaction lock; omit the revision check when resolving scope before authorization. */
  async lockVersion(id: string, tx: Transaction, expectedRevision?: number): Promise<VersionRow> {
    const [version] = await tx
      .select()
      .from(scheduleVersions)
      .where(eq(scheduleVersions.id, id))
      .for('update');
    if (!version)
      throw new DomainError('SCHEDULE_VERSION_NOT_FOUND', 404, `Version ${id} not found`);
    if (expectedRevision !== undefined && version.revision !== expectedRevision) {
      throw new DomainError(
        'SCHEDULE_REVISION_CONFLICT',
        409,
        'Schedule changed since this draft was read',
      );
    }
    return version;
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
    expectedRevision?: number,
    restriction: ReadonlySet<string> | null = null,
  ): Promise<ScheduleVersionDetail> {
    return this.db.transaction((tx) =>
      this.putAssignmentsWithin(tx, id, cmd, actor, expectedRevision, restriction),
    );
  }

  /**
   * Borrowing (D-06, SC-38): planning a person whose current position sits in another unit of the
   * site needs site-level ADMIN or PRODUCTION_HEAD authority, rechecked at every commit.
   */
  async assertBorrowingAuthority(
    grants: readonly RoleGrant[],
    target: { siteId: string; orgUnitId: string },
    items: readonly Pick<AssignmentInput, 'employeeId' | 'businessDate'>[],
    tx: DbOrTx = this.db,
  ): Promise<void> {
    if (items.length === 0) return;
    if (canActOn(grants, ['ADMIN', 'PRODUCTION_HEAD'], { siteId: target.siteId })) return;
    const membership = await loadUnitMembership(tx, target.siteId);
    const home = new Map(membership.map((row) => [row.employeeId, row.orgUnitId]));
    const borrowed = items.filter((item) => {
      const unit = home.get(item.employeeId);
      return unit !== undefined && unit !== target.orgUnitId;
    });
    if (borrowed.length > 0)
      throw new DomainError(
        'SCHEDULE_BORROWING_AUTHORITY',
        403,
        `Borrowing from another unit needs site authority: ${borrowed
          .slice(0, 5)
          .map((item) => `${item.employeeId} ${item.businessDate}`)
          .join(', ')}`,
      );
  }

  /**
   * Adds one assignment to a draft inside the caller's transaction, keeping every other planned
   * assignment with its metadata (open slot selection, #13). The whole-month validation applies.
   */
  async addAssignmentWithin(
    tx: Transaction,
    versionId: string,
    item: AssignmentInput,
    actor: Actor,
    expectedRevision?: number,
    restriction: ReadonlySet<string> | null = null,
  ): Promise<ScheduleVersionDetail> {
    const current = (await this.loadAssignments(versionId, tx))
      .filter((x) => x.a.status === 'PLANNED')
      .map((x) => this.toAssignmentInput(x));
    if (
      current.some((x) => x.employeeId === item.employeeId && x.businessDate === item.businessDate)
    )
      throw new DomainError(
        'DUPLICATE_ASSIGNMENT',
        422,
        `${item.employeeId} already has an assignment on ${item.businessDate}`,
      );
    return this.putAssignmentsWithin(
      tx,
      versionId,
      { items: [...current, item] },
      actor,
      expectedRevision,
      restriction,
    );
  }

  private toAssignmentInput(x: AssignmentWithTemplate): AssignmentInput {
    return {
      employeeId: x.a.employeeId,
      templateId: x.a.templateId,
      businessDate: x.a.businessDate,
      kind: x.a.kind,
      ...(x.a.positionId ? { positionId: x.a.positionId } : {}),
      ...(x.a.teamId ? { teamId: x.a.teamId } : {}),
      ...(x.a.zoneId ? { zoneId: x.a.zoneId } : {}),
      ...(x.a.customStart && x.a.customEnd
        ? { customStart: x.a.customStart, customEnd: x.a.customEnd }
        : {}),
      ...(x.segments.length > 0
        ? {
            segments: x.segments.map((segment) => ({
              zoneId: segment.zoneId,
              localStart: segment.localStart,
              localEnd: segment.localEnd,
            })),
          }
        : {}),
      ...(x.breaks.length > 0
        ? {
            breaks: x.breaks.map((pause) => ({
              localStart: pause.localStart,
              localEnd: pause.localEnd,
              reliefEmployeeId: pause.reliefEmployeeId,
            })),
          }
        : {}),
    };
  }

  /**
   * Scheduling authority for one unit (D-01): returns `null` for unit-wide editors, the allowed
   * zones for a zone-scoped master, and throws when the actor may not perform the action here.
   * Zone-scoped masters prepare, save and submit only; approval actions need approver roles.
   */
  async editorScope(
    grants: readonly RoleGrant[],
    target: { siteId: string; orgUnitId: string },
    action: ScheduleWebCommand['action'],
    tx: DbOrTx = this.db,
  ): Promise<ReadonlySet<string> | null> {
    const scope = { siteId: target.siteId, orgUnitId: target.orgUnitId };
    if (action === 'RETURN' || action === 'PUBLISH' || action === 'REVISE') {
      if (!canActOn(grants, SCHEDULE_APPROVE_ROLES, scope))
        throw new ForbiddenException('Schedule approval is outside the current role scope');
      return null;
    }
    if (canActOn(grants, SCHEDULE_EDIT_ROLES, scope)) {
      const unitWide = scheduleZoneScope(grants, scope, []);
      if (unitWide === null) return null;
    }
    const unitZones = await tx
      .select({ id: responsibilityZones.id })
      .from(responsibilityZones)
      .where(eq(responsibilityZones.orgUnitId, target.orgUnitId));
    const zones = scheduleZoneScope(
      grants,
      scope,
      unitZones.map((zone) => zone.id),
    );
    if (zones === null) return null;
    if (zones.size === 0)
      throw new ForbiddenException('Schedule command is outside the current role scope');
    if (action !== 'CREATE' && action !== 'SAVE' && action !== 'SUBMIT')
      throw new ForbiddenException('A zone-scoped master may only prepare, save and submit');
    return zones;
  }

  private async putAssignmentsWithin(
    tx: Transaction,
    id: string,
    cmd: PutAssignmentsCommand,
    actor: Actor,
    expectedRevision?: number,
    restriction: ReadonlySet<string> | null = null,
  ): Promise<ScheduleVersionDetail> {
    const version = await this.lockVersion(id, tx, expectedRevision);
    if (version.status !== 'DRAFT') {
      throw new DomainError(
        'SCHEDULE_NOT_EDITABLE',
        409,
        'Редагувати можна лише чернетку; створіть нову версію',
      );
    }
    if (restriction) {
      const current = (await this.loadAssignments(version.id, tx))
        .filter((x) => x.a.status === 'PLANNED')
        .map((x) => x.a);
      const violations = zoneScopeViolations(current, cmd.items, restriction);
      if (violations.length > 0)
        throw new DomainError(
          'SCHEDULE_ZONE_SCOPE',
          403,
          `Assignments outside the actor's zones: ${violations.slice(0, 5).join(', ')}`,
        );
    }
    const count = await this.replaceAssignments(tx, version, cmd, actor);
    const assignments = await this.loadAssignments(version.id, tx);
    return {
      version: this.toVersionView(await this.requireVersion(version.id, tx), count),
      assignments: assignments.map((x) => this.toAssignmentView(x)),
    };
  }

  /** Validates and writes the whole month of a version; returns the number of assignments. */
  private async replaceAssignments(
    tx: Transaction,
    version: VersionRow,
    cmd: PutAssignmentsCommand,
    actor: Actor,
  ): Promise<number> {
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

    const zoneIds = [
      ...new Set(
        cmd.items
          .flatMap((i) => [i.zoneId, ...(i.segments ?? []).map((segment) => segment.zoneId)])
          .filter((z): z is string => !!z),
      ),
    ];
    const zones = zoneIds.length
      ? await tx.select().from(responsibilityZones).where(inArray(responsibilityZones.id, zoneIds))
      : [];
    const zoneMap = new Map(zones.map((z) => [z.id, z]));

    // D-03: a zone whose every effective requirement demands a qualification rejects unqualified people.
    const rules = zoneIds.length
      ? (
          await tx
            .select()
            .from(zoneStaffingRequirements)
            .where(inArray(zoneStaffingRequirements.zoneId, zoneIds))
        ).map((row) => ({
          id: row.id,
          zoneId: row.zoneId,
          templateId: row.templateId,
          requiredCount: row.requiredCount,
          qualificationId: row.qualificationId,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
        }))
      : [];
    const holdings =
      rules.length && employeeIds.length
        ? await tx
            .select()
            .from(employeeQualifications)
            .where(inArray(employeeQualifications.employeeId, employeeIds))
        : [];
    // Serialize concurrent writers per person (SC-05) before reading their plans elsewhere.
    for (const employeeId of [...employeeIds].sort())
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`schedule-employee:${employeeId}`}, 0))`,
      );
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
      if (item.zoneId && !qualifiedFor(rules, holdings, item)) {
        throw new DomainError(
          'QUALIFICATION_REQUIRED',
          422,
          `Employee ${item.employeeId} lacks a qualification required in zone ${item.zoneId} on ${item.businessDate}`,
        );
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

      const plan = assignmentInstants(
        {
          businessDate: item.businessDate,
          template,
          customStart: item.customStart,
          customEnd: item.customEnd,
        },
        site.timezone,
      );
      const segmentInputs = item.segments ?? [];
      for (const segment of segmentInputs) {
        const zone = zoneMap.get(segment.zoneId);
        if (!zone || zone.orgUnitId !== version.orgUnitId)
          throw new DomainError(
            'ZONE_MISMATCH',
            422,
            `Segment zone ${segment.zoneId} does not belong to the unit`,
          );
      }
      const resolved = resolveSegments(
        { ...plan, businessDate: item.businessDate },
        segmentInputs,
        site.timezone,
      );
      if ('error' in resolved)
        throw new DomainError(
          resolved.error,
          422,
          `Segment ${resolved.position + 1} of ${item.employeeId} on ${item.businessDate} does not tile the shift`,
        );
      const pauses = resolveBreaks(
        { ...plan, businessDate: item.businessDate },
        item.breaks ?? [],
        site.timezone,
      );
      if ('error' in pauses)
        throw new DomainError(
          pauses.error,
          422,
          `Break ${pauses.position + 1} of ${item.employeeId} on ${item.businessDate} lies outside the shift or overlaps`,
        );
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
        customStart: item.customStart ?? null,
        customEnd: item.customEnd ?? null,
        segments: resolved.segments,
        breaks: pauses.breaks,
      };
    });

    if (values.length > 0) {
      const range = monthContextRange(version.periodMonth);
      const context = toPlannedIntervals(
        await loadContextIntervals(tx, {
          siteId: version.siteId,
          employeeIds,
          from: range.from,
          to: range.to,
          exclude: { orgUnitId: version.orgUnitId, periodMonth: version.periodMonth },
        }),
      );
      const reasons = evaluatePlan({
        proposed: values.map((value) => ({
          employeeId: value.employeeId,
          businessDate: value.businessDate,
          startMs: value.planStartAt.getTime(),
          endMs: value.planEndAt.getTime(),
          templateId: value.templateId,
          zoneId: value.zoneId,
          orgUnitId: version.orgUnitId,
          breaks: value.breaks.map((pause) => ({
            startMs: pause.startAt.getTime(),
            endMs: pause.endAt.getTime(),
            reliefEmployeeId: pause.reliefEmployeeId ?? null,
          })),
        })),
        context,
        absences: await loadAbsences(tx, { employeeIds, from: range.from, to: range.to }),
        preferences: await loadPreferences(tx, employeeIds),
        rules: await loadRules(tx, version.siteId),
        staffing: { requirements: rules, holdings },
        month: version.periodMonth,
      });
      const blocking = reasons.filter((reason) => reason.severity === 'BLOCK');
      if (blocking.length > 0)
        throw new DomainError(
          'SCHEDULE_ELIGIBILITY',
          422,
          `Blocking conflicts: ${blocking
            .slice(0, 5)
            .map((reason) => `${reason.code} ${reason.employeeId} ${reason.businessDate}`)
            .join('; ')}`,
        );
    }
    await tx.delete(shiftAssignments).where(eq(shiftAssignments.scheduleVersionId, version.id));
    if (values.length > 0) {
      const inserted = await tx
        .insert(shiftAssignments)
        .values(values.map(({ segments: _segments, breaks: _breaks, ...value }) => value))
        .returning({
          id: shiftAssignments.id,
          employeeId: shiftAssignments.employeeId,
          businessDate: shiftAssignments.businessDate,
        });
      const ids = new Map(inserted.map((row) => [`${row.employeeId}:${row.businessDate}`, row.id]));
      const segmentRows = values.flatMap((value) =>
        value.segments.map((segment) => ({
          assignmentId: ids.get(`${value.employeeId}:${value.businessDate}`) as string,
          position: segment.position,
          zoneId: segment.zoneId,
          localStart: segment.localStart,
          localEnd: segment.localEnd,
        })),
      );
      if (segmentRows.length > 0) await tx.insert(assignmentSegments).values(segmentRows);
      const breakRows = values.flatMap((value) =>
        value.breaks.map((pause) => ({
          assignmentId: ids.get(`${value.employeeId}:${value.businessDate}`) as string,
          position: pause.position,
          localStart: pause.localStart,
          localEnd: pause.localEnd,
          reliefEmployeeId: pause.reliefEmployeeId ?? null,
        })),
      );
      if (breakRows.length > 0) await tx.insert(assignmentBreaks).values(breakRows);
    }
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
    return values.length;
  }

  /* ------------------------------------------------------------------ */
  /* Життєвий цикл                                                       */
  /* ------------------------------------------------------------------ */

  async submit(id: string, actor: Actor, expectedRevision?: number): Promise<ScheduleVersionView> {
    return this.db.transaction((tx) =>
      this.transitionWithin(tx, id, 'SUBMIT', actor, {
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
        requireNoErrors: true,
        set: { submittedAt: new Date() },
      }),
    );
  }

  async returnToDraft(
    id: string,
    cmd: ReturnToDraftCommand,
    actor: Actor,
    expectedRevision?: number,
  ): Promise<ScheduleVersionView> {
    return this.db.transaction((tx) =>
      this.transitionWithin(tx, id, 'RETURN', actor, {
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
        comment: cmd.comment,
        set: { submittedAt: null },
      }),
    );
  }

  /**
   * Публікація (ТЗ 3.2, FR-SCH-03): попередня опублікована версія стає SUPERSEDED, працівники
   * отримують нотифікацію з кнопкою «Ознайомлений», ставляться нагадування.
   */
  async publish(
    id: string,
    cmd: PublishScheduleCommand,
    actor: Actor,
    expectedRevision?: number,
  ): Promise<ScheduleVersionView> {
    const now = new Date();
    const result = await this.db.transaction((tx) =>
      this.publishWithin(tx, id, cmd, actor, now, expectedRevision),
    );
    return this.toVersionView(result.updated, result.nextShifts.length);
  }

  /**
   * Edit a published month in place (spec 3.2 kept intact): the items become a new version that
   * is published in the same transaction, the current version is superseded and employees are
   * notified of the difference. Validation errors roll everything back, so no draft is left.
   */
  async revise(
    id: string,
    cmd: ReviseScheduleCommand,
    actor: Actor,
    expectedRevision?: number,
  ): Promise<ScheduleVersionView> {
    const result = await this.db.transaction((tx) =>
      this.reviseWithin(tx, id, cmd, actor, new Date(), expectedRevision),
    );
    return result;
  }

  /** Revise a published schedule and admit reminders in the owning workflow transaction. */
  async reviseWithin(
    tx: Transaction,
    id: string,
    cmd: ReviseScheduleCommand,
    actor: Actor,
    now: Date,
    expectedRevision?: number,
  ): Promise<ScheduleVersionView> {
    const current = await this.lockVersion(id, tx, expectedRevision);
    if (current.status !== 'PUBLISHED') {
      throw new DomainError(
        'SCHEDULE_NOT_PUBLISHED',
        409,
        `Only a published version can be revised in place; version ${id} is ${current.status}`,
      );
    }
    const [agg] = await tx
      .select({ maxNo: max(scheduleVersions.versionNo) })
      .from(scheduleVersions)
      .where(
        and(
          eq(scheduleVersions.siteId, current.siteId),
          eq(scheduleVersions.orgUnitId, current.orgUnitId),
          eq(scheduleVersions.periodMonth, current.periodMonth),
        ),
      );
    const versionNo = (agg?.maxNo ?? 0) + 1;
    const [row] = await tx
      .insert(scheduleVersions)
      .values({
        siteId: current.siteId,
        orgUnitId: current.orgUnitId,
        periodMonth: current.periodMonth,
        versionNo,
        status: 'IN_REVIEW',
        submittedAt: now,
        createdBy: actor.id,
      })
      .returning();
    if (!row) throw new Error('schedule_versions: insert returned no row');
    await this.events.append(tx, {
      type: 'SCHEDULE_VERSION_CREATED',
      source: 'WEB',
      actor,
      scheduleVersionId: row.id,
      payload: {
        periodMonth: current.periodMonth,
        versionNo,
        basedOn: current.id,
        copied: 0,
        revision: true,
      },
    });
    await this.audit.record(tx, {
      actor,
      action: 'schedule.version.create',
      objectType: 'schedule_version',
      objectId: row.id,
      after: { periodMonth: current.periodMonth, versionNo, basedOn: current.id, revision: true },
    });
    await this.replaceAssignments(tx, row, { items: cmd.items }, actor);
    const result = await this.publishWithin(
      tx,
      row.id,
      cmd.changeReason ? { changeReason: cmd.changeReason } : {},
      actor,
      now,
    );

    return this.toVersionView(result.updated, result.nextShifts.length);
  }

  private async publishWithin(
    tx: Transaction,
    id: string,
    cmd: PublishScheduleCommand,
    actor: Actor,
    now: Date,
    expectedRevision?: number,
  ): Promise<{ updated: VersionRow; nextShifts: PlannedShift[] }> {
    const version = await this.lockVersion(id, tx, expectedRevision);
    const next = nextScheduleStatus(version.status, 'PUBLISH');
    if (!next)
      throw new DomainError(
        'SCHEDULE_TRANSITION_NOT_ALLOWED',
        409,
        `Публікація неможлива зі статусу ${version.status}`,
      );

    const assignments = await this.loadAssignments(version.id, tx);

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
    await this.armTimers(tx, { updated, nextShifts }, now);
    return { updated, nextShifts };
  }

  /** Reminder intents commit with publication; delayed dispatch rechecks current business state. */
  private async armTimers(
    tx: Transaction,
    result: { updated: VersionRow; nextShifts: PlannedShift[] },
    now: Date,
  ): Promise<void> {
    const reminderMs = this.options.shiftReminderMinutes * 60_000;
    for (const s of result.nextShifts) {
      await this.timers.scheduleShiftReminder(
        tx,
        s.id,
        new Date(s.planStartAt.getTime() - reminderMs),
      );
    }
    const ackAt = new Date(now.getTime() + this.options.ackReminderHours * 3_600_000);
    for (const employeeId of new Set(result.nextShifts.map((s) => s.employeeId))) {
      await this.timers.scheduleAckReminder(tx, result.updated.id, employeeId, ackAt);
    }
  }

  private async transitionWithin(
    tx: Transaction,
    id: string,
    action: ScheduleAction,
    actor: Actor,
    opts: {
      expectedRevision?: number;
      requireNoErrors?: boolean;
      comment?: string;
      set?: Partial<typeof scheduleVersions.$inferInsert>;
    },
  ): Promise<ScheduleVersionView> {
    const version = await this.lockVersion(id, tx, opts.expectedRevision);
    const next = nextScheduleStatus(version.status, action);
    if (!next)
      throw new DomainError(
        'SCHEDULE_TRANSITION_NOT_ALLOWED',
        409,
        `Дія ${action} неможлива зі статусу ${version.status}`,
      );

    const assignments = await this.loadAssignments(version.id, tx);
    // An empty month is still refused: there is nothing in it to approve or to publish.
    if (opts.requireNoErrors && assignments.length === 0) {
      throw new DomainError('SCHEDULE_EMPTY', 422, 'Порожню версію подати не можна');
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
      const [version] = await tx
        .select()
        .from(scheduleVersions)
        .where(eq(scheduleVersions.id, versionId))
        .for('no key update');
      if (!version || version.status !== 'PUBLISHED') {
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
      const acknowledged = await this.recordAcknowledgementsWithin(
        tx,
        versionId,
        employeeId,
        source,
        rows.map((row) => row.id),
      );
      return { acknowledged, total: rows.length };
    });
  }

  private async recordAcknowledgementsWithin(
    tx: Transaction,
    versionId: string,
    employeeId: string,
    source: 'TELEGRAM' | 'WEB',
    assignmentIds: readonly string[],
  ): Promise<number> {
    const inserted = await tx
      .insert(assignmentAcknowledgements)
      .values(
        assignmentIds.map((assignmentId) => ({
          assignmentId,
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
    return inserted.length;
  }

  private readAcknowledgementAssignments(
    db: DbOrTx,
    employeeId: string,
    scope: AcknowledgementScope,
  ) {
    return db
      .select({ a: shiftAssignments, acknowledgedAt: assignmentAcknowledgements.acknowledgedAt })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
      .leftJoin(
        assignmentAcknowledgements,
        eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
      )
      .where(
        and(
          eq(shiftAssignments.employeeId, employeeId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          scope.kind === 'MONTH' ? eq(scheduleVersions.periodMonth, scope.month) : undefined,
        ),
      );
  }

  async homeAcknowledgement(employeeId: string) {
    const scope = { kind: 'HOME' } as const;
    return acknowledgementSnapshot(
      employeeId,
      scope,
      await this.readAcknowledgementAssignments(this.db, employeeId, scope),
    );
  }

  async acknowledgeSnapshot(
    employeeId: string,
    scope: AcknowledgementScope,
    fingerprint: string,
    source: 'TELEGRAM' | 'WEB',
  ): Promise<{ kind: 'STALE' } | { kind: 'ACKNOWLEDGED'; acknowledged: number; total: number }> {
    return this.db.transaction(async (tx) => {
      const candidates = await this.readAcknowledgementAssignments(tx, employeeId, scope);
      const versionIds = [...new Set(candidates.map(({ a }) => a.scheduleVersionId))].sort();
      for (const versionId of versionIds) await this.lockVersion(versionId, tx);
      const rows = await this.readAcknowledgementAssignments(tx, employeeId, scope);
      if (
        rows.some(({ a }) => !versionIds.includes(a.scheduleVersionId)) ||
        acknowledgementSnapshot(employeeId, scope, rows).fingerprint !== fingerprint
      ) {
        return { kind: 'STALE' };
      }
      let acknowledged = 0;
      for (const versionId of versionIds) {
        const assignmentIds = rows
          .filter(({ a }) => a.scheduleVersionId === versionId)
          .map(({ a }) => a.id);
        if (assignmentIds.length > 0)
          acknowledged += await this.recordAcknowledgementsWithin(
            tx,
            versionId,
            employeeId,
            source,
            assignmentIds,
          );
      }
      return { kind: 'ACKNOWLEDGED', acknowledged, total: rows.length };
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
    return (await this.myPlanWithAcknowledgement(employeeId, month)).plan;
  }

  async myPlanWithAcknowledgement(employeeId: string, month: string) {
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
      kind: r.a.kind,
      teamId: r.a.teamId,
      positionId: r.a.positionId,
    }));
    const byId = new Map(rows.map((r) => [r.a.id, r]));
    const monthPlan = buildMonthPlan(planned, month);
    const unacknowledged = new Set(
      rows.filter((r) => r.acknowledgedAt === null).map((r) => r.a.scheduleVersionId),
    );

    const plan: MyPlanView = {
      month,
      timezone: rows[0]?.timezone ?? this.options.defaultTimezone,
      days: monthPlan.days.map((d) => {
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
      totals: monthPlan.totals,
      unacknowledgedVersionIds: [...unacknowledged],
    };
    return {
      plan,
      acknowledgement: acknowledgementSnapshot(employeeId, { kind: 'MONTH', month }, rows),
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
    if (rows.length === 0) return [];
    const segments = await tx
      .select()
      .from(assignmentSegments)
      .where(
        inArray(
          assignmentSegments.assignmentId,
          rows.map((row) => row.a.id),
        ),
      )
      .orderBy(asc(assignmentSegments.assignmentId), asc(assignmentSegments.position));
    const breaks = await tx
      .select()
      .from(assignmentBreaks)
      .where(
        inArray(
          assignmentBreaks.assignmentId,
          rows.map((row) => row.a.id),
        ),
      )
      .orderBy(asc(assignmentBreaks.assignmentId), asc(assignmentBreaks.position));
    const group = <T extends { assignmentId: string }>(items: readonly T[]) => {
      const byAssignment = new Map<string, T[]>();
      for (const item of items) {
        const list = byAssignment.get(item.assignmentId) ?? [];
        list.push(item);
        byAssignment.set(item.assignmentId, list);
      }
      return byAssignment;
    };
    const segmentsBy = group(segments);
    const breaksBy = group(breaks);
    return rows.map((row) => ({
      ...row,
      segments: segmentsBy.get(row.a.id) ?? [],
      breaks: breaksBy.get(row.a.id) ?? [],
    }));
  }

  /** Контекст валідації: опубліковані зміни тих самих працівників поза цією версією і її ключем. */
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
      kind: r.a.kind,
      teamId: r.a.teamId,
      positionId: r.a.positionId,
    }));
  }

  /**
   * Whether anything still points at this version's assignments: a shift somebody worked, or a
   * later version that replaced one of them. Either way the rows cannot go, and the panel must not
   * offer a delete that the database will refuse.
   */
  private async isInUse(versionId: string, tx: DbOrTx = this.db): Promise<boolean> {
    const [used] = await tx.execute<{ used: boolean }>(sql`select ${IN_USE(versionId)} as used`);
    return used?.used === true;
  }

  /** `inUse` matters only for superseded versions; nothing ever points at a draft. */
  private toVersionView(
    row: VersionRow,
    assignmentsCount: number,
    inUse = false,
  ): ScheduleVersionView {
    return {
      id: row.id,
      siteId: row.siteId,
      orgUnitId: row.orgUnitId,
      periodMonth: row.periodMonth,
      versionNo: row.versionNo,
      revision: row.revision,
      status: row.status,
      createdBy: row.createdBy,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedBy: row.approvedBy,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      supersedesId: row.supersedesId,
      changeReason: row.changeReason,
      createdAt: row.createdAt.toISOString(),
      assignmentsCount,
      deletable: (row.status === 'DRAFT' || row.status === 'SUPERSEDED') && !inUse,
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
      customStart: x.a.customStart,
      customEnd: x.a.customEnd,
      segments: x.segments.map((segment) => ({
        id: segment.id,
        position: segment.position,
        zoneId: segment.zoneId,
        localStart: segment.localStart,
        localEnd: segment.localEnd,
      })),
      breaks: x.breaks.map((pause) => ({
        id: pause.id,
        position: pause.position,
        localStart: pause.localStart,
        localEnd: pause.localEnd,
        reliefEmployeeId: pause.reliefEmployeeId,
      })),
    };
  }
}

/** Локальний час 'HH:mm' для текстів бота. */
export function localTime(instant: Date, timezone: string): string {
  return formatLocal(instant, timezone).local.slice(11, 16);
}
