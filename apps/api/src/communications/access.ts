import { eq, webUserRoles, type DbOrTx } from '@vakhta/db';
import { accessScope, type WebRole } from '@vakhta/domain';
export const COMMUNICATION_ROLES = [
  'ADMIN',
  'HR',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
] as const satisfies readonly WebRole[];
export async function communicationScope(db: DbOrTx, userId: string) {
  const grants = await db.select().from(webUserRoles).where(eq(webUserRoles.userId, userId));
  return accessScope(grants, COMMUNICATION_ROLES);
}
