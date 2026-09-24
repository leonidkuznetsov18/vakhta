import { useState } from 'react';
import { EmployeeStatusSchema } from '@vakhta/contracts';
import { TriangleAlertIcon, UserRoundPlusIcon } from 'lucide-react';
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
import { formatDate } from '@/lib/format';
import type { ResponsibleSlot } from '../../model/org-node';
import {
  MasterState,
  UnitAttention,
  type ResponsibleInfo,
  type WorkspacePerson,
  type WorkspaceUnit,
} from '../../model/workspace';
import { fill, text } from './text';

function AttentionAlerts({ row }: { readonly row: WorkspaceUnit }) {
  const problems = row.responsibles.filter((item) => item.info.state !== MasterState.ASSIGNED);
  const elsewhere = row.responsibles.find(
    (item) => item.info.state === MasterState.ELSEWHERE,
  )?.info;
  return (
    <>
      {row.attention.includes(UnitAttention.NO_HEAD) && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{text.attention.NO_HEAD}</AlertTitle>
          <AlertDescription>{text.attention.noHeadHint}</AlertDescription>
        </Alert>
      )}
      {row.attention.includes(UnitAttention.NO_SHIFT_MASTER) && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{text.attention.NO_SHIFT_MASTER}</AlertTitle>
          <AlertDescription>{text.attention.noMasterHint}</AlertDescription>
        </Alert>
      )}
      {problems.some((item) => item.info.state === MasterState.INACTIVE) && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{text.attention.RESPONSIBLE_INACTIVE}</AlertTitle>
          <AlertDescription>{text.attention.inactiveHint}</AlertDescription>
        </Alert>
      )}
      {elsewhere?.state === MasterState.ELSEWHERE && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{text.attention.RESPONSIBLE_ELSEWHERE}</AlertTitle>
          <AlertDescription>
            {fill(text.attention.elsewhereHint, {
              name: elsewhere.name,
              unit: elsewhere.worksIn ?? '—',
            })}
          </AlertDescription>
        </Alert>
      )}
    </>
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

function SlotPicker({
  row,
  item,
  candidates,
  onAssign,
  defaultOpen,
}: {
  readonly row: WorkspaceUnit;
  readonly item: ResponsibleInfo;
  readonly candidates: readonly WorkspacePerson[];
  readonly onAssign: (employeeId: string) => void;
  readonly defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { slot, info } = item;
  const currentId = info.state === MasterState.MISSING ? null : info.id;
  const subtree = new Set([row.unit.id, ...row.childIds]);
  const active = candidates.filter(
    (person) => person.status === EmployeeStatusSchema.enum.ACTIVE && person.id !== currentId,
  );
  const inside = active.filter((person) => person.unitId !== null && subtree.has(person.unitId));
  const outside = active.filter((person) => person.unitId === null || !subtree.has(person.unitId));
  const assigned = info.state !== MasterState.MISSING && item.inheritedFrom === null;
  const pick = (id: string) => {
    onAssign(id);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant={assigned ? 'ghost' : 'outline'}>
          {!assigned && <UserRoundPlusIcon aria-hidden="true" />}
          {assigned ? text.slots.replace : text.slots.assign}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" aria-label={text.slots[slot]}>
        <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          {text.slots[slot]}
        </p>
        <Command loop>
          <CommandInput placeholder={text.slots.pick} aria-label={text.slots.pick} />
          <CommandList label={text.slots.pick} className="max-h-72">
            <CommandEmpty>{text.search.noResults}</CommandEmpty>
            {inside.length > 0 && (
              <CommandGroup heading={text.slots.fromUnit}>
                {inside.map((person) => (
                  <CandidateItem key={person.id} person={person} onPick={() => pick(person.id)} />
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={text.slots.others}>
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

function slotNote(item: ResponsibleInfo): string {
  const info = item.info;
  if (info.state === MasterState.MISSING) return '';
  if (item.inheritedFrom) return fill(text.slots.inherited, { unit: item.inheritedFrom });
  if (info.state === MasterState.ELSEWHERE) {
    return fill(text.slots.worksIn, { unit: info.worksIn ?? '—' });
  }
  return fill(text.slots.since, { date: formatDate(info.since) });
}

function SlotIdentity({ item }: { readonly item: ResponsibleInfo }) {
  const info = item.info;
  if (info.state === MasterState.MISSING) {
    return <Muted className="text-orange-700 dark:text-orange-300">{text.slots.missing}</Muted>;
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={info.name} email={info.id} image={null} className="size-7" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{info.name}</span>
        <span className="truncate text-xs text-muted-foreground">{slotNote(item)}</span>
      </span>
      {info.state === MasterState.INACTIVE && (
        <StatusPill tone="danger">{text.statuses[info.status]}</StatusPill>
      )}
    </span>
  );
}

function SlotRow({
  row,
  item,
  candidates,
  editable,
  onAssign,
  onClear,
  pickerOpen,
}: {
  readonly row: WorkspaceUnit;
  readonly item: ResponsibleInfo;
  readonly candidates: readonly WorkspacePerson[];
  readonly editable: boolean;
  readonly onAssign: (employeeId: string) => void;
  readonly onClear: () => void;
  readonly pickerOpen: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
      <span className="text-xs font-medium text-muted-foreground">{text.slots[item.slot]}</span>
      <SlotIdentity item={item} />
      {editable && (
        <span className="flex items-center gap-1 sm:justify-end">
          <SlotPicker
            row={row}
            item={item}
            candidates={candidates}
            onAssign={onAssign}
            defaultOpen={pickerOpen}
          />
          {item.info.state !== MasterState.MISSING && item.inheritedFrom === null && (
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              {text.slots.clear}
            </Button>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Who answers for the node, always in view: the head and the two shift masters, each with its
 * state and the one action that changes it. Assigning does not grant panel access; the tooltip
 * says so once.
 */
export function ResponsiblesBlock({
  row,
  candidates,
  editable,
  onAssign,
  onClear,
  pickerSlot = null,
}: {
  readonly row: WorkspaceUnit;
  readonly candidates: readonly WorkspacePerson[];
  readonly editable: boolean;
  readonly onAssign: (slot: ResponsibleSlot, employeeId: string) => void;
  readonly onClear: (slot: ResponsibleSlot) => void;
  readonly pickerSlot?: ResponsibleSlot | null;
}) {
  return (
    <section
      aria-label={text.slots.heading}
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <h3 className="flex items-center gap-1 text-sm font-medium">
        {text.slots.heading}
        <InfoTip text={text.slots.hint} />
      </h3>
      <div className="flex flex-col gap-2">
        {row.responsibles.map((item) => (
          <SlotRow
            key={item.slot}
            row={row}
            item={item}
            candidates={candidates}
            editable={editable}
            onAssign={(id) => onAssign(item.slot, id)}
            onClear={() => onClear(item.slot)}
            pickerOpen={pickerSlot === item.slot}
          />
        ))}
      </div>
      <AttentionAlerts row={row} />
    </section>
  );
}
