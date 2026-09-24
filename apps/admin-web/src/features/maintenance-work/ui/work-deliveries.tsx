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

/** The delivery status as a pill: icon and word, so colour is not the only signal. */
export function DeliveryStatusPill({ status }: { readonly status: WorkDeliveryView['status'] }) {
  const t = maintenanceMessages().workCard;
  const view = DELIVERY_VIEW[status];
  return (
    <StatusPill tone={view.tone}>
      {view.icon}
      {t.deliveryStatus[status]}
    </StatusPill>
  );
}

/** A notice that did not reach its person is called out, not left inside a list (FR-043). */
export function DeliveryFailures({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  const failed = work.deliveries.filter((item) => item.status === NoticeDelivery.FAILED).length;
  if (!failed) return null;
  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>{format(t.deliveriesFailed, { count: failed })}</AlertTitle>
    </Alert>
  );
}

/** Every notice about the planned work with its delivery (FR-043). */
export function WorkDeliveries({ work }: { readonly work: WorkDetail }) {
  const t = maintenanceMessages().workCard;
  if (!work.deliveries.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1 font-medium">
        {t.deliveries}
        <InfoTip text={t.deliveriesHint} />
      </h3>
      <DeliveryFailures work={work} />
      <ul className="flex flex-col gap-1 text-sm">
        {work.deliveries.map((item) => (
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
            <DeliveryStatusPill status={item.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
