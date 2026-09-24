import { useState, type ReactNode } from 'react';
import type { PositionView } from '@vakhta/contracts';
import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Label } from '@/components/ui/label';
import { Muted } from '@/components/app/page';
import type { WorkspacePerson, WorkspaceUnit } from '../../model/workspace';
import { fill, text } from './text';

export interface MoveTarget {
  readonly unitId: string;
  readonly positionId: string;
  readonly teamId: string | null;
}

/** "Move" changes the unit of placed people; "assign" gives unplaced people their first one. */
export type MoveMode = 'move' | 'assign';

interface Props {
  readonly mode: MoveMode;
  readonly people: readonly WorkspacePerson[];
  readonly units: readonly WorkspaceUnit[];
  readonly positions: readonly PositionView[];
  /** Unit the people sit in now; it is listed but cannot be chosen again. */
  readonly currentUnitId: string | null;
  readonly onConfirm: (target: MoveTarget) => void;
  readonly trigger: ReactNode;
  readonly defaultOpen?: boolean;
  /** Prototype only: opens on the second step for a given unit. */
  readonly initialTargetId?: string;
}

/** The one position every selected person shares, when they do; otherwise a choice is needed. */
function sharedPosition(people: readonly WorkspacePerson[]): string | null {
  const first = people[0]?.positionId ?? null;
  if (first === null) return null;
  return people.every((person) => person.positionId === first) ? first : null;
}

function UnitChoice({
  units,
  currentUnitId,
  onPick,
}: {
  readonly units: readonly WorkspaceUnit[];
  readonly currentUnitId: string | null;
  readonly onPick: (unit: WorkspaceUnit) => void;
}) {
  const bySite = new Map<string, WorkspaceUnit[]>();
  for (const row of units) bySite.set(row.siteName, [...(bySite.get(row.siteName) ?? []), row]);
  return (
    <Command loop>
      <CommandInput placeholder={text.move.searchUnit} aria-label={text.move.searchUnit} />
      <CommandList label={text.move.searchUnit} className="max-h-72">
        <CommandEmpty>{text.search.noResults}</CommandEmpty>
        {[...bySite].map(([site, rows]) => (
          <CommandGroup key={site} heading={bySite.size > 1 ? site : undefined}>
            {rows.map((row) => {
              const current = row.unit.id === currentUnitId;
              return (
                <CommandItem
                  key={row.unit.id}
                  value={`${row.unit.name} ${row.unit.id}`}
                  disabled={current}
                  onSelect={() => onPick(row)}
                  className="flex items-center gap-2"
                  style={{ paddingLeft: `${8 + row.depth * 12}px` }}
                >
                  <span className="min-w-0 flex-1 truncate">{row.unit.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {current ? text.move.sameUnit : fill(text.list.people, { n: row.headcount })}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

function ChoiceField({
  id,
  label,
  value,
  onChange,
  blank,
  options,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly blank: string;
  readonly options: readonly { readonly id: string; readonly name: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <NativeSelectOption value="">{blank}</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option.id} value={option.id}>
            {option.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function ConfirmStep({
  mode,
  people,
  target,
  positions,
  onBack,
  onConfirm,
}: {
  readonly mode: MoveMode;
  readonly people: readonly WorkspacePerson[];
  readonly target: WorkspaceUnit;
  readonly positions: readonly PositionView[];
  readonly onBack: () => void;
  readonly onConfirm: (target: MoveTarget) => void;
}) {
  const shared = sharedPosition(people);
  const [positionId, setPositionId] = useState(shared ?? '');
  const [teamId, setTeamId] = useState('');
  const sharedName = positions.find((position) => position.id === shared)?.name ?? '';
  const many = people.length > 1;
  const confirmLabel = confirmText(mode, people.length);
  const leavesTeam = people.some((person) => person.teamId !== null);
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="min-w-0 truncate">
          {many ? fill(text.people.selected, { n: people.length }) : people[0]?.fullName}
        </span>
        <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={onBack}
          className="min-w-0 truncate rounded-md font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {target.unit.name}
        </button>
      </div>
      {shared ? (
        <Muted>{fill(text.move.keepPosition, { position: sharedName })}</Muted>
      ) : (
        <ChoiceField
          id="move-position"
          label={text.move.choosePosition}
          value={positionId}
          onChange={setPositionId}
          blank={text.move.pickPosition}
          options={positions}
        />
      )}
      {target.teams.length > 0 && (
        <ChoiceField
          id="move-team"
          label={text.move.team}
          value={teamId}
          onChange={setTeamId}
          blank={text.move.noTeam}
          options={target.teams}
        />
      )}
      {leavesTeam && target.teams.length === 0 && <Muted>{text.move.teamReset}</Muted>}
      <Muted className="text-xs">{text.move.effective}</Muted>
      <Button
        type="button"
        size="sm"
        disabled={positionId === ''}
        onClick={() => onConfirm({ unitId: target.unit.id, positionId, teamId: teamId || null })}
      >
        <CheckIcon aria-hidden="true" />
        {confirmLabel}
      </Button>
    </div>
  );
}

function confirmText(mode: MoveMode, count: number) {
  if (mode === 'assign') {
    return count > 1 ? fill(text.move.confirmAssignMany, { n: count }) : text.move.confirmAssign;
  }
  return count > 1 ? fill(text.move.confirmMany, { n: count }) : text.move.confirm;
}

/**
 * Two steps in one popover: pick the unit, then confirm what travels with the people
 * (their position, an optional team). No dialog: the row or selection bar stays in view.
 */
export function MovePopover({
  mode,
  people,
  units,
  positions,
  currentUnitId,
  onConfirm,
  trigger,
  defaultOpen = false,
  initialTargetId,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [target, setTarget] = useState<WorkspaceUnit | null>(
    units.find((row) => row.unit.id === initialTargetId) ?? null,
  );
  const title = mode === 'assign' ? text.move.assignTitle : text.move.title;
  const confirm = (next: MoveTarget) => {
    onConfirm(next);
    setOpen(false);
    setTarget(null);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" aria-label={title}>
        <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{title}</p>
        {target ? (
          <ConfirmStep
            mode={mode}
            people={people}
            target={target}
            positions={positions}
            onBack={() => setTarget(null)}
            onConfirm={confirm}
          />
        ) : (
          <UnitChoice units={units} currentUnitId={currentUnitId} onPick={setTarget} />
        )}
      </PopoverContent>
    </Popover>
  );
}
