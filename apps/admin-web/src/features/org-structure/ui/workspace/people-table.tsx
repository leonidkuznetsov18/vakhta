import { useState, type ReactNode } from 'react';
import { EmployeeStatusSchema, type PositionView } from '@vakhta/contracts';
import { ArrowRightLeftIcon, UserRoundCheckIcon, UserRoundIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/app/avatar';
import { DataTable, type Column, type RowAction } from '@/components/app/data-table';
import { Muted, StatusPill } from '@/components/app/page';
import type { QueryFeedbackState } from '@/components/app/query-feedback';
import { formatDate } from '@/lib/format';
import type { WorkspacePerson, WorkspaceUnit } from '../../model/workspace';
import { MovePopover, type MoveMode, type MoveTarget } from './move-popover';
import { fill, text } from './text';

export interface MoveRequest {
  readonly people: readonly WorkspacePerson[];
  readonly target: MoveTarget;
}

/** Where the people can go: the same for every row and for the selection. */
interface Destinations {
  readonly mode: MoveMode;
  readonly units: readonly WorkspaceUnit[];
  readonly positions: readonly PositionView[];
  readonly currentUnitId: string | null;
  readonly today: string;
}

/** Prototype only: opens popovers and preselects rows for the screenshots. */
export interface PeopleDemo {
  readonly openMoveFor?: { readonly personId: string; readonly targetId?: string };
  readonly initialSelection?: readonly string[];
  readonly openBulkTargetId?: string;
}

interface Props extends Destinations {
  readonly people: readonly WorkspacePerson[];
  readonly editable: boolean;
  readonly highlightId: string | null;
  readonly queryState?: QueryFeedbackState;
  readonly onMove: (request: MoveRequest) => void;
  readonly onMakeHead?: (person: WorkspacePerson) => void;
  readonly empty: string;
  readonly emptyDescription?: string;
  readonly emptyAction?: ReactNode;
  readonly demo?: PeopleDemo;
}

function PersonCell({ person }: { readonly person: WorkspacePerson }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={person.fullName} email={person.id} image={null} className="size-7" />
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{person.fullName}</span>
          {person.status !== EmployeeStatusSchema.enum.ACTIVE && (
            <StatusPill tone="caution">{text.statuses[person.status]}</StatusPill>
          )}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{person.personnelNumber}</span>
      </span>
    </span>
  );
}

function moveLabel(mode: MoveMode) {
  return mode === 'assign' ? text.people.assign : text.people.move;
}

const NAME_COLUMN: Column<WorkspacePerson> = {
  key: 'name',
  header: text.people.name,
  cell: (person) => <PersonCell person={person} />,
  sortValue: (person) => person.fullName,
};

/** Unplaced people have no position to show; how long they have waited is what matters. */
function unassignedColumns(): Column<WorkspacePerson>[] {
  return [
    NAME_COLUMN,
    {
      key: 'since',
      header: text.people.since,
      cell: (person) => formatDate(person.createdAt),
      sortValue: (person) => person.createdAt,
    },
  ];
}

function placedColumns(): Column<WorkspacePerson>[] {
  return [
    NAME_COLUMN,
    {
      key: 'position',
      header: text.people.position,
      cell: (person) => person.positionName ?? <Muted>{text.people.noPosition}</Muted>,
      sortValue: (person) => person.positionName ?? '',
    },
    {
      key: 'manager',
      header: text.people.manager,
      cell: (person) => person.managerName ?? <Muted>{text.slots.missing}</Muted>,
      sortValue: (person) => person.managerName ?? '',
    },
    {
      key: 'team',
      header: text.people.team,
      cell: (person) => person.teamName ?? <Muted>{text.people.noTeam}</Muted>,
      sortValue: (person) => person.teamName ?? '',
      hideOnCards: true,
    },
  ];
}

function readColumns(mode: MoveMode): Column<WorkspacePerson>[] {
  return mode === 'assign' ? unassignedColumns() : placedColumns();
}

