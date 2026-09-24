import { useState, type FormEvent } from 'react';
import { EmployeeStatusSchema, type SiteView } from '@vakhta/contracts';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AddDialog } from '@/components/app/add-dialog';
import { DateField } from '@/components/app/date-picker';
import { FormField, SelectField } from '@/components/app/fields';
import { isBlank } from '@/lib/forms';
import { OrgUnitKind, PARENT_KIND } from '../../model/org-node';
import type { WorkspacePerson, WorkspaceUnit } from '../../model/workspace';
import { text } from './text';

export interface UnitDraft {
  readonly kind: OrgUnitKind;
  readonly siteId: string;
  readonly parentId: string;
  readonly name: string;
  readonly headEmployeeId: string;
  readonly validFrom: string;
}

export interface UnitFormPreset {
  readonly siteId?: string;
  readonly parentId?: string;
  readonly kind?: OrgUnitKind;
}

interface Choices {
  readonly sites: readonly SiteView[];
  readonly units: readonly WorkspaceUnit[];
  readonly people: readonly WorkspacePerson[];
  readonly today: string;
}

const KINDS: readonly OrgUnitKind[] = [OrgUnitKind.DIVISION, OrgUnitKind.SHOP, OrgUnitKind.SECTION];

/** Only nodes of the kind above can be the parent: a section lives in a shop, a shop in a division. */
function parentOptions(units: readonly WorkspaceUnit[], siteId: string, kind: OrgUnitKind) {
  const parentKind = PARENT_KIND[kind];
  return units
    .filter((row) => row.unit.siteId === siteId && row.unit.kind === parentKind)
    .map((row) => ({
      value: row.unit.id,
      label: row.path.map((step) => step.name).join(' › '),
    }));
}

function headOptions(people: readonly WorkspacePerson[]) {
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
  const needsParent = PARENT_KIND[draft.kind] !== null;
  return (
    <>
      <SelectField
        label={text.unit.kind}
        value={draft.kind}
        onChange={(kind) => onChange({ ...draft, kind: kind as OrgUnitKind, parentId: '' })}
        required
        options={KINDS.map((kind) => ({ value: kind, label: text.kinds[kind] }))}
      />
      {choices.sites.length > 1 && (
        <SelectField
          label={text.unit.site}
          value={draft.siteId}
          onChange={(siteId) => onChange({ ...draft, siteId, parentId: '' })}
          required
          options={choices.sites.map((site) => ({ value: site.id, label: site.name }))}
        />
      )}
      {needsParent && (
        <SelectField
          label={text.unit.parent}
          value={draft.parentId}
          onChange={(parentId) => onChange({ ...draft, parentId })}
          required
          options={parentOptions(choices.units, draft.siteId, draft.kind)}
        />
      )}
      <SelectField
        label={text.slots.HEAD}
        hint={text.slots.hint}
        value={draft.headEmployeeId}
        onChange={(headEmployeeId) => onChange({ ...draft, headEmployeeId })}
        placeholder={text.unit.headOptional}
        searchable
        options={headOptions(choices.people)}
      />
      <DateField
        label={text.unit.validFrom}
        value={draft.validFrom}
        onChange={(validFrom) => onChange({ ...draft, validFrom })}
      />
    </>
  );
}

function isIncomplete(draft: UnitDraft): boolean {
  if (isBlank(draft.name) || !draft.siteId || !draft.validFrom) return true;
  const needsParent = PARENT_KIND[draft.kind] !== null;
  return needsParent && !draft.parentId;
}

/**
 * Create a node in one dialog: kind, name, where it sits, the head while it is on the
 * administrator's mind, and the date it takes effect — the "no head" warning would otherwise
 * appear the moment the node exists.
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
    kind: preset.kind ?? OrgUnitKind.SHOP,
    siteId: preset.siteId ?? choices.sites[0]?.id ?? '',
    parentId: preset.parentId ?? '',
    name: '',
    headEmployeeId: '',
    validFrom: choices.today,
  });
  const incomplete = isIncomplete(draft);
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
