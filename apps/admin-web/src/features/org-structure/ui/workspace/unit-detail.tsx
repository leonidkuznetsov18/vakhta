import type { ReactNode } from 'react';
import type { PositionView } from '@vakhta/contracts';
import {
  ClockIcon,
  EllipsisVerticalIcon,
  FolderPlusIcon,
  InfoIcon,
  PencilIcon,
  Trash2Icon,
  UsersRoundIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import type { WorkspacePerson, WorkspaceUnit } from '../../model/workspace';
import { MasterBlock } from './master-block';
import { PeopleTable, type MoveRequest, type PeopleDemo } from './people-table';
import { fill, text } from './text';

export interface DetailActions {
  readonly onMove: (request: MoveRequest) => void;
  readonly onAssignMaster: (unitId: string, employeeId: string) => void;
  readonly onClearMaster: (unitId: string) => void;
  readonly onEdit: (unit: WorkspaceUnit) => void;
  readonly onAddChild: (unit: WorkspaceUnit) => void;
  readonly onDelete: (unit: WorkspaceUnit) => void;
  readonly onOpenShifts: (unit: WorkspaceUnit) => void;
  readonly onSelect: (key: string) => void;
}

/** Prototype-only switches that open popovers for the screenshots. */
export interface DetailDemo extends PeopleDemo {
  readonly masterPicker?: boolean;
}

function Crumb({ children }: { readonly children: ReactNode }) {
  return <span className="min-w-0 truncate">{children}</span>;
}

function UnitMenu({
  row,
  actions,
}: {
  readonly row: WorkspaceUnit;
  readonly actions: DetailActions;
}) {
  const blocked = row.headcount > 0 || row.childIds.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon-sm" aria-label={text.unit.edit}>
          <EllipsisVerticalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => actions.onEdit(row)}>
          <PencilIcon aria-hidden="true" />
          {text.unit.edit}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onAddChild(row)}>
          <FolderPlusIcon aria-hidden="true" />
          {text.unit.addChild}
        </DropdownMenuItem>
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
                onSelect={() => actions.onDelete(row)}
              >
                <Trash2Icon aria-hidden="true" />
                {text.unit.delete}
              </DropdownMenuItem>
            </span>
          </TooltipTrigger>
          {blocked && <TooltipContent>{text.unit.deleteBlocked}</TooltipContent>}
        </Tooltip>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UnitHeader({
  row,
  units,
  editable,
  actions,
}: {
  readonly row: WorkspaceUnit;
  readonly units: readonly WorkspaceUnit[];
  readonly editable: boolean;
  readonly actions: DetailActions;
}) {
  const childIds = new Set(row.childIds);
  const children = units.filter((unit) => childIds.has(unit.unit.id));
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{row.unit.name}</h2>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <Crumb>{row.siteName}</Crumb>
            {row.parentName && (
              <>
                <span aria-hidden="true">›</span>
                <button
                  type="button"
                  className="truncate underline-offset-4 hover:underline"
                  onClick={() => row.unit.parentId && actions.onSelect(row.unit.parentId)}
                >
                  {row.parentName}
                </button>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{fill(text.list.people, { n: row.headcount })}</span>
            {row.teams.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {text.unit.teams}: {row.teams.map((team) => team.name).join(', ')}
                </span>
              </>
            )}
            {row.zones > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{fill(text.unit.zonesCount, { n: row.zones })}</span>
              </>
            )}
          </p>
        </div>
        {editable ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => actions.onEdit(row)}>
              <PencilIcon aria-hidden="true" />
              {text.unit.edit}
            </Button>
            <UnitMenu row={row} actions={actions} />
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

/** Everything about one unit on one screen: who answers for it, who works in it, what to do. */
export function UnitDetail({
  row,
  units,
  people,
  positions,
  editable,
  highlightId,
  queryState,
  actions,
  demo = {},
}: {
  readonly row: WorkspaceUnit;
  readonly units: readonly WorkspaceUnit[];
  /** Whole roster, for master candidates outside the unit. */
  readonly people: readonly WorkspacePerson[];
  readonly positions: readonly PositionView[];
  readonly editable: boolean;
  readonly highlightId: string | null;
  readonly queryState?: QueryFeedbackState;
  readonly actions: DetailActions;
  readonly demo?: DetailDemo;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <UnitHeader row={row} units={units} editable={editable} actions={actions} />
      <MasterBlock
        row={row}
        candidates={people}
        editable={editable}
        onAssign={(id) => actions.onAssignMaster(row.unit.id, id)}
        onClear={() => actions.onClearMaster(row.unit.id)}
        pickerOpen={demo.masterPicker}
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
          editable={editable}
          highlightId={highlightId}
          queryState={queryState}
          onMove={actions.onMove}
          onMakeMaster={(person) => actions.onAssignMaster(row.unit.id, person.id)}
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
    </div>
  );
}

/** The pinned pool: people with no current position, and the fastest way to place them. */
export function UnassignedDetail({
  people,
  units,
  positions,
  editable,
  highlightId,
  queryState,
  actions,
  demo = {},
}: {
  readonly people: readonly WorkspacePerson[];
  readonly units: readonly WorkspaceUnit[];
  readonly positions: readonly PositionView[];
  readonly editable: boolean;
  readonly highlightId: string | null;
  readonly queryState?: QueryFeedbackState;
  readonly actions: Pick<DetailActions, 'onMove'>;
  readonly demo?: DetailDemo;
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
