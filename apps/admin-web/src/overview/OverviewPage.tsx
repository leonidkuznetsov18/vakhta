import { useMemo } from 'react';
import type { ActiveShiftView, MeView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import {
  AlertTriangleIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  InboxIcon,
  MonitorSmartphoneIcon,
  UsersIcon,
  ActivityIcon,
  CalendarClockIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import { EmptyState, Muted, Section, type Tone } from '@/components/app/page';
import { AvatarStack } from '@/components/app/avatar-stack';
import { HowItWorks } from '@/components/app/how-it-works';
import { formatTime } from '@/lib/format';
import { writeSchedulePreset } from '../schedule/preset.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { writeRoute } from '@/lib/route';
import { useNavigation, type SectionKey } from '../navigation.tsx';
import { useAttention, type Attention } from './attention.ts';
import { cn } from 'cn';

const all = messages(currentLocale());
const o = all.admin.overview;

/** Filters of the destination page live in `vakhta.ui.*`; the page reads them when it mounts. */
function presetStorage(values: Record<string, string>): void {
  try {
    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(`vakhta.ui.${key}`, JSON.stringify(value));
    }
  } catch {
    // Storage unavailable: the section still opens, without the filter.
  }
}

interface Tile {
  readonly key: keyof Omit<Attention, 'refreshedAt' | 'unscheduledPeople' | 'people'>;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly section: SectionKey;
  /** Presets the destination (tab, filters) before the jump, so the list shows exactly the counted rows. */
  readonly prepare?: () => void;
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
    prepare: () => {
      presetStorage({ 'employees.status': 'ACTIVE', 'employees.telegram': 'NOT_LINKED' });
      writeRoute('administration', 'employees');
    },
  },
  {
    key: 'unpairedTerminals',
    label: o.unpairedTerminals,
    icon: MonitorSmartphoneIcon,
    section: 'administration',
    tone: 'warning',
    prepare: () => writeRoute('administration', 'terminals'),
  },
  {
    key: 'unscheduled',
    label: o.unscheduledShifts,
    icon: CalendarClockIcon,
    section: 'schedule',
    tone: 'warning',
  },
  {
    key: 'closedNoChecklist',
    label: o.closedNoChecklist,
    icon: AlertTriangleIcon,
    section: 'operations',
    tone: 'danger',
    prepare: () => {
      try {
        localStorage.setItem('vakhta.ui.operations.includeClosed', 'true');
      } catch {
        // storage unavailable
      }
    },
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

/**
 * An active tile is marked by its own colour and a lift, not by a black number: the palette is
 * red for what is wrong, amber for what wants attention, emerald for what is well.
 */
const TONE_RING: Record<Tone, string> = {
  neutral: '',
  info: 'border-border shadow-sm',
  success:
    'border-emerald-300 shadow-sm shadow-emerald-100 dark:border-emerald-800 dark:shadow-none',
  warning: 'border-amber-300 shadow-sm shadow-amber-100 dark:border-amber-800 dark:shadow-none',
  danger: 'border-red-300 shadow-sm shadow-red-100 dark:border-red-800 dark:shadow-none',
};
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-foreground',
  info: 'text-foreground',
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

  /** The people on an unscheduled shift, gathered by the unit whose schedule would hold them. */
  const unscheduledByUnit = useMemo(() => {
    const groups = new Map<
      string,
      { orgUnitId: string | null; orgUnitName: string | null; people: ActiveShiftView[] }
    >();
    for (const person of data.unscheduledPeople) {
      const key = person.orgUnitId ?? '';
      const group = groups.get(key) ?? {
        orgUnitId: person.orgUnitId,
        orgUnitName: person.orgUnitName,
        people: [],
      };
      group.people.push(person);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) =>
      (a.orgUnitName ?? '').localeCompare(b.orgUnitName ?? ''),
    );
  }, [data.unscheduledPeople]);

  /** Hands the unit and the people to the schedule page, which opens that month with them in it. */
  function planFor(group: (typeof unscheduledByUnit)[number]): void {
    if (!group.orgUnitId) return;
    writeSchedulePreset({
      orgUnitId: group.orgUnitId,
      employeeIds: group.people.map((p) => p.employeeId),
    });
    go('schedule');
  }

  function open(t: Tile): void {
    t.prepare?.();
    go(t.section);
  }

  const tile = (t: Tile) => {
    const value = data[t.key] ?? 0;
    const active = t.tone !== 'neutral' && value > 0;
    return (
      <Card
        key={t.key}
        role="button"
        tabIndex={0}
        onClick={() => open(t)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open(t);
          }
        }}
        className={cn(
          'cursor-pointer gap-2 py-4 transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50',
          active && TONE_RING[t.tone],
        )}
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
          {/* Who is behind the number, without opening the section: the faces answer "who" and
              pointing at them answers "which of them". The stack stops the click so reading the
              names does not navigate away from them. */}
          <div
            className="flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <AvatarStack people={data.people[t.key] ?? []} max={4} size={26} />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="overview" />
      <Feedback error={error ? describeError(error) : null} />
      {unscheduledByUnit.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-900">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <CalendarClockIcon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-amber-600"
              />
              <p className="text-sm">{format(o.unscheduledBanner, { n: data.unscheduled ?? 0 })}</p>
            </div>
            {/* Named, and grouped by unit: a schedule is written for one unit at a time, so each
                group carries the button that opens that unit's month with these people already in
                it. Without the names the tile only said how many, which nobody can act on. */}
            <ul className="flex flex-col gap-2">
              {unscheduledByUnit.map((group) => (
                <li
                  key={group.orgUnitId ?? 'none'}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2"
                >
                  <AvatarStack
                    people={group.people.map((p) => ({
                      id: p.id,
                      name: p.fullName,
                      seed: p.id,
                      note: p.personnelNumber,
                    }))}
                    max={4}
                  />
                  <span className="font-medium">{group.orgUnitName ?? o.noUnit}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {group.people.map((p) => p.fullName).join(', ')}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={group.orgUnitId === null}
                    onClick={() => planFor(group)}
                  >
                    {o.unscheduledPlan}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
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
