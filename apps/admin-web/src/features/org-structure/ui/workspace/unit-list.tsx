import type { ReactNode } from 'react';
import { Building2Icon, ChevronRightIcon, TriangleAlertIcon, UserRoundXIcon } from 'lucide-react';
import { cn } from 'cn';
import { Muted, StatusPill } from '@/components/app/page';
import { MasterState, UNASSIGNED_KEY, type WorkspaceUnit } from '../../model/workspace';
import { fill, text } from './text';

const ROW_CLASS =
  'group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring';
const ACTIVE_CLASS = 'bg-muted font-medium ring-1 ring-inset ring-border';

function UnassignedRow({
  count,
  active,
  onSelect,
}: {
  readonly count: number;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        className={cn(ROW_CLASS, active && ACTIVE_CLASS)}
        onClick={onSelect}
      >
        <UserRoundXIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{text.list.unassigned}</span>
        {count > 0 ? (
          <StatusPill tone="warning" className="tabular-nums">
            {count}
          </StatusPill>
        ) : (
          <Muted className="text-xs tabular-nums">0</Muted>
        )}
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

function masterLine(row: WorkspaceUnit) {
  const master = row.master;
  if (master.state === MasterState.MISSING) return text.attention.NO_MASTER;
  if (master.state === MasterState.INACTIVE) {
    return `${master.name} · ${text.attention.inactiveShort}`;
  }
  return master.name;
}

/** Orange only where the master line itself is the problem; a master elsewhere keeps the icon. */
function masterLineIsWarning(row: WorkspaceUnit) {
  return row.master.state === MasterState.MISSING || row.master.state === MasterState.INACTIVE;
}

function UnitRow({
  row,
  active,
  onSelect,
}: {
  readonly row: WorkspaceUnit;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const needsAttention = row.attention.length > 0;
  const missingMaster = masterLineIsWarning(row);
  return (
    <li>
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        aria-label={`${row.unit.name}, ${fill(text.list.people, { n: row.headcount })}, ${masterLine(row)}`}
        className={cn(ROW_CLASS, active && ACTIVE_CLASS)}
        style={{ paddingLeft: `${8 + row.depth * 16}px` }}
        onClick={onSelect}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">{row.unit.name}</span>
            {needsAttention && (
              <TriangleAlertIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-orange-600 dark:text-orange-400"
              />
            )}
          </span>
          <span
            className={cn(
              'truncate text-xs',
              missingMaster ? 'text-orange-700 dark:text-orange-300' : 'text-muted-foreground',
            )}
          >
            {masterLine(row)}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fill(text.list.people, { n: row.headcount })}
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/**
 * The left pane: the pinned "no unit" row, then every unit under its site with headcount and
 * master. Selection is a key, so the same list drives the desktop split and the mobile drill-down.
 */
export function UnitList({
  units,
  unassignedCount,
  selectedKey,
  onSelect,
  emptyText,
  groupBySite,
}: {
  readonly units: readonly WorkspaceUnit[];
  readonly unassignedCount: number;
  readonly selectedKey: string | null;
  readonly onSelect: (key: string) => void;
  readonly emptyText: string;
  /** Site headings only earn their space when there is more than one site. */
  readonly groupBySite: boolean;
}) {
  let lastSite: string | null = null;
  const items: ReactNode[] = [];
  for (const row of units) {
    if (groupBySite && row.siteName !== lastSite) {
      lastSite = row.siteName;
      items.push(
        <li
          key={`site:${row.siteName}`}
          className="mt-2 flex items-center gap-1.5 px-2 pb-1 text-xs font-medium text-muted-foreground first:mt-0"
        >
          <Building2Icon aria-hidden="true" className="size-3.5" />
          {row.siteName}
        </li>,
      );
    }
    items.push(
      <UnitRow
        key={row.unit.id}
        row={row}
        active={selectedKey === row.unit.id}
        onSelect={() => onSelect(row.unit.id)}
      />,
    );
  }
  return (
    <nav aria-label={text.list.heading} className="flex min-w-0 flex-col">
      <ul className="flex flex-col gap-0.5">
        <UnassignedRow
          count={unassignedCount}
          active={selectedKey === UNASSIGNED_KEY}
          onSelect={() => onSelect(UNASSIGNED_KEY)}
        />
        <li aria-hidden="true" className="my-1 border-t border-border" />
        {items}
        {units.length === 0 && emptyText && (
          <li className="px-2 py-3">
            <Muted>{emptyText}</Muted>
          </li>
        )}
      </ul>
    </nav>
  );
}
