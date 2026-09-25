import { format } from '@vakhta/i18n';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  InfoIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { AvatarStack } from '@/components/app/avatar-stack';
import { Muted, Section } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { formatNearDate } from '@/entities/maintenance';
import { formatDuration, formatTime } from '@/lib/format';
import { LoadingState } from '@/shared/ui/loading-state';
import {
  type ActionQueue as Queue,
  type QueueItem,
  type QueueKey,
  type Tier,
} from '../model/priority';
import { formatAge, listLabel, minutesBetween, overviewText } from '../model/time';

const TIER_ICON: Record<Tier, LucideIcon> = {
  critical: OctagonAlertIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
};
const ROW_TONE: Record<Tier, string> = {
  critical:
    'border-red-300 bg-red-50/60 hover:bg-red-50 dark:border-red-900 dark:bg-red-950/40 dark:hover:bg-red-950/60',
  warning:
    'border-amber-300 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 dark:hover:bg-amber-950/50',
  info: 'border-border hover:bg-muted/60',
};
const COUNT_TONE: Record<Tier, string> = {
  critical: 'text-red-700 dark:text-red-300',
  warning: 'text-amber-700 dark:text-amber-300',
  info: 'text-foreground',
};

/** Values some card labels carry: the downtime escalation time and the maintenance horizon. */
export interface QueueLabelValues {
  readonly escalationMinutes: number;
  readonly horizonDays: number;
}

export function queueLabel(key: QueueKey, values: QueueLabelValues): string {
  const items = overviewText().items;
  if (key === 'longDowntime')
    return format(items.longDowntime, { duration: formatDuration(values.escalationMinutes) });
  if (key === 'maintenanceUpcoming')
    return format(items.maintenanceUpcoming, { days: values.horizonDays });
  return items[key];
}

/**
 * "Needs action now" (spec 004 US3): one list, tier first, then deadline, then age. A row is the
 * control; its tier is spelled out with an icon, never shown by colour alone.
 */
export function ActionQueue({
  queue,
  loading,
  labelValues,
  now,
  onOpen,
  onRetry,
}: {
  readonly queue: Queue;
  readonly loading: boolean;
  readonly labelValues: QueueLabelValues;
  readonly now: Date;
  readonly onOpen: (item: QueueItem) => void;
  readonly onRetry: () => void;
}) {
  const c = overviewText();
  const label = (key: QueueKey) => queueLabel(key, labelValues);
  return (
    <Section title={c.queueTitle} hint={c.queueHint}>
      {loading && queue.items.length === 0 ? (
        <LoadingState className="py-6" />
      ) : (
        <div className="flex flex-col gap-3">
          {queue.items.length > 0 && (
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {queue.items.map((item) => {
                const Icon = TIER_ICON[item.tier];
                return (
                  <li key={item.key} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      aria-label={`${item.count} ${label(item.key)}`}
                      className={cn(
                        'flex h-full w-full min-w-0 flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-90',
                        ROW_TONE[item.tier],
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            'text-3xl leading-none font-semibold tabular-nums',
                            COUNT_TONE[item.tier],
                          )}
                        >
                          {item.count}
                        </span>
                        <span role="presentation" onClick={(e) => e.stopPropagation()}>
                          <AvatarStack people={item.people} max={3} size={22} />
                        </span>
                      </span>
                      <span className="text-sm leading-snug font-medium break-words">
                        {label(item.key)}
                      </span>
                      <RowMeta item={item} now={now} />
                      <span
                        className={cn(
                          'mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium',
                          COUNT_TONE[item.tier],
                        )}
                      >
                        <Icon aria-hidden="true" className="size-3.5" />
                        {c.tiers[item.tier]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <QueueSummary queue={queue} label={label} onRetry={onRetry} loading={loading} />
        </div>
      )}
    </Section>
  );
}

function RowMeta({ item, now }: { readonly item: QueueItem; readonly now: Date }) {
  const parts = [deadlineLine(item, now), ageLine(item, now)].filter(
    (part): part is string => part !== null,
  );
  if (parts.length === 0) return null;
  return (
    <span className="text-sm break-words text-muted-foreground tabular-nums">
      {parts.join(' · ')}
    </span>
  );
}

function deadlineLine(item: QueueItem, now: Date): string | null {
  if (!item.deadlineAt) return null;
  const c = overviewText();
  const diff = new Date(item.deadlineAt).getTime() - now.getTime();
  return diff < 0
    ? format(c.overdueBy, { duration: formatAge(Math.floor(-diff / 60_000)) })
    : format(c.dueIn, { duration: formatAge(Math.floor(diff / 60_000)) });
}

/** The age line by its kind: a business date, a planned time, or an instant ago. */
function ageLine(item: QueueItem, now: Date): string | null {
  const c = overviewText();
  if (item.ageKind === 'overdueSince' || item.ageKind === 'nearestOn') {
    const template = item.ageKind === 'overdueSince' ? c.overdueSince : c.nearestOn;
    return item.dayOn ? format(template, { date: formatNearDate(item.dayOn) }) : null;
  }
  if (item.ageKind === 'plannedFrom')
    return item.oldestAt ? format(c.plannedFrom, { time: formatTime(item.oldestAt) }) : null;
  if (!item.oldestAt) return item.ageKind === 'lastSeen' ? c.neverSeen : null;
  const duration = formatAge(minutesBetween(item.oldestAt, now));
  return format(item.ageKind === 'lastSeen' ? c.lastSeen : c.oldest, { duration });
}

/** What was checked and found clear, and what could not be checked: never a silent all-clear. */
function QueueSummary({
  queue,
  label,
  onRetry,
  loading,
}: {
  readonly queue: Queue;
  readonly label: (key: QueueKey) => string;
  readonly onRetry: () => void;
  readonly loading: boolean;
}) {
  const c = overviewText();
  const allClear = queue.items.length === 0 && queue.unknown.length === 0 && !loading;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {allClear && (
        <p className="inline-flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2Icon aria-hidden="true" className="size-4" />
          {c.allClear}
        </p>
      )}
      {queue.checked.length > 0 && (
        <Muted className="inline-flex items-start gap-2">
          <CheckCircle2Icon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-emerald-600"
          />
          <span className="break-words">
            {format(c.checked, { list: listLabel(queue.checked.map(label)) })}
          </span>
        </Muted>
      )}
      {queue.unknown.length > 0 && !loading && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-amber-800 dark:text-amber-200"
        >
          <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">
            {format(c.unknown, { list: listLabel(queue.unknown.map(label)) })}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {c.retry}
          </Button>
        </div>
      )}
    </div>
  );
}
