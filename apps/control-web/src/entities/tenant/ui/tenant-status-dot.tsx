import { TenantStatus } from '@vakhta/domain';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { t } from '@/shared/i18n';

const STATUS_COLOR: Record<TenantStatus, string> = {
  [TenantStatus.ACTIVE]: 'bg-emerald-500',
  [TenantStatus.SUSPENDED]: 'bg-red-500',
  [TenantStatus.PROVISIONING]: 'bg-yellow-500',
  [TenantStatus.DRAFT]: 'bg-yellow-500',
  [TenantStatus.ARCHIVED]: 'bg-red-500',
};

export function TenantStatusDot({ status }: { status: TenantStatus }) {
  const label = t().status[status];
  return (
    <InfoTooltip label={label} text={label}>
      <span aria-hidden="true" className={`size-2.5 rounded-full ${STATUS_COLOR[status]}`} />
    </InfoTooltip>
  );
}
