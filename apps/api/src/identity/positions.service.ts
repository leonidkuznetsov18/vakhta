import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from '@vakhta/db';
import { employeePositions, type Database } from '@vakhta/db';
import type { AssignPositionCommand, EmployeePositionView } from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { OrgService } from '../org/org.service.js';
import { EmployeesService } from './employees.service.js';

type PositionRecord = typeof employeePositions.$inferSelect;

/** Кадрове призначення як версія: перевід закриває попередню і відкриває нову (ТЗ 2.2). */
@Injectable()
export class PositionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly employees: EmployeesService,
    private readonly org: OrgService,
  ) {}

  async assign(
    employeeId: string,
    cmd: AssignPositionCommand,
    actor: Actor,
  ): Promise<EmployeePositionView> {
    const validFrom = cmd.validFrom ? new Date(cmd.validFrom) : new Date();
    return this.db.transaction(async (tx) => {
      await this.employees.requireById(employeeId, tx);
      await this.org.requireOrgUnit(cmd.orgUnitId, undefined, tx);
      await this.org.requirePosition(cmd.positionId, tx);
      if (cmd.teamId) await this.org.requireTeam(cmd.teamId, cmd.orgUnitId, tx);
      if (cmd.managerEmployeeId) {
        if (cmd.managerEmployeeId === employeeId) {
          throw new DomainError('SELF_MANAGER', 422, 'Працівник не може бути власним керівником');
        }
        await this.employees.requireById(cmd.managerEmployeeId, tx);
      }

      const [current] = await tx
        .select()
        .from(employeePositions)
        .where(and(eq(employeePositions.employeeId, employeeId), isNull(employeePositions.validTo)))
        .orderBy(desc(employeePositions.validFrom))
        .limit(1);
      if (current && current.validFrom.getTime() > validFrom.getTime()) {
        throw new DomainError(
          'VALID_FROM_BEFORE_CURRENT',
          422,
          'Нове призначення не може починатись раніше за чинне',
        );
      }
      if (current) {
        await tx
          .update(employeePositions)
          .set({ validTo: validFrom })
          .where(eq(employeePositions.id, current.id));
      }

      const [row] = await tx
        .insert(employeePositions)
        .values({
          employeeId,
          orgUnitId: cmd.orgUnitId,
          positionId: cmd.positionId,
          teamId: cmd.teamId ?? null,
          managerEmployeeId: cmd.managerEmployeeId ?? null,
          validFrom,
        })
        .returning();
      if (!row) throw new Error('employee_positions: insert не повернув рядок');

      await this.events.append(tx, {
        type: 'EMPLOYEE_POSITION_ASSIGNED',
        source: 'WEB',
        actor,
        employeeId,
        payload: {
          orgUnitId: cmd.orgUnitId,
          positionId: cmd.positionId,
          teamId: cmd.teamId ?? null,
          previousPositionId: current?.id ?? null,
          validFrom: validFrom.toISOString(),
        },
      });
      await this.audit.record(tx, {
        actor,
        action: 'employee.position.assign',
        objectType: 'employee',
        objectId: employeeId,
        before: current ? { orgUnitId: current.orgUnitId, positionId: current.positionId } : null,
        after: { orgUnitId: cmd.orgUnitId, positionId: cmd.positionId, teamId: cmd.teamId ?? null },
      });
      return this.toView(row);
    });
  }

  async history(employeeId: string): Promise<EmployeePositionView[]> {
    const rows = await this.db
      .select()
      .from(employeePositions)
      .where(eq(employeePositions.employeeId, employeeId))
      .orderBy(desc(employeePositions.validFrom));
    return rows.map((r) => this.toView(r));
  }

  private toView(row: PositionRecord): EmployeePositionView {
    return {
      id: row.id,
      employeeId: row.employeeId,
      orgUnitId: row.orgUnitId,
      positionId: row.positionId,
      teamId: row.teamId,
      managerEmployeeId: row.managerEmployeeId,
      validFrom: row.validFrom.toISOString(),
      validTo: row.validTo?.toISOString() ?? null,
    };
  }
}