function moveColumn(
  to: Destinations,
  onMove: (request: MoveRequest) => void,
  demo: PeopleDemo,
): Column<WorkspacePerson> {
  const label = moveLabel(to.mode);
  return {
    key: 'move',
    header: '',
    align: 'right',
    label: text.people.action,
    cell: (person) => {
      const opened = demo.openMoveFor?.personId === person.id ? demo.openMoveFor : null;
      return (
        <MovePopover
          {...to}
          people={[person]}
          onConfirm={(target) => onMove({ people: [person], target })}
          defaultOpen={opened !== null}
          initialTargetId={opened?.targetId}
          trigger={
            <Button type="button" size="sm" variant="ghost" className="text-muted-foreground">
              <ArrowRightLeftIcon aria-hidden="true" />
              {label}
            </Button>
          }
        />
      );
    },
  };
}

function SelectionBar({
  to,
  chosen,
  onMove,
  onClear,
  openTargetId,
}: {
  readonly to: Destinations;
  readonly chosen: readonly WorkspacePerson[];
  readonly onMove: (request: MoveRequest) => void;
  readonly onClear: () => void;
  readonly openTargetId?: string;
}) {
  const label = to.mode === 'assign' ? text.people.assignSelected : text.people.moveSelected;
  return (
    <MovePopover
      {...to}
      people={chosen}
      defaultOpen={openTargetId !== undefined}
      initialTargetId={openTargetId}
      onConfirm={(target) => {
        onMove({ people: chosen, target });
        onClear();
      }}
      trigger={
        <Button type="button" size="sm">
          <ArrowRightLeftIcon aria-hidden="true" />
          {label}
        </Button>
      }
    />
  );
}

function rowActions(props: Props, person: WorkspacePerson): RowAction[] {
  const actions: RowAction[] = [
    { key: 'profile', label: text.people.profile, icon: UserRoundIcon, onSelect: () => undefined },
  ];
  const makeHead = props.onMakeHead;
  if (props.editable && makeHead && props.mode === 'move') {
    actions.push({
      key: 'head',
      label: text.people.makeHead,
      icon: UserRoundCheckIcon,
      onSelect: () => makeHead(person),
    });
  }
  return actions;
}

/**
 * The people of one node (or of no node) with the one action that matters here: sending them
 * somewhere else. Multi-select turns the same action into a bulk move.
 */
export function PeopleTable(props: Props) {
  const {
    mode,
    people,
    units,
    positions,
    currentUnitId,
    today,
    editable,
    onMove,
    demo = {},
  } = props;
  const to: Destinations = { mode, units, positions, currentUnitId, today };
  const [selected, setSelected] = useState<Set<string>>(new Set(demo.initialSelection ?? []));
  const byId = new Map(people.map((person) => [person.id, person]));
  const chosen = [...selected].flatMap((id) => byId.get(id) ?? []);
  const columns = editable
    ? [...readColumns(mode), moveColumn(to, onMove, demo)]
    : readColumns(mode);
  return (
    <DataTable
      columns={columns}
      rows={people}
      rowKey={(person) => person.id}
      rowLabel={(person) => person.fullName}
      searchText={(person) => `${person.fullName} ${person.personnelNumber}`}
      empty={props.empty}
      emptyDescription={props.emptyDescription}
      emptyAction={props.emptyAction}
      queryState={props.queryState}
      pageSize={20}
      activeKey={props.highlightId}
      selectedKeys={editable ? selected : undefined}
      onSelectionChange={editable ? setSelected : undefined}
      selectionBar={
        <SelectionBar
          to={to}
          chosen={chosen}
          onMove={onMove}
          onClear={() => setSelected(new Set())}
          openTargetId={demo.openBulkTargetId}
        />
      }
      rowActions={(person) => rowActions(props, person)}
      caption={fill(text.people.total, { n: people.length })}
    />
  );
}
