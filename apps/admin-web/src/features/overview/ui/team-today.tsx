import type { EmployeeView, OverviewSnapshot, ReplacementNeedView } from '@vakhta/contracts';
import { format, holidayLabel } from '@vakhta/i18n';
import {
  CakeIcon,
  CalendarXIcon,
  PartyPopperIcon,
  ThermometerIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { EmployeeProfileLink } from '@/entities/employee';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill, type Tone } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { currentLocale } from '@/i18n';
import { LoadingState } from '@/shared/ui/loading-state';
import type { TeamToday as Team } from '../model/team-today';
import { businessDateLabel, overviewText } from '../model/time';

const WELLBEING_TONE: Record<'GOOD' | 'SAME' | 'WORSE', Tone> = {
  GOOD: 'success',
  SAME: 'neutral',
  WORSE: 'danger',
};

function weekday(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(currentLocale(), {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/**
 * "People and schedule today" (Overview): who is on sick leave and how they feel, which shifts of
 * the coming week lost their person, and today's birthdays — three separate groups, each with its
 * count, so the section is scanned, not read.
 */
export function TeamToday({
  team,
  loading,
  failed,
  employees,
  snapshot,
  onOpenSchedule,
  onRetry,
}: {
  readonly team: Team | null;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly employees: readonly Pick<EmployeeView, 'id' | 'fullName' | 'avatarVersion'>[];
  readonly snapshot: OverviewSnapshot | undefined;
  readonly onOpenSchedule: () => void;
  readonly onRetry: () => void;
}) {
  const c = overviewText().today;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const person = (id: string) => {
    const e = byId.get(id);
    return (
      <EmployeeProfileLink
        id={id}
        name={e?.fullName ?? c.unknownPerson}
        avatarVersion={e?.avatarVersion}
      />
    );
  };
  const unitName = new Map((snapshot?.options.orgUnits ?? []).map((u) => [u.id, u.name]));
  const zoneName = new Map((snapshot?.zones ?? []).map((z) => [z.zoneId, z.zoneName]));
  const place = (r: ReplacementNeedView) =>
    [r.zoneId ? zoneName.get(r.zoneId) : null, unitName.get(r.orgUnitId)]
      .filter(Boolean)
      .join(' · ');
  const holiday = team?.holiday ? holidayLabel(team.holiday, currentLocale()) : null;

  return (
    <Section
      title={c.title}
      hint={c.hint}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {holiday && (
            <StatusPill tone="success">
              <PartyPopperIcon aria-hidden="true" className="size-3.5" />
              {format(c.holiday, { name: holiday })}
            </StatusPill>
          )}
          <Button type="button" size="sm" variant="outline" onClick={onOpenSchedule}>
            {c.openSchedule}
          </Button>
        </div>
      }
    >
      {!team && loading ? (
        <LoadingState className="py-4" />
      ) : !team && failed ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span>{c.failed}</span>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {overviewText().retry}
          </Button>
        </div>
      ) : team ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Group
            icon={ThermometerIcon}
            tone="danger"
            title={c.sick}
            hint={c.sickHint}
            count={team.sick.length}
            empty={c.sickNone}
          >
            {team.sick.map((row) => (
              <li key={row.employeeId} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
                {person(row.employeeId)}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-10 text-xs">
                  <Muted className="text-xs tabular-nums">
                    {format(c.until, { date: businessDateLabel(row.to) })} ·{' '}
                    {row.status === 'APPROVED' ? c.approved : c.pending}
                  </Muted>
                  {row.lastCheckin ? (
                    <span className="inline-flex items-center gap-1">
                      <StatusPill tone={WELLBEING_TONE[row.lastCheckin.answer]}>
                        {c.wellbeing[row.lastCheckin.answer]}
                      </StatusPill>
                      <Muted className="text-xs tabular-nums">
                        {format(c.answeredOn, {
                          date: businessDateLabel(row.lastCheckin.businessDate),
                        })}
                      </Muted>
                    </span>
                  ) : (
                    <StatusPill tone="warning">{c.noAnswer}</StatusPill>
                  )}
                </div>
              </li>
            ))}
          </Group>
          <Group
            icon={CalendarXIcon}
            tone="warning"
            title={`${c.replacements} · ${c.replacementsPeriod}`}
            hint={c.replacementsHint}
            count={team.replacementCount}
            empty={c.replacementsNone}
            footer={
              team.replacementCount > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={onOpenSchedule}>
                  {c.findReplacement}
                </Button>
              ) : null
            }
          >
            {team.replacements.map((day) => (
              <li key={day.date} className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-2 text-xs font-semibold text-muted-foreground uppercase">
                  <span className="tabular-nums">
                    {weekday(day.date)} {businessDateLabel(day.date)}
                  </span>
                  <span className="font-normal normal-case">
                    {format(c.shiftsCount, { count: day.shifts.length })}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {day.shifts.map((shift) => (
                    <li key={shift.assignmentId} className="flex flex-col gap-0.5">
                      <div className="flex min-w-0 items-center gap-1.5 text-sm">
                        <Muted className="shrink-0 text-xs">{c.instead}</Muted>
                        {person(shift.employeeId)}
                      </div>
                      {place(shift) && (
                        <Muted className="pl-[4.5rem] text-xs break-words">{place(shift)}</Muted>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </Group>
          <Group
            icon={CakeIcon}
            tone="accent"
            title={c.birthdays}
            hint={c.birthdaysHint}
            count={team.birthdays.length}
            empty={c.birthdaysNone}
          >
            {team.birthdays.map((id) => (
              <li key={id} className="py-1.5 first:pt-0 last:pb-0">
                {person(id)}
              </li>
            ))}
          </Group>
        </div>
      ) : null}
    </Section>
  );
}

const GROUP_TONE: Record<string, { icon: string; count: string }> = {
  danger: {
    icon: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    count: 'text-red-700 dark:text-red-300',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    count: 'text-amber-700 dark:text-amber-300',
  },
  accent: {
    icon: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    count: 'text-violet-700 dark:text-violet-300',
  },
};

function Group({
  icon: Icon,
  tone,
  title,
  hint,
  count,
  empty,
  footer,
  children,
}: {
  readonly icon: LucideIcon;
  readonly tone: 'danger' | 'warning' | 'accent';
  readonly title: string;
  readonly hint: string;
  readonly count: number;
  readonly empty: string;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}) {
  const colors = GROUP_TONE[tone]!;
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <header className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md',
            count > 0 ? colors.icon : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <h3 className="min-w-0 flex-1 text-sm font-semibold break-words">{title}</h3>
        <InfoTip text={hint} />
        <span
          className={cn(
            'text-2xl leading-none font-semibold tabular-nums',
            count > 0 ? colors.count : 'text-muted-foreground',
          )}
        >
          {count}
        </span>
      </header>
      {count === 0 ? (
        <Muted>{empty}</Muted>
      ) : (
        <ul className="flex max-h-72 flex-col divide-y overflow-y-auto pr-1">{children}</ul>
      )}
      {footer && <div className="mt-auto">{footer}</div>}
    </section>
  );
}
