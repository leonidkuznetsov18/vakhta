import type { MeView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import {
  AlertTriangleIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  InboxIcon,
  MonitorSmartphoneIcon,
  UsersIcon,
  ActivityIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import { EmptyState, Muted, Section, type Tone } from '@/components/app/page';
import { formatTime } from '@/lib/format';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { useNavigation, type SectionKey } from '../navigation.tsx';
import { useAttention, type Attention } from './attention.ts';
import { cn } from 'cn';

const all = messages(currentLocale());
const o = all.admin.overview;

interface Tile {
  readonly key: keyof Omit<Attention, 'refreshedAt'>;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly section: SectionKey;
  /** Tone when the count is above zero; neutral tiles are informational. */
  readonly tone: Tone;
}

const TILES: readonly Tile[] = [
  {
    key: 'slaBreached',
    label: o.slaBreached,
    icon: AlertTriangleIcon,
    section: 'incidents',
    tone: 'danger',
  },
  {
    key: 'openIncidents',
    label: o.openIncidents,
    icon: AlertTriangleIcon,
    section: 'incidents',
    tone: 'warning',
  },
  {
    key: 'disputes',
    label: o.disputes,
    icon: ClipboardCheckIcon,
    section: 'handover',
    tone: 'warning',
  },
  {
    key: 'overdueAcceptances',
    label: o.overdueAcceptances,
    icon: ClipboardCheckIcon,
    section: 'handover',
    tone: 'danger',
  },
  {
    key: 'overdueRequests',
    label: o.overdueRequests,
    icon: InboxIcon,
    section: 'requests',
    tone: 'danger',
  },
  {
    key: 'requestsForMe',
    label: o.requestsForMe,
    icon: InboxIcon,
    section: 'requests',
    tone: 'info',
  },
  {
    key: 'overtimePending',
    label: o.overtimePending,
    icon: CoinsIcon,
    section: 'requests',
    tone: 'info',
  },
  {
    key: 'unlinkedEmployees',
    label: o.unlinkedEmployees,
    icon: UsersIcon,
    section: 'administration',
    tone: 'warning',
  },
  {
    key: 'unpairedTerminals',
    label: o.unpairedTerminals,
    icon: MonitorSmartphoneIcon,
    section: 'administration',
    tone: 'warning',
  },
  {
    key: 'inDowntime',
    label: o.inDowntime,
    icon: ActivityIcon,
    section: 'operations',
    tone: 'warning',
  },
  { key: 'onShift', label: o.onShift, icon: ActivityIcon, section: 'operations', tone: 'neutral' },
];

const TONE_RING: Record<Tone, string> = {
  neutral: '',
  info: 'border-blue-200 dark:border-blue-900',
  success: 'border-emerald-200 dark:border-emerald-900',
  warning: 'border-amber-300 dark:border-amber-900',
  danger: 'border-red-300 dark:border-red-900',
};
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-foreground',
  info: 'text-blue-700 dark:text-blue-300',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
};

/** "Overview": the queues waiting on the signed-in role, one tile each, with a shortcut. */
export function OverviewPage({ me }: { readonly me: MeView }) {
  const { data, error } = useAttention(me);
  const { go } = useNavigation();
  const visible = TILES.filter((t) => data[t.key] !== null);
  const loading = data.refreshedAt === null;
  const attention = visible.filter((t) => t.tone !== 'neutral' && (data[t.key] ?? 0) > 0);
  const quiet = visible.filter((t) => !attention.includes(t));

  const tile = (t: Tile) => {
    const value = data[t.key] ?? 0;
    const active = t.tone !== 'neutral' && value > 0;
    return (
      <Card
        key={t.key}
        className={cn('gap-2 py-4 transition-shadow hover:shadow-md', active && TONE_RING[t.tone])}
      >
        <CardContent className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <t.icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div
                className={cn('text-2xl font-semibold tabular-nums', active && TONE_TEXT[t.tone])}
              >
                {value}
              </div>
              <div className="truncate text-sm text-muted-foreground">{t.label}</div>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => go(t.section)}>
            {o.open}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Feedback error={error ? describeError(error) : null} />
      <Section
        title={o.title}
        hint={all.ui.hints.overview}
        actions={
          data.refreshedAt ? (
            <Muted>
              {format(o.refreshedAt, { time: formatTime(data.refreshedAt.toISOString()) })}
            </Muted>
          ) : null
        }
      >
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : attention.length === 0 ? (
          <EmptyState text={o.allClear} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{attention.map(tile)}</div>
        )}
      </Section>
      {!loading && quiet.length > 0 && (
        <Section title={all.admin.sections.operations}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{quiet.map(tile)}</div>
        </Section>
      )}
      <Muted className="flex items-center gap-1">
        {all.ui.hints.overview}
        <InfoTip text={all.ui.hints.overview} />
      </Muted>
    </div>
  );
}
