import type { PositionView } from '@vakhta/contracts';
import {
  ArchiveIcon,
  ChevronRightIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  FolderInputIcon,
  FolderPlusIcon,
  HistoryIcon,
  InfoIcon,
  PencilIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Muted, StatusPill } from '@/components/app/page';
import type { QueryFeedbackState } from '@/components/app/query-feedback';
import { formatDate } from '@/lib/format';
import { OrgUnitKind, type ResponsibleSlot } from '../../model/org-node';
import type { WorkspacePerson, WorkspaceUnit } from '../../model/workspace';
import { PeopleTable, type MoveRequest, type PeopleDemo } from './people-table';
import { ResponsiblesBlock } from './responsibles-block';
import { fill, text } from './text';

export interface DetailActions {
  readonly onMove: (request: MoveRequest) => void;
  readonly onAssignResponsible: (unitId: string, slot: ResponsibleSlot, employeeId: string) => void;
  readonly onClearResponsible: (unitId: string, slot: ResponsibleSlot) => void;
  readonly onEdit: (unit: WorkspaceUnit) => void;
  readonly onAddChild: (unit: WorkspaceUnit) => void;
  readonly onMoveNode: (unit: WorkspaceUnit) => void;
  readonly onArchive: (unit: WorkspaceUnit) => void;
  readonly onOpenShifts: (unit: WorkspaceUnit) => void;
  readonly onSelect: (key: string) => void;
}

/** Prototype-only switches that open popovers and sections for the screenshots. */
export interface DetailDemo extends PeopleDemo {
  readonly slotPicker?: ResponsibleSlot;
  readonly historyOpen?: boolean;
  readonly menuOpen?: boolean;
}

interface Shared {
  readonly units: readonly WorkspaceUnit[];
  readonly positions: readonly PositionView[];
  readonly today: string;
  readonly editable: boolean;
  readonly highlightId: string | null;
  readonly queryState?: QueryFeedbackState;
  readonly demo?: DetailDemo;
}

function UnitMenu({
  row,
  actions,
  defaultOpen,
}: {
  readonly row: WorkspaceUnit;
  readonly actions: DetailActions;
  readonly defaultOpen: boolean;
}) {
  const blocked = row.headcount > 0 || row.childIds.length > 0;
  const canNest = row.unit.kind !== OrgUnitKind.SECTION;
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label={text.unit.edit}>
          <EllipsisVerticalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={() => actions.onEdit(row)}>
          <PencilIcon aria-hidden="true" />
          {text.unit.edit}
        </DropdownMenuItem>
        {canNest && (
          <DropdownMenuItem onSelect={() => actions.onAddChild(row)}>
            <FolderPlusIcon aria-hidden="true" />
            {text.unit.addChild}
          </DropdownMenuItem>
        )}
        {row.unit.kind !== OrgUnitKind.DIVISION && (
          <DropdownMenuItem onSelect={() => actions.onMoveNode(row)}>
            <FolderInputIcon aria-hidden="true" />
            {text.unit.moveNode}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => actions.onOpenShifts(row)}>
          <ClockIcon aria-hidden="true" />
          {text.unit.shifts}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <DropdownMenuItem
                variant="destructive"
                disabled={blocked}
                onSelect={() => actions.onArchive(row)}
              >
                <ArchiveIcon aria-hidden="true" />
                {text.unit.archive}
              </DropdownMenuItem>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {blocked ? text.unit.archiveBlocked : text.unit.archiveHint}
          </TooltipContent>
        </Tooltip>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Breadcrumb({
  row,
  onSelect,
}: {
  readonly row: WorkspaceUnit;
  readonly onSelect: (key: string) => void;
}) {
  const ancestors = row.path.slice(0, -1);
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      <span className="truncate">{row.siteName}</span>
      {ancestors.map((step) => (
        <span key={step.id} className="flex min-w-0 items-center gap-x-1">
          <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0" />
          <button
            type="button"
            className="truncate rounded underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => onSelect(step.id)}
          >
            {step.name}
          </button>
        </span>
      ))}
    </p>
  );
}

function Facts({ row }: { readonly row: WorkspaceUnit }) {
  const parts: string[] = [fill(text.list.people, { n: row.headcount })];
  if (row.teams.length > 0) {
    parts.push(`${text.unit.teams}: ${row.teams.map((team) => team.name).join(', ')}`);
  }
  if (row.zones > 0) parts.push(fill(text.unit.zonesCount, { n: row.zones }));
  parts.push(`${text.unit.validFrom} ${formatDate(row.unit.validFrom)}`);
  return <Muted className="text-xs">{parts.join(' · ')}</Muted>;
}

function UnitHeader({
  row,
  units,
  editable,
  actions,
  menuOpen,
}: {
  readonly row: WorkspaceUnit;
  readonly units: readonly WorkspaceUnit[];
  readonly editable: boolean;
  readonly actions: DetailActions;
  readonly menuOpen: boolean;
}) {
  const childIds = new Set(row.childIds);
  const children = units.filter((unit) => childIds.has(unit.unit.id));
  return (
    <header className="flex flex-col gap-2">
      <Breadcrumb row={row} onSelect={actions.onSelect} />
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold [overflow-wrap:anywhere]">
            {row.unit.name}
            <StatusPill tone="neutral">{text.kinds[row.unit.kind]}</StatusPill>
          </h2>
          <Facts row={row} />
        </div>
        {editable ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => actions.onEdit(row)}>
              <PencilIcon aria-hidden="true" />
              {text.unit.edit}
            </Button>
            <UnitMenu row={row} actions={actions} defaultOpen={menuOpen} />
          </div>
        ) : (
          <StatusPill tone="neutral">{text.unit.viewOnly}</StatusPill>
        )}
      </div>
      {children.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Muted className="text-xs">{text.unit.children}:</Muted>
          {children.map((child) => (
            <StatusPill key={child.unit.id} tone="neutral" asChild>
              <button type="button" onClick={() => actions.onSelect(child.unit.id)}>
                {child.unit.name} · {child.headcount}
              </button>
            </StatusPill>
          ))}
        </div>
      )}
    </header>
  );
}

