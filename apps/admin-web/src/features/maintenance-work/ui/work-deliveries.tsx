import type { ReactNode } from 'react';
import { CheckIcon, ClockIcon, MinusIcon, TriangleAlertIcon } from 'lucide-react';
import type { WorkDeliveryView, WorkDetail } from '@vakhta/contracts';
import { NoticeDelivery } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import { maintenanceMessages } from '@/entities/maintenance';
import { InfoTip } from '@/components/app/info-tip';
import { StatusPill, type PillTone } from '@/components/app/page';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/format';

const DELIVERY_VIEW: Readonly<
  Record<WorkDeliveryView['status'], { readonly tone: PillTone; readonly icon: ReactNode }>
> = {
  PENDING: { tone: 'neutral', icon: <ClockIcon /> },
  SENT: { tone: 'success', icon: <CheckIcon /> },
  FAILED: { tone: 'warning', icon: <TriangleAlertIcon /> },
  SKIPPED: { tone: 'neutral', icon: <MinusIcon /> },
};

/** Every notice about the work with its delivery; a failure is called out above the list (FR-043). */
export function WorkDeliveries({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  if (!work.deliveries.length) return null;
  const failed = work.deliveries.filter((item) => item.status === NoticeDelivery.FAILED).length;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1 font-medium">
        {t.deliveries}
        <InfoTip text={t.deliveriesHint} />
      </h3>
      {failed ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{format(t.deliveriesFailed, { count: failed })}</AlertTitle>
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-1 text-sm">
        {work.deliveries.map((item) => {
          const view = DELIVERY_VIEW[item.status];
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1"
            >
              <span className="min-w-0 break-words">
                {t.deliveryTemplate[item.template]}
                <span className="text-muted-foreground">
                  {' '}
                  · {item.recipient} · {formatDateTime(item.sentAt ?? item.createdAt)}
                </span>
              </span>
              <StatusPill tone={view.tone}>
                {view.icon}
                {t.deliveryStatus[item.status]}
              </StatusPill>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
