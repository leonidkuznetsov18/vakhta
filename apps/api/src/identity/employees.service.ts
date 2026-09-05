import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, gt } from '@vakhta/db';
import {
  employeePositions,
  employees,
  orgUnits,
  positions,
  teams,
  telegramAccounts,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import type {
  ChangeEmployeeStatusCommand,
  CreateEmployeeCommand,
  EmployeeView,
  RelinkTelegramCommand,
} from '@vakhta/contracts';
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
    return rows.map((r) => this.toView(r.employee, r.linkId !== null));
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

  toView(row: EmployeeRecord, telegramLinked: boolean): EmployeeView {
    return {
      id: row.id,
      personnelNumber: row.personnelNumber,
      fullName: row.fullName,
      status: row.status,
      telegramLinked,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
