import { useState } from 'react';
import { TriangleAlertIcon, UserRoundCheckIcon, UserRoundPlusIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { UserAvatar } from '@/components/app/avatar';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, StatusPill } from '@/components/app/page';
import { EmployeeStatusSchema } from '@vakhta/contracts';
import {
  MasterState,
  type MasterInfo,
  type WorkspacePerson,
  type WorkspaceUnit,
} from '../../model/workspace';
import { fill, text } from './text';

function MasterAlert({ master }: { readonly master: MasterInfo }) {
  if (master.state === MasterState.ASSIGNED) return null;
  if (master.state === MasterState.MISSING) {
    return (
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>{text.attention.NO_MASTER}</AlertTitle>
        <AlertDescription>{text.attention.noMasterHint}</AlertDescription>
      </Alert>
    );
  }
  if (master.state === MasterState.INACTIVE) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>{text.attention.MASTER_INACTIVE}</AlertTitle>
        <AlertDescription>{text.attention.inactiveHint}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>{text.attention.MASTER_ELSEWHERE}</AlertTitle>
      <AlertDescription>
        {fill(text.attention.elsewhereHint, { unit: master.worksIn ?? '—' })}
      </AlertDescription>
    </Alert>
  );
}

function CandidateItem({
  person,
  onPick,
}: {
  readonly person: WorkspacePerson;
  readonly onPick: () => void;
}) {
  return (
    <CommandItem
      value={`${person.fullName} ${person.personnelNumber}`}
      onSelect={onPick}
      className="flex items-center gap-2"
    >
      <UserAvatar name={person.fullName} email={person.id} image={null} className="size-6" />
      <span className="min-w-0 flex-1 truncate">{person.fullName}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {person.positionName ?? person.personnelNumber}
      </span>
    </CommandItem>
  );
}

function MasterPicker({
  row,
  candidates,
  onAssign,
  defaultOpen,
}: {
  readonly row: WorkspaceUnit;
  readonly candidates: readonly WorkspacePerson[];
  readonly onAssign: (employeeId: string) => void;
  readonly defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const active = candidates.filter(
    (person) =>
      person.status === EmployeeStatusSchema.enum.ACTIVE &&
      person.id !== row.unit.designatedMaster?.id,
  );
  const inside = active.filter((person) => person.unitId === row.unit.id);
  const outside = active.filter((person) => person.unitId !== row.unit.id);
  const assigned = row.master.state !== MasterState.MISSING;
  const pick = (id: string) => {
    onAssign(id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant={assigned ? 'outline' : 'default'}>
          {assigned ? (
            <UserRoundCheckIcon aria-hidden="true" />
          ) : (
            <UserRoundPlusIcon aria-hidden="true" />
          )}
          {assigned ? text.master.replace : text.master.assign}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" aria-label={text.master.pick}>
        <Command loop>
          <CommandInput placeholder={text.master.pick} aria-label={text.master.pick} />
          <CommandList label={text.master.pick} className="max-h-72">
            <CommandEmpty>{text.search.noResults}</CommandEmpty>
            {inside.length > 0 && (
              <CommandGroup heading={text.master.fromUnit}>
                {inside.map((person) => (
                  <CandidateItem key={person.id} person={person} onPick={() => pick(person.id)} />
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={text.master.others}>
              {outside.map((person) => (
                <CandidateItem key={person.id} person={person} onPick={() => pick(person.id)} />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MasterIdentity({ master }: { readonly master: MasterInfo }) {
  if (master.state === MasterState.MISSING) {
    return (
      <Muted className="text-orange-700 dark:text-orange-300">{text.attention.NO_MASTER}</Muted>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={master.name} email={master.id} image={null} className="size-8" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{master.name}</span>
        {master.state === MasterState.ELSEWHERE && (
          <span className="truncate text-xs text-muted-foreground">
            {fill(text.master.worksIn, { unit: master.worksIn ?? '—' })}
          </span>
        )}
      </span>
      {master.state === MasterState.INACTIVE && (
        <StatusPill tone="danger">{text.statuses[master.status]}</StatusPill>
      )}
    </span>
  );
}

/**
 * Who answers for the unit, always in view: the name, its state, and the one action that
 * changes it. Assigning does not grant panel access, which the tooltip says once.
 */
export function MasterBlock({
  row,
  candidates,
  editable,
  onAssign,
  onClear,
  pickerOpen = false,
}: {
  readonly row: WorkspaceUnit;
  readonly candidates: readonly WorkspacePerson[];
  readonly editable: boolean;
  readonly onAssign: (employeeId: string) => void;
  readonly onClear: () => void;
  readonly pickerOpen?: boolean;
}) {
  return (
    <section
      aria-label={text.master.heading}
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {text.master.heading}
          <InfoTip text={text.master.hint} />
        </span>
        <div className="min-w-0 flex-1">
          <MasterIdentity master={row.master} />
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <MasterPicker
              row={row}
              candidates={candidates}
              onAssign={onAssign}
              defaultOpen={pickerOpen}
            />
            {row.master.state !== MasterState.MISSING && (
              <Button type="button" size="sm" variant="ghost" onClick={onClear}>
                {text.master.clear}
              </Button>
            )}
          </div>
        )}
      </div>
      <MasterAlert master={row.master} />
    </section>
  );
}
