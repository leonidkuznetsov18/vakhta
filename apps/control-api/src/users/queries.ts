import { sql, type Transaction } from '@vakhta/db';
import { WEB_ROLES } from '@vakhta/domain';
import {
  TENANT_USERS_PAGE_SIZE,
  TenantUserCounts,
  TenantUserGroup,
  TenantUserKind,
  TenantUserView,
  type TenantUsersQuery,
} from '@vakhta/contracts';
import { z } from 'zod';

const EmployeeStatus = { ACTIVE: 'ACTIVE' } as const;
const Provider = { CREDENTIAL: 'credential' } as const;

// EXISTS keeps multiple credentials and scoped role grants from multiplying seats.
const members = sql`WITH members AS (
  SELECT e.id, ${TenantUserKind.WORKER}::text AS kind, e.full_name AS name, e.email,
    NULL::text AS image, e.avatar_media_id AS "avatarId", e.personnel_number AS "personnelNumber",
    ARRAY[]::text[] AS roles
  FROM employees e WHERE e.status = ${EmployeeStatus.ACTIVE}
  UNION ALL
  SELECT u.id, ${TenantUserKind.PANEL}::text, u.name, u.email, u.image, NULL::uuid, NULL::text,
    ARRAY(SELECT DISTINCT r.role::text FROM web_user_roles r WHERE r.user_id = u.id ORDER BY r.role::text)
  FROM auth_user u
  WHERE EXISTS (SELECT 1 FROM web_user_roles r WHERE r.user_id = u.id)
    AND EXISTS (SELECT 1 FROM auth_account a WHERE a.user_id = u.id
      AND (a.provider_id <> ${Provider.CREDENTIAL} OR a.password IS NOT NULL))
)`;
const CountsRow = z.object({
  total: z.number(),
  workers: z.number(),
  panel: z.number(),
  roles: z.record(z.string(), z.number()),
});
export async function readCounts(tx: Transaction): Promise<TenantUserCounts> {
  const rows = await tx.execute(sql`${members}
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE kind = ${TenantUserKind.WORKER})::int AS workers,
      count(*) FILTER (WHERE kind = ${TenantUserKind.PANEL})::int AS panel,
      COALESCE((SELECT jsonb_object_agg(role, count) FROM (
        SELECT role, count(*)::int AS count FROM members, unnest(roles) AS role GROUP BY role
      ) grouped), '{}'::jsonb) AS roles FROM members`);
  const row = CountsRow.parse(rows[0]);
  return TenantUserCounts.parse({
    ...row,
    roles: WEB_ROLES.map((role) => ({ role, count: row.roles[role] ?? 0 })),
    checkedAt: new Date().toISOString(),
  });
}

export async function readDirectory(tx: Transaction, query: TenantUsersQuery) {
  const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
  const role = roleFilter(query.role);
  const filter = sql`${role} AND (name ILIKE ${search} OR email ILIKE ${search} OR "personnelNumber" ILIKE ${search})`;
  const total = await tx.execute(
    sql`${members} SELECT count(*)::int AS total FROM members WHERE ${filter}`,
  );
  const items = await tx.execute(sql`${members} SELECT * FROM members WHERE ${filter}
    ORDER BY lower(name), kind, id LIMIT ${TENANT_USERS_PAGE_SIZE} OFFSET ${(query.page - 1) * TENANT_USERS_PAGE_SIZE}`);
  return {
    total: z.object({ total: z.number().int().nonnegative() }).parse(total[0]).total,
    items: z.array(TenantUserView).parse(items),
  };
}
function roleFilter(role: TenantUsersQuery['role']) {
  if (role === TenantUserGroup.ALL) return sql`true`;
  if (role === TenantUserGroup.WORKER) return sql`kind = ${TenantUserKind.WORKER}`;
  return sql`${role} = ANY(roles)`;
}
