import type { WebUser } from '../auth/web-auth.guard.js';
import { employeeProfileAccess } from './employee-profile-access.js';
import { DomainError } from '../common/domain-error.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, or, gt, inArray, sites, sql, lte } from '@vakhta/db';
import {
  activationCodes,
  assignmentAcknowledgements,
  bonusPeriodResults,
  bonusShiftScores,
  downtimeReports,
  employeePositions,
  employeeCompensationEntries,
  employees,
  handoverRecords,
  handoverReviews,
  mediaObjects,
  notificationOutbox,
  orgUnits,
  positions,
  presenceSessions,
  qrChallengeUses,
  requests,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  teams,
  telegramAccounts,
  type Database,
  type DbOrTx,
  type Transaction,
} from '@vakhta/db';
import { EmployeeStatusSchema } from '@vakhta/contracts';
import type {
  ListEmployeesPageQuery,
  EmployeesPage,
  ChangeEmployeeStatusCommand,
  CreateEmployeeCommand,
  BulkDeleteEmployeesCommand,
  BulkDeleteEmployeesResult,
  DeleteEmployeeCommand,
  UpdateEmployeeCommand,
  EmployeeView,
  ImportEmployeesCommand,
  ImportEmployeesResult,
  RelinkTelegramCommand,
} from '@vakhta/contracts';
import type { AccessScope, Locale, ScopeTarget } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import {
  FULL_SCOPE,
  assertInScope,
  employeePlaceSql,
  placeTarget,
  scopeCondition,
} from '../common/access-scope.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { businessDateOf, nextAnniversary, planInstants } from '@vakhta/domain';
import { DATABASE } from '../infra/database.module.js';
import { TIMER_SCHEDULER, type TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { IdentityError } from './identity.errors.js';

export type EmployeeRecord = typeof employees.$inferSelect;
export type TelegramAccountRecord = typeof telegramAccounts.$inferSelect;

export interface EmployeePosition {
  readonly position: string;
  readonly orgUnit: string;
  readonly team: string | null;
}

export interface LinkedEmployee {
  readonly employee: EmployeeRecord;
  readonly link: TelegramAccountRecord;
}

/** Кадрові картки і привʼязка Telegram (ТЗ 2.2, FR-AUTH-01, FR-AUTH-02). */
@Injectable()
export class EmployeesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    @Optional() @Inject(TIMER_SCHEDULER) private readonly timers?: TimerScheduler,
  ) {}

  /** Next birthday greeting at 09:00 site time (the site of the current position, else Kyiv). */
  private async scheduleGreeting(
    tx: Transaction,
    employeeId: string,
    birthDate: string,
    now = new Date(),
  ): Promise<void> {
    if (!this.timers) return;
    const [place] = await tx
      .select({ timezone: sites.timezone })
      .from(employeePositions)
      .innerJoin(orgUnits, eq(orgUnits.id, employeePositions.orgUnitId))
      .innerJoin(sites, eq(sites.id, orgUnits.siteId))
      .where(
        and(
          eq(employeePositions.employeeId, employeeId),
          sql`${employeePositions.validFrom} <= now()`,
          or(isNull(employeePositions.validTo), gt(employeePositions.validTo, new Date())),
        ),
      )
      .limit(1);
    const timezone = place?.timezone ?? 'Europe/Kyiv';
    const date = nextAnniversary(birthDate, businessDateOf(now, timezone));
    const fireAt = planInstants(
      date,
      { localStart: '09:00', localEnd: '09:01' },
      timezone,
    ).planStartAt;
    await this.timers.scheduleBirthdayGreeting(tx, employeeId, fireAt);
  }

  async create(cmd: CreateEmployeeCommand, actor: Actor): Promise<EmployeeRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(employees)
          .values({
            personnelNumber: cmd.personnelNumber,
            fullName: cmd.fullName,
            status: cmd.status,
            email: cmd.email ?? null,
            phone: cmd.phone ?? null,
            telegramUsername: cmd.telegramUsername ?? null,
            birthDate: cmd.birthDate ?? null,
          })
          .returning();
        if (!row) throw new Error('employees: insert не повернув рядок');
        if (row.birthDate) await this.scheduleGreeting(tx, row.id, row.birthDate);
        await this.events.append(tx, {
          type: 'EMPLOYEE_CREATED',
          source: 'WEB',
          actor,
          employeeId: row.id,
          payload: { personnelNumber: row.personnelNumber, status: row.status },
        });
        await this.audit.record(tx, {
          actor,
          action: 'employee.create',
          objectType: 'employee',
          objectId: row.id,
          after: {
            personnelNumber: row.personnelNumber,
            fullName: row.fullName,
            status: row.status,
          },
        });
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new IdentityError(
          'PERSONNEL_NUMBER_TAKEN',
          `Табельний номер ${cmd.personnelNumber} уже існує`,
        );
      }
      throw error;
    }
  }

  /** HR edits the card: number, name and contacts; every change lands in the audit with before/after. */
  async update(
    id: string,
    cmd: UpdateEmployeeCommand,
    actor: Actor,
    user?: WebUser,
  ): Promise<EmployeeRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(employees)
          .where(eq(employees.id, id))
          .for('update');
        if (!locked) throw new DomainError('EMPLOYEE_NOT_FOUND', 404, 'Employee not found');
        if (user) await employeeProfileAccess(tx, id, user, ['ADMIN', 'HR']);
        const before = locked;
        if (before.status === 'TERMINATED')
          throw new DomainError('EMPLOYEE_READ_ONLY', 409, 'Terminated employee is read-only');
        if (user && !cmd.expectedVersion)
          throw new DomainError('EMPLOYEE_VERSION_REQUIRED', 400, 'Employee version required');
        if (cmd.expectedVersion && cmd.expectedVersion !== before.updatedAt.toISOString())
          throw new DomainError(
            'EMPLOYEE_VERSION_CONFLICT',
            409,
            'Employee changed; reload before saving',
          );
        const set: Partial<typeof employees.$inferInsert> = { updatedAt: new Date() };
        if (cmd.personnelNumber !== undefined) set.personnelNumber = cmd.personnelNumber;
        if (cmd.fullName !== undefined) set.fullName = cmd.fullName;
        if (cmd.email !== undefined) set.email = cmd.email;
        if (cmd.phone !== undefined) set.phone = cmd.phone;
        if (cmd.telegramUsername !== undefined) set.telegramUsername = cmd.telegramUsername;
        if (cmd.birthDate !== undefined) set.birthDate = cmd.birthDate;
        if (cmd.maritalStatus !== undefined) set.maritalStatus = cmd.maritalStatus;
        const [after] = await tx.update(employees).set(set).where(eq(employees.id, id)).returning();
        if (!after) throw new IdentityError('EMPLOYEE_NOT_FOUND', `Працівника ${id} не знайдено`);
        if (after.birthDate && after.birthDate !== before.birthDate)
          await this.scheduleGreeting(tx, after.id, after.birthDate);
        const fields = [
          'personnelNumber',
          'fullName',
          'email',
          'phone',
          'telegramUsername',
          'birthDate',
          'maritalStatus',
        ] as const;
        const changed = fields.filter((f) => before[f] !== after[f]);
        if (changed.length === 0) return after;
        const pick = (row: EmployeeRecord) =>
          Object.fromEntries(
            changed.map((f) => [
              f,
              f === 'maritalStatus' || f === 'birthDate' ? '[REDACTED]' : row[f],
            ]),
          ) as Record<string, unknown>;
        await this.events.append(tx, {
          type: 'EMPLOYEE_UPDATED',
          source: 'WEB',
          actor,
          employeeId: id,
          payload: { fields: changed },
        });
        await this.audit.record(tx, {
          actor,
          action: 'employee.update',
          objectType: 'employee',
          objectId: id,
          before: pick(before),
          after: pick(after),
        });
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new IdentityError(
          'PERSONNEL_NUMBER_TAKEN',
          `Табельний номер ${cmd.personnelNumber ?? ''} уже існує`,
        );
      }
      throw error;
    }
  }

  /**
   * Hard delete of a card without worked history (spec 13 keeps everything that was worked:
   * shifts, presence, scores, reports, requests). Planned assignments, acknowledgements, codes,
   * links and queued notifications go with the card; the audit keeps who deleted whom and why.
   */
  async deleteEmployee(id: string, cmd: DeleteEmployeeCommand, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, id))
        .for('no key update');
      const before = await this.requireById(id, tx);
      const history: [string, Promise<{ id: string }[]>][] = [
        [
          'employee_compensation_entries',
          tx
            .select({ id: employeeCompensationEntries.id })
            .from(employeeCompensationEntries)
            .where(eq(employeeCompensationEntries.employeeId, id))
            .limit(1),
        ],
        [
          'org_units.master',
          tx
            .select({ id: orgUnits.id })
            .from(orgUnits)
            .where(eq(orgUnits.masterEmployeeId, id))
            .limit(1),
        ],
        [
          'shift_sessions',
          tx
            .select({ id: shiftSessions.id })
            .from(shiftSessions)
            .where(eq(shiftSessions.employeeId, id))
            .limit(1),
        ],
        [
          'presence_sessions',
          tx
            .select({ id: presenceSessions.id })
            .from(presenceSessions)
            .where(eq(presenceSessions.employeeId, id))
            .limit(1),
        ],
        [
          'bonus_shift_scores',
          tx
            .select({ id: bonusShiftScores.id })
            .from(bonusShiftScores)
            .where(eq(bonusShiftScores.employeeId, id))
            .limit(1),
        ],
        [
          'bonus_period_results',
          tx
            .select({ id: bonusPeriodResults.id })
            .from(bonusPeriodResults)
            .where(eq(bonusPeriodResults.employeeId, id))
            .limit(1),
        ],
        [
          'handover_records',
          tx
            .select({ id: handoverRecords.id })
            .from(handoverRecords)
            .where(eq(handoverRecords.submittedBy, id))
            .limit(1),
        ],
        [
          'handover_reviews',
          tx
            .select({ id: handoverReviews.id })
            .from(handoverReviews)
            .where(eq(handoverReviews.reviewerEmployeeId, id))
            .limit(1),
        ],
        [
          'requests',
          tx
            .select({ id: requests.id })
            .from(requests)
            .where(or(eq(requests.employeeId, id), eq(requests.counterpartEmployeeId, id)))
            .limit(1),
        ],
        [
          'downtime_reports',
          tx
            .select({ id: downtimeReports.id })
            .from(downtimeReports)
            .where(eq(downtimeReports.employeeId, id))
            .limit(1),
        ],
        [
          'media_objects',
          tx
            .select({ id: mediaObjects.id })
            .from(mediaObjects)
            .where(eq(mediaObjects.uploadedBy, id))
            .limit(1),
        ],
        [
          'qr_challenge_uses',
          tx
            .select({ id: qrChallengeUses.id })
            .from(qrChallengeUses)
            .where(eq(qrChallengeUses.employeeId, id))
            .limit(1),
        ],
        [
          'shift_summaries',
          tx
            .select({ id: shiftSummaries.shiftSessionId })
            .from(shiftSummaries)
            .where(eq(shiftSummaries.employeeId, id))
            .limit(1),
        ],
        [
          'employee_positions.manager',
          tx
            .select({ id: employeePositions.id })
            .from(employeePositions)
            .where(eq(employeePositions.managerEmployeeId, id))
            .limit(1),
        ],
      ];
      for (const [table, query] of history) {
        if ((await query).length > 0) {
          throw new IdentityError(
            'EMPLOYEE_HAS_HISTORY',
            `Employee ${id} has worked history (${table}); terminate the card instead`,
          );
        }
      }
      await tx
        .delete(assignmentAcknowledgements)
        .where(eq(assignmentAcknowledgements.employeeId, id));
      // Lock parent versions before touching their assignments, matching schedule writer order.
      await tx
        .select({ id: scheduleVersions.id })
        .from(scheduleVersions)
        .where(
          inArray(
            scheduleVersions.id,
            tx
              .select({ id: shiftAssignments.scheduleVersionId })
              .from(shiftAssignments)
              .where(eq(shiftAssignments.employeeId, id)),
          ),
        )
        .orderBy(asc(scheduleVersions.id))
        .for('update');
      const removedAssignments = await tx
        .delete(shiftAssignments)
        .where(eq(shiftAssignments.employeeId, id))
        .returning({ versionId: shiftAssignments.scheduleVersionId });
      // Use actual deleted rows too: concurrent new references must never bypass revision fencing.
      for (const versionId of [...new Set(removedAssignments.map((row) => row.versionId))].sort()) {
        await tx
          .update(scheduleVersions)
          .set({ updatedAt: new Date() })
          .where(eq(scheduleVersions.id, versionId));
      }
      await tx.delete(activationCodes).where(eq(activationCodes.employeeId, id));
      await tx.delete(telegramAccounts).where(eq(telegramAccounts.employeeId, id));
      await tx.delete(employeePositions).where(eq(employeePositions.employeeId, id));
      await tx
        .delete(notificationOutbox)
        .where(
          and(
            eq(notificationOutbox.recipientType, 'EMPLOYEE'),
            eq(notificationOutbox.recipientId, id),
          ),
        );
      if (before.avatarMediaId)
        await tx
          .update(mediaObjects)
          .set({ retentionUntil: new Date() })
          .where(eq(mediaObjects.id, before.avatarMediaId));
      await tx.delete(employees).where(eq(employees.id, id));
      await this.events.append(tx, {
        type: 'EMPLOYEE_DELETED',
        source: 'WEB',
        actor,
        employeeId: id,
        comment: cmd.reason,
        payload: { personnelNumber: before.personnelNumber },
      });
      await this.audit.record(tx, {
        actor,
        action: 'employee.delete',
        objectType: 'employee',
        objectId: id,
        before: {
          personnelNumber: before.personnelNumber,
          fullName: before.fullName,
          status: before.status,
        },
        reason: cmd.reason,
      });
    });
  }

  /**
   * Delete a batch: a card without worked history is removed, a card with history is terminated
   * (TERMINATED) so its records stay. Each card runs on its own so one failure never rolls back
   * the rest; the result reports the two counts for the toast.
   */
  async bulkDelete(
    cmd: BulkDeleteEmployeesCommand,
    actor: Actor,
  ): Promise<BulkDeleteEmployeesResult> {
    let deleted = 0;
    let terminated = 0;
    for (const id of cmd.ids) {
      try {
        await this.deleteEmployee(id, { reason: cmd.reason }, actor);
        deleted += 1;
      } catch (error) {
        if (!(error instanceof IdentityError && error.code === 'EMPLOYEE_HAS_HISTORY')) throw error;
        await this.terminateKept(id, cmd.reason, actor);
        terminated += 1;
      }
    }
    return { deleted, terminated };
  }

  /** A card with history stays; an already terminated one is not rewritten, so the audit gets no no-op change. */
  private async terminateKept(id: string, reason: string, actor: Actor): Promise<void> {
    const card = await this.requireById(id);
    if (card.status === EmployeeStatusSchema.enum.TERMINATED) return;
    await this.changeStatus(id, { status: EmployeeStatusSchema.enum.TERMINATED, reason }, actor);
  }

  /** The full view of one employee: link state and the current assignment included. */
  async viewOf(id: string): Promise<EmployeeView> {
    const row = await this.requireById(id);
    const [link, current] = await Promise.all([
      this.activeLinkByEmployee(id),
      this.currentPositions([id]),
    ]);
    return this.toView(row, link !== null, current.get(id) ?? null);
  }

  /** Interface language chosen in the bot; a preference, not a business event, so no audit row. */
  async setLocale(employeeId: string, locale: Locale, tx: DbOrTx = this.db): Promise<void> {
    await tx
      .update(employees)
      .set({ locale, updatedAt: new Date() })
      .where(eq(employees.id, employeeId));
  }

  /**
   * CSV import: rows are created one by one so a duplicate personnel number skips only that
   * row. Each created card gets the usual event and audit entry.
   */
  async importMany(cmd: ImportEmployeesCommand, actor: Actor): Promise<ImportEmployeesResult> {
    const seen = new Set<string>();
    const skipped: ImportEmployeesResult['skipped'] = [];
    let created = 0;
    for (const item of cmd.items) {
      if (seen.has(item.personnelNumber)) {
        skipped.push({ personnelNumber: item.personnelNumber, reason: 'DUPLICATE' });
        continue;
      }
      seen.add(item.personnelNumber);
      try {
        await this.create({ ...item, status: 'ACTIVE' }, actor);
        created += 1;
      } catch (e) {
        if (e instanceof IdentityError && e.code === 'PERSONNEL_NUMBER_TAKEN') {
          skipped.push({ personnelNumber: item.personnelNumber, reason: 'DUPLICATE' });
        } else if (e instanceof IdentityError) {
          skipped.push({ personnelNumber: item.personnelNumber, reason: 'INVALID' });
        } else throw e;
      }
    }
    return { created, skipped };
  }

  async getById(id: string, tx: DbOrTx = this.db): Promise<EmployeeRecord | null> {
    const [row] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
    return row ?? null;
  }

  async requireById(id: string, tx: DbOrTx = this.db): Promise<EmployeeRecord> {
    const row = await this.getById(id, tx);
    if (!row) throw new IdentityError('EMPLOYEE_NOT_FOUND', `Працівника ${id} не знайдено`);
    return row;
  }

  /**
   * A message from the panel to one employee's bot (spec 10): no state changes, the employee is
   * only the address. Refused when nobody is on the other end — an unlinked employee has no bot,
   * and an enqueued notification for them would sit in the outbox forever.
   */
  async message(employeeId: string, text: string, actor: Actor, now: Date = new Date()) {
    const employee = await this.requireById(employeeId);
    const [link] = await this.db
      .select({ id: telegramAccounts.id })
      .from(telegramAccounts)
      .where(
        and(eq(telegramAccounts.employeeId, employeeId), eq(telegramAccounts.status, 'ACTIVE')),
      )
      .limit(1);
    if (!link) {
      throw new IdentityError(
        'EMPLOYEE_NOT_LINKED',
        `Employee ${employeeId} has no active Telegram link`,
      );
    }
    await this.db.transaction(async (tx) => {
      await this.events.append(tx, {
        type: 'EMPLOYEE_MESSAGE_SENT',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId,
        comment: text,
        payload: {},
      });
      await this.audit.record(tx, {
        actor,
        action: 'employee.message',
        objectType: 'employee',
        objectId: employeeId,
        reason: text,
      });
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: employeeId,
        template: 'MASTER_MESSAGE',
        payload: (t) => ({ text: format(t.shift.masterMessage, { text }) }),
        dedupeKey: `employee-message:${employeeId}:${now.getTime()}`,
      });
    });
    return { employeeId, fullName: employee.fullName };
  }

  /**
   * Directory reads are limited to the reader's scope by the employee's open assignment. An
   * employee without one has no place, so only an enterprise-wide reader sees them (spec 005 A6).
   */
  async restrictView(view: EmployeeView, user: WebUser): Promise<EmployeeView> {
    const access = await employeeProfileAccess(this.db, view.id, user);
    if (access.birthDate === 'FULL') return view;
    const { birthDate: _birthDate, ...safe } = view;
    return safe;
  }

  async list(limit = 200, scope: AccessScope = FULL_SCOPE): Promise<EmployeeView[]> {
    const rows = await this.db
      .select({ employee: employees, linkId: telegramAccounts.id })
      .from(employees)
      .leftJoin(
        telegramAccounts,
        and(eq(telegramAccounts.employeeId, employees.id), eq(telegramAccounts.status, 'ACTIVE')),
      )
      .where(scopeCondition(scope, employeePlaceSql(employees.id)))
      .orderBy(desc(employees.createdAt))
      .limit(limit);
    const current = await this.currentPositions(rows.map((r) => r.employee.id));
    return rows.map((r) =>
      this.toView(r.employee, r.linkId !== null, current.get(r.employee.id) ?? null),
    );
  }

  async listPage(
    query: ListEmployeesPageQuery,
    scope: AccessScope = FULL_SCOPE,
  ): Promise<EmployeesPage> {
    const inScope = scopeCondition(scope, employeePlaceSql(employees.id));
    return this.db.transaction(
      async (tx) => {
        const [collection] = await tx.select({ total: count() }).from(employees).where(inScope);
        const rows = await tx
          .select({ employee: employees, linkId: telegramAccounts.id })
          .from(employees)
          .leftJoin(
            telegramAccounts,
            and(
              eq(telegramAccounts.employeeId, employees.id),
              eq(telegramAccounts.status, 'ACTIVE'),
            ),
          )
          .where(and(inScope, query.after ? gt(employees.id, query.after) : undefined))
          .orderBy(asc(employees.id))
          .limit(query.limit + 1);
        const page = rows.slice(0, query.limit);
        const current = await this.currentPositions(
          page.map((row) => row.employee.id),
          new Date(),
          tx,
        );
        return {
          items: page.map((row) =>
            this.toView(row.employee, row.linkId !== null, current.get(row.employee.id) ?? null),
          ),
          total: collection?.total ?? 0,
          nextCursor: rows.length > query.limit ? (page.at(-1)?.employee.id ?? null) : null,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /**
   * Place of an employee for scope checks: the open assignment, as the directory filter uses.
   * Null when the employee does not exist or has no open assignment.
   */
  async placeOf(employeeId: string, reader: DbOrTx = this.db): Promise<ScopeTarget | null> {
    const [row] = await reader
      .select({
        siteId: orgUnits.siteId,
        orgUnitId: employeePositions.orgUnitId,
        teamId: employeePositions.teamId,
      })
      .from(employeePositions)
      .innerJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
      .where(
        and(
          eq(employeePositions.employeeId, employeeId),
          sql`${employeePositions.validFrom} <= now()`,
          or(isNull(employeePositions.validTo), gt(employeePositions.validTo, new Date())),
        ),
      )
      .orderBy(desc(employeePositions.validFrom))
      .limit(1);
    return row ? placeTarget(row) : null;
  }

  /**
   * Whether the employee was ever scheduled inside the scope. A unit's calendar names people
   * borrowed from other units; its readers may look those people up by identifier.
   */
  async scheduledInScope(scope: AccessScope, employeeId: string): Promise<boolean> {
    if (scope.all) return true;
    const [row] = await this.db
      .select({ id: shiftAssignments.id })
      .from(shiftAssignments)
      .innerJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .where(
        and(
          eq(shiftAssignments.employeeId, employeeId),
          scopeCondition(scope, {
            site: orgUnits.siteId,
            unit: shiftAssignments.orgUnitId,
            team: shiftAssignments.teamId,
            zone: shiftAssignments.zoneId,
          }),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * The place a scoped writer puts an employee (create, transfer) must be inside their scope, team
   * included: a team-scoped writer cannot move a person out of their team. A missing unit is
   * forbidden too, so identifiers cannot be probed.
   */
  async assertPlaceInScope(
    scope: AccessScope,
    orgUnitId: string,
    teamId: string | null,
    reader: DbOrTx = this.db,
  ): Promise<void> {
    if (scope.all) return;
    const [unit] = await reader
      .select({ siteId: orgUnits.siteId })
      .from(orgUnits)
      .where(eq(orgUnits.id, orgUnitId))
      .limit(1);
    assertInScope(scope, unit ? placeTarget({ siteId: unit.siteId, orgUnitId, teamId }) : null);
  }

  /** Assignment in force per employee (open-ended or not yet expired), newest first. */
  private async currentPositions(
    employeeIds: readonly string[],
    now: Date = new Date(),
    reader: DbOrTx = this.db,
  ): Promise<Map<string, EmployeeView['currentPosition']>> {
    const map = new Map<string, EmployeeView['currentPosition']>();
    if (employeeIds.length === 0) return map;
    const rows = await reader
      .select({
        employeeId: employeePositions.employeeId,
        positionId: employeePositions.positionId,
        orgUnitId: employeePositions.orgUnitId,
        teamId: employeePositions.teamId,
      })
      .from(employeePositions)
      .where(
        and(
          inArray(employeePositions.employeeId, [...employeeIds]),
          lte(employeePositions.validFrom, now),
          or(isNull(employeePositions.validTo), gt(employeePositions.validTo, now)),
        ),
      )
      .orderBy(desc(employeePositions.validFrom));
    for (const r of rows) {
      if (!map.has(r.employeeId)) {
        map.set(r.employeeId, {
          positionId: r.positionId,
          orgUnitId: r.orgUnitId,
          teamId: r.teamId,
        });
      }
    }
    return map;
  }

  async activeLinkByEmployee(
    employeeId: string,
    tx: DbOrTx = this.db,
  ): Promise<TelegramAccountRecord | null> {
    const [row] = await tx
      .select()
      .from(telegramAccounts)
      .where(
        and(eq(telegramAccounts.employeeId, employeeId), eq(telegramAccounts.status, 'ACTIVE')),
      )
      .limit(1);
    return row ?? null;
  }

  async activeLinkByTelegramUser(
    telegramUserId: number,
    tx: DbOrTx = this.db,
  ): Promise<TelegramAccountRecord | null> {
    const [row] = await tx
      .select()
      .from(telegramAccounts)
      .where(
        and(
          eq(telegramAccounts.telegramUserId, telegramUserId),
          eq(telegramAccounts.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Хто пише в бота. Лише активна привʼязка; відкликана не дає доступу (FR-AUTH-02). */
  async findByTelegramUserId(telegramUserId: number): Promise<LinkedEmployee | null> {
    const [row] = await this.db
      .select({ employee: employees, link: telegramAccounts })
      .from(telegramAccounts)
      .innerJoin(employees, eq(telegramAccounts.employeeId, employees.id))
      .where(
        and(
          eq(telegramAccounts.telegramUserId, telegramUserId),
          eq(telegramAccounts.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Чинне кадрове призначення для маскованої картки в боті. */
  async currentPosition(
    employeeId: string,
    now: Date = new Date(),
  ): Promise<EmployeePosition | null> {
    const [row] = await this.db
      .select({ position: positions.name, orgUnit: orgUnits.name, team: teams.name })
      .from(employeePositions)
      .innerJoin(positions, eq(employeePositions.positionId, positions.id))
      .innerJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
      .leftJoin(teams, eq(employeePositions.teamId, teams.id))
      .where(
        and(
          eq(employeePositions.employeeId, employeeId),
          or(isNull(employeePositions.validTo), gt(employeePositions.validTo, now)),
        ),
      )
      .orderBy(desc(employeePositions.validFrom))
      .limit(1);
    return row ?? null;
  }

  async changeStatus(
    id: string,
    cmd: ChangeEmployeeStatusCommand,
    actor: Actor,
  ): Promise<EmployeeRecord> {
    return this.db.transaction(async (tx) => {
      const before = await this.requireById(id, tx);
      const [after] = await tx
        .update(employees)
        .set({ status: cmd.status, updatedAt: new Date() })
        .where(eq(employees.id, id))
        .returning();
      if (!after) throw new IdentityError('EMPLOYEE_NOT_FOUND', `Працівника ${id} не знайдено`);
      // Dismissal frees the Telegram account (2026-09-08): the link is unique per account, so a
      // closed card holding one keeps that phone from ever activating another card — including the
      // same person's new card when they are hired back. Blocking is temporary and keeps its link.
      if (after.status === 'TERMINATED' && before.status !== 'TERMINATED') {
        await this.revokeTelegramLink(tx, id, actor, cmd.reason, 'TERMINATION');
      }
      await this.events.append(tx, {
        type: 'EMPLOYEE_STATUS_CHANGED',
        source: 'WEB',
        actor,
        employeeId: id,
        comment: cmd.reason,
        payload: { from: before.status, to: after.status },
      });
      await this.audit.record(tx, {
        actor,
        action: 'employee.status.change',
        objectType: 'employee',
        objectId: id,
        before: { status: before.status },
        after: { status: after.status },
        reason: cmd.reason,
      });
      return after;
    });
  }

  /** Revokes the employee's active Telegram link, if any, and records why it went. */
  private async revokeTelegramLink(
    tx: Transaction,
    employeeId: string,
    actor: Actor,
    reason: string,
    via: 'TERMINATION' | 'RELINK' | 'UNLINK',
  ): Promise<boolean> {
    const current = await this.activeLinkByEmployee(employeeId, tx);
    if (!current) return false;
    await tx
      .update(telegramAccounts)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedBy: actor.id,
        revokeReason: reason,
      })
      .where(eq(telegramAccounts.id, current.id));
    await this.events.append(tx, {
      type: 'TELEGRAM_LINK_REVOKED',
      source: 'WEB',
      actor,
      employeeId,
      comment: reason,
      payload: { telegramUserId: current.telegramUserId, via },
    });
    return true;
  }

  /**
   * FR-AUTH-02: перепривʼязка лише HR/адміністратором. Стара привʼязка стає REVOKED
   * з автором і причиною, нова створюється в тій самій транзакції.
   */
  async relinkTelegram(
    employeeId: string,
    cmd: RelinkTelegramCommand,
    actor: Actor,
  ): Promise<TelegramAccountRecord> {
    return this.db.transaction(async (tx) => {
      const employee = await this.requireById(employeeId, tx);
      if (employee.status !== 'ACTIVE') {
        throw new IdentityError(
          'EMPLOYEE_NOT_ACTIVE',
          'Привʼязати можна лише активного працівника',
        );
      }

      const takenBy = await this.activeLinkByTelegramUser(cmd.telegramUserId, tx);
      if (takenBy && takenBy.employeeId !== employeeId) {
        throw new IdentityError(
          'TELEGRAM_USER_TAKEN',
          'Цей Telegram-акаунт уже привʼязаний до іншого працівника',
        );
      }

      const current = await this.activeLinkByEmployee(employeeId, tx);
      if (current && current.telegramUserId === cmd.telegramUserId) {
        throw new IdentityError('SAME_TELEGRAM_USER', 'Цей акаунт уже привʼязаний до картки');
      }

      if (current) {
        await tx
          .update(telegramAccounts)
          .set({
            status: 'REVOKED',
            revokedAt: new Date(),
            revokedBy: actor.id,
            revokeReason: cmd.reason,
          })
          .where(eq(telegramAccounts.id, current.id));
        await this.events.append(tx, {
          type: 'TELEGRAM_LINK_REVOKED',
          source: 'WEB',
          actor,
          employeeId,
          comment: cmd.reason,
          payload: { telegramUserId: current.telegramUserId, via: 'RELINK' },
        });
      }

      const [link] = await tx
        .insert(telegramAccounts)
        .values({ employeeId, telegramUserId: cmd.telegramUserId, status: 'ACTIVE' })
        .returning();
      if (!link) throw new Error('telegram_accounts: insert не повернув рядок');

      await this.events.append(tx, {
        type: 'TELEGRAM_LINKED',
        source: 'WEB',
        actor,
        employeeId,
        comment: cmd.reason,
        payload: { telegramUserId: cmd.telegramUserId, via: 'RELINK' },
      });
      await this.audit.record(tx, {
        actor,
        action: 'employee.telegram.relink',
        objectType: 'employee',
        objectId: employeeId,
        before: { telegramUserId: current?.telegramUserId ?? null },
        after: { telegramUserId: cmd.telegramUserId },
        reason: cmd.reason,
      });
      return link;
    });
  }

  toView(
    row: EmployeeRecord,
    telegramLinked: boolean,
    currentPosition: EmployeeView['currentPosition'] = null,
  ): EmployeeView {
    return {
      id: row.id,
      personnelNumber: row.personnelNumber,
      fullName: row.fullName,
      status: row.status,
      telegramLinked,
      email: row.email,
      phone: row.phone,
      telegramUsername: row.telegramUsername,
      birthDate: row.birthDate,
      avatarVersion: row.avatarMediaId,
      updatedAt: row.updatedAt.toISOString(),
      currentPosition,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
