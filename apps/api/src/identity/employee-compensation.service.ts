import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  employeeCompensationEntries,
  employeePositions,
  orgUnits,
  sites,
  employees,
  eq,
  gt,
  isNull,
  lte,
  or,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { businessDateOf, compensationHistory, effectiveCompensation } from '@vakhta/domain';
import { AddCompensationEntryCommand, CompensationView } from '@vakhta/contracts';
import { webUserActor, type WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';
import { employeeProfileAccess } from './employee-profile-access.js';

@Injectable()
export class EmployeeCompensationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}

  async authorize(employeeId: string, user: WebUser, write: boolean) {
    try {
      const access = await employeeProfileAccess(this.db, employeeId, user);
      if (access.compensation === 'NONE' || (write && access.compensation !== 'WRITE'))
        throw new DomainError('FORBIDDEN', 403, 'Compensation access denied');
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      await this.audit.record(this.db, {
        actor: webUserActor(user),
        action: 'employee.compensation.denied',
        objectType: 'employee',
        objectId: employeeId,
      });
      throw error;
    }
  }

  async read(reader: DbOrTx, employeeId: string, asOf: string): Promise<CompensationView> {
    const rows = await reader
      .select()
      .from(employeeCompensationEntries)
      .where(eq(employeeCompensationEntries.employeeId, employeeId))
      .orderBy(
        desc(employeeCompensationEntries.effectiveFrom),
        desc(employeeCompensationEntries.createdAt),
      );
    const entries = rows.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }));
    return CompensationView.parse({
      asOf,
      current: effectiveCompensation(entries, asOf),
      history: compensationHistory(entries, asOf),
    });
  }

  async get(employeeId: string, user: WebUser, asOf?: string) {
    await this.authorize(employeeId, user, false);
    return this.db.transaction(
      async (tx) => {
        await employeeProfileAccess(tx, employeeId, user, ['ADMIN', 'HR', 'ACCOUNTANT']);
        const now = new Date();
        const [site] = await tx
          .select({ timezone: sites.timezone })
          .from(employeePositions)
          .innerJoin(orgUnits, eq(orgUnits.id, employeePositions.orgUnitId))
          .innerJoin(sites, eq(sites.id, orgUnits.siteId))
          .where(
            and(
              eq(employeePositions.employeeId, employeeId),
              lte(employeePositions.validFrom, now),
              or(isNull(employeePositions.validTo), gt(employeePositions.validTo, now)),
            ),
          )
          .orderBy(desc(employeePositions.validFrom))
          .limit(1);
        return this.read(
          tx,
          employeeId,
          asOf ?? businessDateOf(now, site?.timezone ?? 'Europe/Kyiv'),
        );
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async add(employeeId: string, input: AddCompensationEntryCommand, user: WebUser) {
    const command = AddCompensationEntryCommand.parse(input);
    await this.authorize(employeeId, user, true);
    return this.db.transaction(async (tx) => {
      const [employee] = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .for('update');
      await employeeProfileAccess(tx, employeeId, user, ['ADMIN', 'HR']);
      if (!employee) throw new DomainError('EMPLOYEE_NOT_FOUND', 404, 'Employee not found');
      if (employee.status === 'TERMINATED')
        throw new DomainError('EMPLOYEE_READ_ONLY', 409, 'Terminated employee is read-only');
      const sameDate = await tx
        .select()
        .from(employeeCompensationEntries)
        .where(
          and(
            eq(employeeCompensationEntries.employeeId, employeeId),
            eq(employeeCompensationEntries.effectiveFrom, command.effectiveFrom),
          ),
        );
      const current = effectiveCompensation(
        sameDate.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
        command.effectiveFrom,
      );
      if ((current?.id ?? null) !== command.correctsEntryId)
        throw new DomainError(
          'COMPENSATION_VERSION_CONFLICT',
          409,
          'Correct the latest entry for this date',
        );
      const [entry] = await tx
        .insert(employeeCompensationEntries)
        .values({ ...command, employeeId, createdBy: user.id })
        .returning({ id: employeeCompensationEntries.id });
      if (!entry) throw new Error('Compensation insert returned no entry');
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: 'employee.compensation.add',
        objectType: 'employee',
        objectId: employeeId,
        after: { entryId: entry.id, correctsEntryId: command.correctsEntryId },
      });
      return entry;
    });
  }
}
