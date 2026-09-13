import { format } from '@vakhta/i18n';
import { CalendarClockIcon, MonitorSmartphoneIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { AvatarStack, type StackedPerson } from '@/components/app/avatar-stack';
import { Section } from '@/components/app/page';
import type { SetupItem } from '../model/priority';
import { overviewText } from '../model/time';

export interface UnscheduledGroup {
  readonly orgUnitId: string | null;
  readonly orgUnitName: string | null;
  readonly people: readonly StackedPerson[];
}

/** "Setup and onboarding" (spec 004 FR-005): debt that does not stop the running shift. */
export function SetupSection({
  items,
  groups,
  noUnit,
  onOpen,
  onPlan,
}: {
  readonly items: readonly SetupItem[];
  readonly groups: readonly UnscheduledGroup[];
  readonly noUnit: string;
  readonly onOpen: (item: SetupItem) => void;
  readonly onPlan: (group: UnscheduledGroup) => void;
}) {
  const c = overviewText();
  if (items.length === 0 && groups.length === 0) return null;
  const icon: Record<SetupItem['key'], LucideIcon> = {
    unlinkedEmployees: UsersIcon,
    unpairedTerminals: MonitorSmartphoneIcon,
  };
  return (
    <Section title={c.setupTitle} hint={c.setupHint}>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {groups.map((group) => (
          <li key={group.orgUnitId ?? 'none'}>
            <Row
              icon={CalendarClockIcon}
              count={group.people.length}
              label={format(c.unscheduledUnit, { unit: group.orgUnitName ?? noUnit })}
              people={group.people}
              onClick={() => onPlan(group)}
            />
          </li>
        ))}
        {items.map((item) => (
          <li key={item.key}>
            <Row
              icon={icon[item.key]}
              count={item.count}
              label={c[item.key]}
              onClick={() => onOpen(item)}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Row({
  icon: Icon,
  count,
  label,
  people = [],
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly count: number;
  readonly label: string;
  readonly people?: readonly StackedPerson[];
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${count} ${label}`}
      className="flex h-full w-full min-w-0 flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-90"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-2xl leading-none font-semibold tabular-nums">{count}</span>
        </span>
        {people.length > 0 && <AvatarStack people={people} max={3} size={22} />}
      </span>
      <span className="text-sm leading-snug break-words text-muted-foreground">{label}</span>
    </button>
  );
}
