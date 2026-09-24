import { useState, type FormEvent } from 'react';
import { EmployeeStatusSchema, type SiteView } from '@vakhta/contracts';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AddDialog } from '@/components/app/add-dialog';
import { FormField, SelectField } from '@/components/app/fields';
import { isBlank } from '@/lib/forms';
import type { WorkspacePerson, WorkspaceUnit } from '../../model/workspace';
import { text } from './text';

export interface UnitDraft {
  readonly siteId: string;
  readonly parentId: string;
  readonly name: string;
  readonly masterEmployeeId: string;
}

export interface UnitFormPreset {
  readonly siteId?: string;
  readonly parentId?: string;
}

interface Choices {
  readonly sites: readonly SiteView[];
  readonly units: readonly WorkspaceUnit[];
  readonly people: readonly WorkspacePerson[];
}

function parentOptions(units: readonly WorkspaceUnit[], siteId: string) {
  return units
    .filter((row) => row.unit.siteId === siteId)
    .map((row) => ({
      value: row.unit.id,
      label: `${' '.repeat(row.depth * 3)}${row.unit.name}`,
    }));
}

function masterOptions(people: readonly WorkspacePerson[]) {
  return people
    .filter((person) => person.status === EmployeeStatusSchema.enum.ACTIVE)
    .map((person) => ({
      value: person.id,
      label: `${person.fullName} · ${person.personnelNumber}`,
    }));
}

function PlacementFields({
  draft,
  choices,
  onChange,
}: {
  readonly draft: UnitDraft;
  readonly choices: Choices;
  readonly onChange: (draft: UnitDraft) => void;
}) {
  return (
    <>
      {choices.sites.length > 1 && (
        <SelectField
          label={text.unit.site}
          value={draft.siteId}
          onChange={(siteId) => onChange({ ...draft, siteId, parentId: '' })}
          required
          options={choices.sites.map((site) => ({ value: site.id, label: site.name }))}
        />
      )}
      <SelectField
        label={text.unit.parent}
        value={draft.parentId}
        onChange={(parentId) => onChange({ ...draft, parentId })}
        placeholder={text.unit.noParent}
        options={parentOptions(choices.units, draft.siteId)}
      />
      <SelectField
        label={text.master.heading}
        hint={text.master.hint}
        value={draft.masterEmployeeId}
        onChange={(masterEmployeeId) => onChange({ ...draft, masterEmployeeId })}
        placeholder={text.unit.masterOptional}
        searchable
        options={masterOptions(choices.people)}
      />
    </>
  );
}

/**
 * Create a unit in one dialog: site, optional parent, name, and the master while it is on the
 * administrator's mind — the "no master" warning would otherwise appear the moment the unit exists.
 */
export function UnitFormDialog({
  open,
  onOpenChange,
  choices,
  preset = {},
  onSubmit,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly choices: Choices;
  readonly preset?: UnitFormPreset;
  readonly onSubmit: (draft: UnitDraft) => void;
}) {
  const [draft, setDraft] = useState<UnitDraft>({
    siteId: preset.siteId ?? choices.sites[0]?.id ?? '',
    parentId: preset.parentId ?? '',
    name: '',
    masterEmployeeId: '',
  });
  const incomplete = isBlank(draft.name) || !draft.siteId;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (incomplete) return;
    onSubmit(draft);
  };
  return (
    <AddDialog title={text.unit.create} open={open} onOpenChange={onOpenChange} hideTrigger>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <FormField label={text.unit.name}>
          {(id) => (
            <Input
              id={id}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              required
              autoFocus
            />
          )}
        </FormField>
        <PlacementFields draft={draft} choices={choices} onChange={setDraft} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {text.unit.cancel}
          </Button>
          <Button type="submit" disabled={incomplete}>
            {text.unit.add}
          </Button>
        </DialogFooter>
      </form>
    </AddDialog>
  );
}
