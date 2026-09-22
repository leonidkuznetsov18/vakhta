import {
  TenantUserGroup,
  TenantUserKind,
  type TenantUserCounts,
  type TenantUserView,
} from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale, t } from '@/shared/i18n';
import { CONTROL_API_URL } from '@/shared/api';

export function roleOptions(counts: TenantUserCounts) {
  const m = t().users;
  const labels = messages(currentLocale()).roles;
  return [
    { value: TenantUserGroup.ALL, label: m.all, count: counts.total },
    { value: TenantUserGroup.WORKER, label: m.workers, count: counts.workers },
    ...counts.roles.map(({ role, count }) => ({ value: role, label: labels[role], count })),
  ];
}
export function userPresentation(user: TenantUserView, tenantId: string) {
  const m = t().users;
  const labels = messages(currentLocale()).roles;
  const image = user.avatarId
    ? `${CONTROL_API_URL}/control/tenant-users/${tenantId}/avatars/${user.id}?v=${user.avatarId}`
    : user.image;
  return {
    ...user,
    image,
    roleLabel:
      user.kind === TenantUserKind.WORKER
        ? m.workers
        : user.roles.map((role) => labels[role]).join(', '),
  };
}
export function checkedTime(value: string) {
  return new Date(value).toLocaleString(currentLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
