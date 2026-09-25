import { PlusIcon, SaveIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EQUIPMENT_CRITICALITIES } from '@vakhta/domain';
import type {
  EquipmentDetail,
  EquipmentInput,
  EquipmentUpdate,
  MechanicOption,
} from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import {
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { DateField } from '@/components/app/date-picker';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField, type Option } from '@/components/app/fields';
import { DialogActions } from '@/components/app/dialog-actions';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { describeError } from '@/errors';
import { useOrg } from '@/lib/org';
import { notifySuccess } from '@/lib/toast';
import { currentLocale } from '@/shared/config';
import {
  EMPTY_EQUIPMENT,
  draftFromDetail,
  sameDraft,
  toCreate,
  toUpdate,
  type EquipmentDraft,
  type EquipmentField,
  type Validated,
} from '../model/equipment-draft';

export type EquipmentFormTarget =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly detail: EquipmentDetail };

type SaveCommand =
  | { readonly kind: 'create'; readonly input: EquipmentInput }
  | { readonly kind: 'edit'; readonly id: string; readonly input: EquipmentUpdate };

function commandOf(target: EquipmentFormTarget, draft: EquipmentDraft): Validated<SaveCommand> {
  if (target.kind === 'create') {
    const checked = toCreate(draft);
    return checked.ok ? { ok: true, value: { kind: 'create', input: checked.value } } : checked;
  }
  const checked = toUpdate(draft, target.detail.version);
  if (!checked.ok) return checked;
  return { ok: true, value: { kind: 'edit', id: target.detail.id, input: checked.value } };
}

function mechanicLabel(option: MechanicOption, notLinked: string): string {
  const telegram = option.telegramLinked ? '' : ` (${notLinked})`;
  return `${option.fullName} · ${option.positionName}${telegram}`;
}

/** How a group of fields reads and changes the draft. */
interface FieldsProps {
  readonly draft: EquipmentDraft;
  readonly set: <K extends EquipmentField>(field: K, value: EquipmentDraft[K]) => void;
  readonly error: (field: EquipmentField) => string | null;
}

function TextInput({
  label,
  field,
  props,
  hint,
}: {
  readonly label: string;
  readonly field: 'code' | 'name' | 'equipmentType' | 'manufacturer' | 'model' | 'serialNumber';
  readonly props: FieldsProps;
  readonly hint?: string;
}) {
  return (
    <FormField label={label} error={props.error(field)} {...(hint ? { hint } : {})}>
      {(id) => (
        <Input
          id={id}
          value={props.draft[field]}
          onChange={(event) => props.set(field, event.target.value)}
        />
      )}
    </FormField>
  );
}

function Grid({ children }: { readonly children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}

function PlaceFields({ props }: { readonly props: FieldsProps }) {
  const t = maintenanceMessages();
  const { orgOrEmpty } = useOrg();
  const zones = orgOrEmpty.zones.filter((zone) => zone.orgUnitId === props.draft.orgUnitId);
  return (
    <>
      <SelectField
        label={t.form.unit}
        value={props.draft.orgUnitId}
        onChange={(value) => {
          props.set('orgUnitId', value);
          props.set('zoneId', '');
        }}
        options={orgOrEmpty.orgUnits.map((unit) => ({ value: unit.id, label: unit.name }))}
        placeholder={t.form.choose}
        error={props.error('orgUnitId')}
        required
      />
      <SelectField
        label={t.form.zone}
        value={props.draft.zoneId}
        onChange={(value) => props.set('zoneId', value)}
        options={[
          { value: '', label: t.form.noZone },
          ...zones.map((zone) => ({ value: zone.id, label: zone.name })),
        ]}
      />
    </>
  );
}

function PassportFields({ props }: { readonly props: FieldsProps }) {
  const t = maintenanceMessages();
  const { draft, set } = props;
  return (
    <Grid>
      <TextInput label={t.form.code} hint={t.form.codeHint} field="code" props={props} />
      <TextInput label={t.form.name} field="name" props={props} />
      <PlaceFields props={props} />
      <TextInput label={t.form.type} field="equipmentType" props={props} />
      <SelectField
        label={t.form.criticality}
        value={draft.criticality}
        onChange={(value) =>
          set(
            'criticality',
            EQUIPMENT_CRITICALITIES.find((item) => item === value) ?? draft.criticality,
          )
        }
        options={EQUIPMENT_CRITICALITIES.map((value) => ({ value, label: t.criticality[value] }))}
      />
      <TextInput label={t.form.manufacturer} field="manufacturer" props={props} />
      <TextInput label={t.form.model} field="model" props={props} />
      <TextInput label={t.form.serial} field="serialNumber" props={props} />
      <FormField label={t.form.year} error={props.error('manufacturedYear')}>
        {(id) => (
          <Input
            id={id}
            inputMode="numeric"
            value={draft.manufacturedYear}
            onChange={(event) =>
              set('manufacturedYear', event.target.value.replace(/\D/g, '').slice(0, 4))
            }
          />
        )}
      </FormField>
      <DateField
        label={t.form.commissioned}
        value={draft.commissionedOn}
        onChange={(value) => set('commissionedOn', value)}
      />
    </Grid>
  );
}

function MechanicFields({
  props,
  mechanicChanged,
}: {
  readonly props: FieldsProps;
  readonly mechanicChanged: boolean;
}) {
  const t = maintenanceMessages();
  const mechanics = useQuery(maintenanceQueries.mechanics());
  const options: Option[] = (mechanics.data ?? []).map((option) => ({
    value: option.id,
    label: mechanicLabel(option, t.form.notLinked),
  }));
  return (
    <>
      <Grid>
        <SelectField
          label={t.form.responsible}
          hint={t.form.mechanicHint}
          value={props.draft.responsibleEmployeeId}
          onChange={(value) => {
            props.set('responsibleEmployeeId', value);
            // FR-004: the backup is another mechanic, so it gives way to the new responsible one.
            if (value === props.draft.backupEmployeeId) props.set('backupEmployeeId', '');
          }}
          options={options}
          placeholder={t.form.choose}
          error={props.error('responsibleEmployeeId')}
          required
        />
        <SelectField
          label={t.form.backup}
          value={props.draft.backupEmployeeId}
          onChange={(value) => props.set('backupEmployeeId', value)}
          options={[
            { value: '', label: t.form.noBackup },
            ...options.filter((option) => option.value !== props.draft.responsibleEmployeeId),
          ]}
        />
      </Grid>
      {mechanicChanged ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id="equipment-reassign"
            checked={props.draft.reassignOpenWork}
            onCheckedChange={(checked) => props.set('reassignOpenWork', checked === true)}
          />
          <Label htmlFor="equipment-reassign">{t.form.reassign}</Label>
        </div>
      ) : null}
    </>
  );
}

