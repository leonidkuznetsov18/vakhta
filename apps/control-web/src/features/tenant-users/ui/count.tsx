import { Link } from '@tanstack/react-router';
import { TenantUserAvailability, type TenantUserCountResult } from '@vakhta/contracts';
import { t } from '@/shared/i18n';

export function TenantUserCount({
  result,
  tenantId,
  loading,
}: {
  result: TenantUserCountResult | undefined;
  tenantId: string;
  loading: boolean;
}) {
  const m = t().users;
  if (!result && loading) return <span aria-hidden="true">—</span>;
  if (result?.status !== TenantUserAvailability.READY)
    return (
      <span className="text-xs text-muted-foreground">
        {result?.status === TenantUserAvailability.NOT_READY ? m.notReady : m.unavailable}
      </span>
    );
  return (
    <Link
      className="control-link font-semibold tabular-nums"
      to="/tenants/$id"
      params={{ id: tenantId }}
      search={{ tab: 'users' }}
      aria-label={`${m.title}: ${result.counts.total}`}
    >
      {result.counts.total}
    </Link>
  );
}
