import { Button } from '@/components/ui/button';
import { QueryFeedback } from '@/components/app/query-feedback';
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
import { Card, CardContent } from '@/components/ui/card';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import { EmptyState, Muted, Section, type Tone } from '@/components/app/page';
import { AvatarStack, type StackedPerson } from '@/components/app/avatar-stack';
import { HowItWorks } from '@/components/app/how-it-works';
import { formatTime } from '@/lib/format';
import { writeSchedulePreset } from '../schedule/preset.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { writeRoute } from '@/lib/route';
import { setUiState } from '@/lib/ui-store';
import { useNavigation, type SectionKey } from '../navigation.tsx';
import { useAttention, type Attention } from './attention.ts';
import { cn } from 'cn';

const all = messages(currentLocale());
const o = all.admin.overview;

/**
 * The live-shift screen stands on a day and on a scope, so a tile that counts rows there hands over
 * both. Without the day the screen opens on today and the row the number stood for — a shift closed
 * last night, a night shift started yesterday — is not in the list at all.
 */
function opsFilters(data: Attention, key: keyof Attention, scope: 'OPEN' | 'ALL'): void {
  const day = data.firstDate[key];
  setUiState({ 'operations.scope': scope, ...(day ? { 'operations.day': day } : {}) });
}

interface Tile {
  readonly key: keyof Omit<
    Attention,
    'refreshedAt' | 'unscheduledPeople' | 'people' | 'firstId' | 'firstDate'
  >;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly section: SectionKey;
  /** Presets the destination (tab, filters) before the jump, so the list shows exactly the counted rows. */
  readonly prepare?: (data: Attention) => void;
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
      setUiState({ 'employees.status': 'ACTIVE', 'employees.telegram': 'NOT_LINKED' });
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
    prepare: (data) => opsFilters(data, 'closedNoChecklist', 'ALL'),
  },
  {
    key: 'inDowntime',
    label: o.inDowntime,
    icon: ActivityIcon,
    section: 'operations',
    tone: 'warning',
    prepare: (data) => opsFilters(data, 'inDowntime', 'OPEN'),
  },
  {
    key: 'onShift',
    label: o.onShift,
    icon: ActivityIcon,
    section: 'operations',
    tone: 'neutral',
    prepare: (data) => opsFilters(data, 'onShift', 'OPEN'),
  },
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

/**
 * One card of the overview: a number, what it counts, and the faces behind it. The whole card is
 * the control — clicking it opens what the number stands for, so there is no separate button.
 */
function TileCard({
  icon: Icon,
  value,
  label,
  tone,
  active,
  people,
  onOpen,
}: {
  readonly icon: LucideIcon;
  readonly value: number;
  readonly label: string;
  readonly tone: Tone;
  readonly active: boolean;
  readonly people: readonly StackedPerson[];
  readonly onOpen: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'cursor-pointer gap-2 py-4 transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50',
        active && TONE_RING[tone],
      )}
    >
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className={cn('text-2xl font-semibold tabular-nums', active && TONE_TEXT[tone])}>
              {value}
            </div>
            <div className="truncate text-sm text-muted-foreground">{label}</div>
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
          <AvatarStack people={people} max={4} size={26} />
        </div>
      </CardContent>
    </Card>
  );
}

/** "Overview": the queues waiting on the signed-in role, one tile each, with a shortcut. */
export function OverviewPage({ me }: { readonly me: MeView }) {
  const { data, error, queryState, incomplete, refresh } = useAttention(me);
  const { go } = useNavigation();
  const loading = data.refreshedAt === null;

  /** The people on an unscheduled shift, gathered by the unit whose schedule would hold them. */
  const unscheduledByUnit = groupByUnit(data.unscheduledPeople);

  // One card per unit stands in for the plain "unscheduled" tile: the tile only said how many, the
  // cards say who and in which unit, and each one opens that unit's month with those people in it.
  const grouped = unscheduledByUnit.length > 0;
  const visible = TILES.filter(
    (t) => data[t.key] !== null && !(grouped && t.key === 'unscheduled'),
  );
  const attention = visible.filter((t) => t.tone !== 'neutral' && (data[t.key] ?? 0) > 0);
  const quiet = visible.filter((t) => !attention.includes(t));

  /** Hands the unit, the month and the people to the schedule page, which opens a version with
      them already in it — the master should not have to memorise three surnames on the way. */
  function planFor(group: (typeof unscheduledByUnit)[number]): void {
    const first = group.people[0];
    if (first) {
      writeSchedulePreset({
        orgUnitId: group.orgUnitId,
        month: first.businessDate.slice(0, 7),
        people: group.people.map((p) => ({ id: p.employeeId, name: p.fullName })),
      });
    }
    go('schedule');
  }

  function open(t: Tile): void {
    t.prepare?.(data);
    // Open the row the number stood for, not just the list it lives in: the destination reads the
    // id from the address, so writing it before the jump lands the reader on the thing itself.
    // Sections whose sub-path names a tab (administration) keep whatever `prepare` put there.
    const id = data.firstId[t.key];
    if (id && t.section !== 'administration') writeRoute(t.section, id);
    go(t.section);
  }

  const tile = (t: Tile) => (
    <TileCard
      key={t.key}
      icon={t.icon}
      value={data[t.key] ?? 0}
      label={t.label}
      tone={t.tone}
      active={t.tone !== 'neutral' && (data[t.key] ?? 0) > 0}
      people={data.people[t.key] ?? []}
      onOpen={() => open(t)}
    />
  );

  const unscheduledTile = (group: (typeof unscheduledByUnit)[number]) => (
    <TileCard
      key={group.orgUnitId ?? 'none'}
      icon={CalendarClockIcon}
      value={group.people.length}
      label={format(o.unscheduledUnit, { unit: group.orgUnitName ?? o.noUnit })}
      tone="warning"
      active
      people={group.people.map((p) => ({
        id: p.id,
        name: p.fullName,
        seed: p.id,
        note: p.personnelNumber,
      }))}
      onOpen={() => planFor(group)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="overview" />
      <QueryFeedback query={queryState} />
      {incomplete && (
        <div className="space-y-2">
          <Feedback error={messages(currentLocale()).ui.common.partialLoadError} />
          <Button
            type="button"
            variant="outline"
            disabled={queryState.isFetching}
            onClick={() => void refresh()}
          >
            {messages(currentLocale()).ui.common.retry}
          </Button>
        </div>
      )}
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
        {loading ? null : attention.length === 0 && !grouped ? (
          <EmptyState text={o.allClear} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {unscheduledByUnit.map(unscheduledTile)}
            {attention.map(tile)}
          </div>
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

function groupByUnit(people: readonly ActiveShiftView[]) {
  const groups = new Map<
    string,
    { orgUnitId: string | null; orgUnitName: string | null; people: ActiveShiftView[] }
  >();
  for (const person of people) {
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
}