function useSaveEquipment(target: EquipmentFormTarget, onSaved: (id: string) => void) {
  const t = maintenanceMessages();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: SaveCommand) =>
      command.kind === 'edit'
        ? maintenanceApi.updateEquipment(command.id, command.input)
        : maintenanceApi.createEquipment(command.input),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: maintenanceKeys.all });
      notifySuccess(target.kind === 'edit' ? t.form.saved : t.form.created);
      onSaved(result.id);
    },
  });
}

/** Create or edit a machine (FR-001 – FR-005); only maintenance employees can be responsible. */
export function EquipmentForm({
  target,
  onClose,
  onSaved,
}: {
  readonly target: EquipmentFormTarget;
  readonly onClose: () => void;
  readonly onSaved: (id: string) => void;
}) {
  const t = maintenanceMessages();
  const required = messages(currentLocale()).ui.common.required;
  const baseline = target.kind === 'edit' ? draftFromDetail(target.detail) : EMPTY_EQUIPMENT;
  const [draft, setDraft] = useState<EquipmentDraft>(baseline);
  const [invalid, setInvalid] = useState<ReadonlySet<EquipmentField>>(new Set());
  const save = useSaveEquipment(target, onSaved);
  const submit = () => {
    const command = commandOf(target, draft);
    setInvalid(command.ok ? new Set() : command.fields);
    if (command.ok) save.mutate(command.value);
  };
  const props: FieldsProps = {
    draft,
    set: (field, value) => setDraft((current) => ({ ...current, [field]: value })),
    error: (field) => (invalid.has(field) ? required : null),
  };
  const editing = target.kind === 'edit' ? target.detail : null;
  return (
    <DetailSheet
      open
      size="wide"
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={editing ? t.form.editTitle : t.form.createTitle}
      footer={
        <DialogActions
          cancel={{ label: t.form.cancel, tooltip: t.form.cancelHint, onSelect: onClose }}
          action={{
            label: editing ? t.form.save : t.form.create,
            tooltip: editing ? t.form.saveHint : t.equipment.addHint,
            icon: editing ? SaveIcon : PlusIcon,
            pending: save.isPending,
            disabled: editing !== null && sameDraft(draft, baseline),
            onClick: submit,
          }}
        />
      }
    >
      <Feedback error={save.error ? describeError(save.error) : null} />
      <PassportFields props={props} />
      <MechanicFields
        props={props}
        mechanicChanged={editing !== null && draft.responsibleEmployeeId !== editing.responsible.id}
      />
      <FormField label={t.form.notes} optional>
        {(id) => (
          <Textarea
            id={id}
            rows={3}
            value={draft.notes}
            onChange={(event) => props.set('notes', event.target.value)}
          />
        )}
      </FormField>
    </DetailSheet>
  );
}
