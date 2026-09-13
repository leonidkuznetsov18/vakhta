import { Inject, Injectable } from '@nestjs/common';
import { employees, eq, orgUnits, type Database } from '@vakhta/db';
import { canActOn } from '@vakhta/domain';
import { webUserActor, type WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';

@Injectable()
export class UnitMasterService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}
  async set(id: string, employeeId: string | null, user: WebUser) {
    return this.db.transaction(async (tx) => {
      const [unit] = await tx.select().from(orgUnits).where(eq(orgUnits.id, id)).for('update');
      if (!unit || !canActOn(user.grants, ['ADMIN'], { siteId: unit.siteId, orgUnitId: id }))
        throw new DomainError('OUT_OF_SCOPE', 403, 'Unit outside administrator scope');
      if (employeeId) {
        const [employee] = await tx
          .select()
          .from(employees)
          .where(eq(employees.id, employeeId))
          .for('share');
        if (!employee || employee.status !== 'ACTIVE')
          throw new DomainError('MASTER_NOT_ACTIVE', 409, 'Master must be an active employee');
      }
      if (unit.masterEmployeeId === employeeId) return { employeeId };
      await tx
        .update(orgUnits)
        .set({
          masterEmployeeId: employeeId,
          masterAssignedAt: employeeId ? new Date() : null,
          masterAssignedBy: employeeId ? user.id : null,
        })
        .where(eq(orgUnits.id, id));
      await this.audit.record(tx, {
        actor: webUserActor(user),
        action: 'org_unit.master.set',
        objectType: 'org_unit',
        objectId: id,
        before: { employeeId: unit.masterEmployeeId },
        after: { employeeId },
      });
      return { employeeId };
    });
  }
}
