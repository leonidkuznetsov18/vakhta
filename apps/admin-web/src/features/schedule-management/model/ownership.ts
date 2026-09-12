import type { RoleGrant } from '@vakhta/domain';

/** Access changes invalidate reads; persisted edits remain owned by the stable account. */
export function scheduleAccessKey(actorId: string | null, grants: readonly RoleGrant[]) {
  return JSON.stringify([
    actorId,
    grants.map(({ role, scopeType, scopeId }) => JSON.stringify([role, scopeType, scopeId])).sort(),
  ]);
}

export function scheduleDraftKey(
  actorId: string | null,
  siteId: string,
  orgUnitId: string,
  month: string,
  versionId: string,
) {
  return JSON.stringify(['schedule-draft:v1', actorId, siteId, orgUnitId, month, versionId]);
}

export const scheduleKeys = {
  all: (access: string) => ['schedules', access] as const,
  list: (access: string, input: unknown) => ['schedules', access, 'list', input] as const,
  detail: (access: string, id: string | null) => ['schedules', access, 'detail', id] as const,
  templates: (access: string, siteId: string) =>
    ['schedules', access, 'templates', siteId] as const,
  roster: (access: string) => ['employees', 'schedule-complete', access] as const,
  employee: (access: string, id: string) => ['employees', 'schedule-detail', access, id] as const,
};
