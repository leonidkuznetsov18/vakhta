import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, gt, inArray } from '@vakhta/db';
import {
  activationCodes,
  assignmentAcknowledgements,
  bonusPeriodResults,
  bonusShiftScores,
  downtimeReports,
  employeePositions,
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
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  teams,
  telegramAccounts,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import type {
  ChangeEmployeeStatusCommand,
  CreateEmployeeCommand,
  DeleteEmployeeCommand,
  UpdateEmployeeCommand,
  EmployeeView,
  ImportEmployeesCommand,
  ImportEmployeesResult,
  RelinkTelegramCommand,
} from '@vakhta/contracts';
import type { Locale } from '@vakhta/domain';
import type { Actor } from '../common/actor.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
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
  ) {}

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
          })
          .returning();
        if (!row) throw new Error('employees: insert не повернув рядок');
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
  async update(id: string, cmd: UpdateEmployeeCommand, actor: Actor): Promise<EmployeeRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const before = await this.requireById(id, tx);
        const set: Partial<typeof employees.$inferInsert> = { updatedAt: new Date() };
        if (cmd.personnelNumber !== undefined) set.personnelNumber = cmd.personnelNumber;
        if (cmd.fullName !== undefined) set.fullName = cmd.fullName;
        if (cmd.email !== undefined) set.email = cmd.email;
        if (cmd.phone !== undefined) set.phone = cmd.phone;
        if (cmd.telegramUsername !== undefined) set.telegramUsername = cmd.telegramUsername;
        const [after] = await tx.update(employees).set(set).where(eq(employees.id, id)).returning();
        if (!after) throw new IdentityError('EMPLOYEE_NOT_FOUND', `Працівника ${id} не знайдено`);
        const fields = [
          'personnelNumber',
          'fullName',
          'email',
          'phone',
          'telegramUsername',
        ] as const;
        const changed = fields.filter((f) => before[f] !== after[f]);
        if (changed.length === 0) return after;
        const pick = (row: EmployeeRecord) =>
          Object.fromEntries(changed.map((f) => [f, row[f]])) as Record<string, unknown>;
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
      const before = await this.requireById(id, tx);
      const history: [string, Promise<{ id: string }[]>][] = [
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
      await tx.delete(shiftAssignments).where(eq(shiftAssignments.employeeId, id));
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

  async list(limit = 200): Promise<EmployeeView[]> {
    const rows = await this.db
      .select({ employee: employees, linkId: telegramAccounts.id })
      .from(employees)
      .leftJoin(
        telegramAccounts,
        and(eq(telegramAccounts.employeeId, employees.id), eq(telegramAccounts.status, 'ACTIVE')),
      )
      .orderBy(desc(employees.createdAt))
      .limit(limit);
    const current = await this.currentPositions(rows.map((r) => r.employee.id));
    return rows.map((r) =>
      this.toView(r.employee, r.linkId !== null, current.get(r.employee.id) ?? null),
    );
  }

  /** Assignment in force per employee (open-ended or not yet expired), newest first. */
  private async currentPositions(
    employeeIds: readonly string[],
    now: Date = new Date(),
  ): Promise<Map<string, EmployeeView['currentPosition']>> {
    const map = new Map<string, EmployeeView['currentPosition']>();
    if (employeeIds.length === 0) return map;
    const rows = await this.db
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
      currentPosition,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
