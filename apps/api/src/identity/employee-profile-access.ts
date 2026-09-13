import {
  and,
  desc,
  employeePositions,
  eq,
  gt,
  isNull,
  lte,
  or,
  orgUnits,
  type DbOrTx,
} from '@vakhta/db';
import { grantCovers, profileFieldAccess, type WebRole } from '@vakhta/domain';
import type { WebUser } from '../auth/web-auth.guard.js';
import { placeTarget } from '../common/access-scope.js';
import { DomainError } from '../common/domain-error.js';

export const PROFILE_READERS: readonly WebRole[] = [
  'ADMIN',
  'HR',
  'ACCOUNTANT',
  'PRODUCTION_HEAD',
  'PLANNER',
  'SHIFT_MASTER',
];
export const PROFILE_EDITORS: readonly WebRole[] = ['ADMIN', 'HR'];

export async function employeeProfileAccess(
  reader: DbOrTx,
  employeeId: string,
  user: WebUser,
  allowed: readonly WebRole[] = PROFILE_READERS,
  now = new Date(),
) {
  const [assignment] = await reader
    .select({
      siteId: orgUnits.siteId,
      orgUnitId: employeePositions.orgUnitId,
      teamId: employeePositions.teamId,
    })
    .from(employeePositions)
    .innerJoin(orgUnits, eq(orgUnits.id, employeePositions.orgUnitId))
    .where(
      and(
        eq(employeePositions.employeeId, employeeId),
        lte(employeePositions.validFrom, now),
        or(isNull(employeePositions.validTo), gt(employeePositions.validTo, now)),
      ),
    )
    .orderBy(desc(employeePositions.validFrom))
    .limit(1);
  const roles = user.grants
    .filter((grant) =>
      assignment ? grantCovers(grant, placeTarget(assignment)) : grant.scopeType === 'ENTERPRISE',
    )
    .map((grant) => grant.role);
  if (!roles.some((role) => allowed.includes(role)))
    throw new DomainError('OUT_OF_SCOPE', 403, 'The employee is outside your access scope');
  return profileFieldAccess(roles);
}
