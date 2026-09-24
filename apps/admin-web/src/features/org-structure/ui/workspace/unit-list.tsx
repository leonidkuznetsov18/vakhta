import type { ReactNode } from 'react';
import {
  Building2Icon,
  ChevronRightIcon,
  CogIcon,
  FactoryIcon,
  FolderIcon,
  TriangleAlertIcon,
  UserRoundXIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Muted, StatusPill } from '@/components/app/page';
import { OrgUnitKind, ResponsibleSlot } from '../../model/org-node';
import { MasterState, UNASSIGNED_KEY, type WorkspaceUnit } from '../../model/workspace';
import { fill, text } from './text';

const ROW_CLASS =
  'group flex w-full min-w-0 items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring';
const ACTIVE_CLASS = 'bg-muted font-medium ring-1 ring-inset ring-border';
const TOGGLE_CLASS =
  'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring';

const KIND_ICON = {
  [OrgUnitKind.DIVISION]: FolderIcon,
  [OrgUnitKind.SHOP]: FactoryIcon,
  [OrgUnitKind.SECTION]: CogIcon,
} as const;

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
        className={cn(ROW_CLASS, 'pl-2', active && ACTIVE_CLASS)}
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
      </button>
    </li>
  );
}

/** The second line of a node row: its head, or the reason the head line is a problem. */
function headLine(row: WorkspaceUnit): { readonly label: string; readonly warning: boolean } {
  const head = row.responsibles.find((item) => item.slot === ResponsibleSlot.HEAD)?.info;
  if (!head || head.state === MasterState.MISSING) {
    return { label: text.attention.NO_HEAD, warning: true };
  }
  if (head.state === MasterState.INACTIVE) {
    return { label: `${head.name} · ${text.attention.inactiveShort}`, warning: true };
  }
  return { label: head.name, warning: false };
}

interface RowProps {
  readonly row: WorkspaceUnit;
  readonly active: boolean;
  readonly collapsed: boolean;
  readonly onSelect: () => void;
  readonly onToggle: () => void;
}

function UnitRow({ row, active, collapsed, onSelect, onToggle }: RowProps) {
  const Icon = KIND_ICON[row.unit.kind];
  const head = headLine(row);
  const hasChildren = row.childIds.length > 0;
  return (
    <li className="flex min-w-0 items-center" style={{ paddingLeft: `${row.depth * 16}px` }}>
      {hasChildren ? (
        <button
          type="button"
          aria-label={`${collapsed ? text.list.expand : text.list.collapse}: ${row.unit.name}`}
          aria-expanded={!collapsed}
          className={TOGGLE_CLASS}
          onClick={onToggle}
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'size-4 transition-transform motion-reduce:transition-none',
              !collapsed && 'rotate-90',
            )}
          />
        </button>
      ) : (
        <span aria-hidden="true" className="size-5 shrink-0" />
      )}
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        aria-label={`${text.kinds[row.unit.kind]} ${row.unit.name}, ${fill(text.list.people, { n: row.headcount })}, ${head.label}`}
        className={cn(ROW_CLASS, 'pl-1', active && ACTIVE_CLASS)}
        onClick={onSelect}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">{row.unit.name}</span>
            {row.attention.length > 0 && (
              <TriangleAlertIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-orange-600 dark:text-orange-400"
              />
            )}
          </span>
          <span
            className={cn(
              'truncate text-xs',
              head.warning ? 'text-orange-700 dark:text-orange-300' : 'text-muted-foreground',
            )}
          >
            {head.label}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fill(text.list.people, { n: row.headcount })}
        </span>
      </button>
    </li>
  );
}

/**
 * The tree: the pinned "no node" row, then every site with its divisions, shops and sections.
 * Each row shows the head and the subtree headcount, so the picture is complete without opening
 * anything. Selection is a key, so the same list drives the desktop split and the mobile drill-down.
 */
export function UnitList({
  units,
  unassignedCount,
  selectedKey,
  collapsed,
  onSelect,
  onToggle,
  emptyText,
  groupBySite,
}: {
  readonly units: readonly WorkspaceUnit[];
  readonly unassignedCount: number;
  readonly selectedKey: string | null;
  readonly collapsed: ReadonlySet<string>;
  readonly onSelect: (key: string) => void;
  readonly onToggle: (unitId: string) => void;
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
        collapsed={collapsed.has(row.unit.id)}
        onSelect={() => onSelect(row.unit.id)}
        onToggle={() => onToggle(row.unit.id)}
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