function HistorySection({
  row,
  defaultOpen,
}: {
  readonly row: WorkspaceUnit;
  readonly defaultOpen: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-1.5 rounded-md text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          />
          <HistoryIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          {text.unit.history}
          <Muted className="text-xs tabular-nums">({row.history.length})</Muted>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {row.history.length === 0 ? (
          <Muted className="mt-2 text-sm">{text.unit.historyEmpty}</Muted>
        ) : (
          <ol className="mt-2 flex flex-col gap-1.5 border-l border-border pl-4 text-sm">
            {row.history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular-nums text-muted-foreground">{formatDate(entry.at)}</span>
                <span className="[overflow-wrap:anywhere]">{entry.text}</span>
                <Muted className="text-xs">{entry.author}</Muted>
              </li>
            ))}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Everything about one node on one screen: who answers for it, who works in it, what to do. */
export function UnitDetail({
  row,
  people,
  actions,
  units,
  positions,
  today,
  editable,
  highlightId,
  queryState,
  demo = {},
}: Shared & {
  readonly row: WorkspaceUnit;
  /** Whole roster, for responsible candidates outside the node. */
  readonly people: readonly WorkspacePerson[];
  readonly actions: DetailActions;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <UnitHeader
        row={row}
        units={units}
        editable={editable}
        actions={actions}
        menuOpen={demo.menuOpen ?? false}
      />
      <ResponsiblesBlock
        row={row}
        candidates={people}
        editable={editable}
        onAssign={(slot, id) => actions.onAssignResponsible(row.unit.id, slot, id)}
        onClear={(slot) => actions.onClearResponsible(row.unit.id, slot)}
        pickerSlot={demo.slotPicker ?? null}
      />
      <section aria-label={text.unit.employees} className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <UsersRoundIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          {text.unit.employees}
        </h3>
        <PeopleTable
          mode="move"
          people={row.people}
          units={units}
          positions={positions}
          currentUnitId={row.unit.id}
          today={today}
          editable={editable}
          highlightId={highlightId}
          queryState={queryState}
          onMove={actions.onMove}
          onMakeHead={(person) => actions.onAssignResponsible(row.unit.id, 'HEAD', person.id)}
          empty={text.unit.noEmployees}
          emptyDescription={text.unit.noEmployeesHint}
          emptyAction={
            <Button type="button" variant="outline" onClick={() => actions.onSelect('unassigned')}>
              {text.unit.goUnassigned}
            </Button>
          }
          demo={demo}
        />
      </section>
      <HistorySection row={row} defaultOpen={demo.historyOpen ?? false} />
    </div>
  );
}

/** The pinned pool: people with no current position, and the fastest way to place them. */
export function UnassignedDetail({
  people,
  actions,
  units,
  positions,
  today,
  editable,
  highlightId,
  queryState,
  demo = {},
}: Shared & {
  readonly people: readonly WorkspacePerson[];
  readonly actions: Pick<DetailActions, 'onMove'>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{text.list.unassigned}</h2>
        <Muted className="text-xs">{fill(text.list.people, { n: people.length })}</Muted>
      </header>
      {people.length > 0 && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{text.list.unassignedHint}</AlertTitle>
          <AlertDescription>{text.people.unassignedWhy}</AlertDescription>
        </Alert>
      )}
      <PeopleTable
        mode="assign"
        people={people}
        units={units}
        positions={positions}
        currentUnitId={null}
        today={today}
        editable={editable}
        highlightId={highlightId}
        queryState={queryState}
        onMove={actions.onMove}
        empty={text.people.noUnassigned}
        emptyDescription={text.people.noUnassignedHint}
        demo={demo}
      />
    </div>
  );
}
