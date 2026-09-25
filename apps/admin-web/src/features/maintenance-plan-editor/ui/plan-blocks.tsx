import type { ReactNode } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  CameraIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import type { EquipmentDetail, MaintenancePolicyView, MechanicOption } from '@vakhta/contracts';
import {
  ANCHOR_MODES,
  INTERVAL_UNITS,
  MATERIAL_KINDS,
  MATERIAL_MODES,
  PLAN_SOURCE_KINDS,
  PlanSourceKind,
} from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import { formatBusinessDate, formatInterval, maintenanceMessages } from '@/entities/maintenance';
import { DateField } from '@/components/app/date-picker';
import { FormField, SelectField } from '@/components/app/fields';
import { IconButton } from '@/shared/ui/icon-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { currentLocale } from '@/shared/config';
import { cn } from 'cn';
import {
  effectiveReminderDays,
  move,
  newMaterial,
  removeRow,
  replaceRow,
  newOperation,
  schedulePreview,
  type MaterialDraft,
  type OperationDraft,
  type PlanDraft,
} from '../model/plan-draft';

export type Patch = (change: Partial<PlanDraft>) => void;

interface BlockProps {
  readonly draft: PlanDraft;
  readonly patch: Patch;
  readonly invalid: ReadonlySet<string>;
  readonly readOnly: boolean;
}

function pick<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return values.find((item) => item === value) ?? fallback;
}

export function FormBlock({
  number,
  title,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-medium">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs tabular-nums">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function SourceBlock({
  draft,
  patch,
  invalid,
  readOnly,
  machine,
}: BlockProps & { readonly machine: EquipmentDetail }) {
  const t = maintenanceMessages();
  const document = draft.sourceKind === PlanSourceKind.DOCUMENT;
  return (
    <FormBlock number={1} title={t.planForm.blockSource}>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          label={t.planForm.title}
          error={invalid.has('title') ? t.planForm.issues.TITLE_REQUIRED : null}
        >
          {(id) => (
            <Input
              id={id}
              value={draft.title}
              disabled={readOnly}
              onChange={(event) => patch({ title: event.target.value })}
            />
          )}
        </FormField>
        <SelectField
          label={t.planForm.source}
          value={draft.sourceKind}
          disabled={readOnly}
          onChange={(value) =>
            patch({ sourceKind: pick(PLAN_SOURCE_KINDS, value, draft.sourceKind) })
          }
          options={PLAN_SOURCE_KINDS.map((value) => ({ value, label: t.sourceKind[value] }))}
        />
        {document ? (
          <>
            <SelectField
              label={t.planForm.document}
              value={draft.sourceDocumentId}
              disabled={readOnly}
              placeholder={t.planForm.noDocument}
              onChange={(value) => patch({ sourceDocumentId: value })}
              options={machine.documents.map((doc) => ({ value: doc.id, label: doc.title }))}
            />
            <FormField label={t.planForm.reference} optional>
              {(id) => (
                <Input
                  id={id}
                  value={draft.sourceReference}
                  disabled={readOnly}
                  onChange={(event) => patch({ sourceReference: event.target.value })}
                />
              )}
            </FormField>
          </>
        ) : null}
        <FormField label={t.planForm.note} className="md:col-span-2" optional={document}>
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={draft.sourceNote}
              disabled={readOnly}
              placeholder={t.planForm.notePlaceholder}
              onChange={(event) => patch({ sourceNote: event.target.value })}
            />
          )}
        </FormField>
      </div>
    </FormBlock>
  );
}

export function IntervalBlock({ draft, patch, invalid, readOnly }: BlockProps) {
  const t = maintenanceMessages();
  return (
    <FormBlock number={2} title={t.planForm.blockInterval}>
      <div className="grid gap-3 md:grid-cols-4">
        <FormField
          label={t.planForm.every}
          error={invalid.has('intervalCount') ? t.errors.PLAN_INVALID : null}
        >
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              value={draft.intervalCount}
              disabled={readOnly}
              onChange={(event) => patch({ intervalCount: event.target.value.replace(/\D/g, '') })}
            />
          )}
        </FormField>
        <SelectField
          label={t.planForm.unit}
          value={draft.intervalUnit}
          disabled={readOnly}
          onChange={(value) =>
            patch({ intervalUnit: pick(INTERVAL_UNITS, value, draft.intervalUnit) })
          }
          options={INTERVAL_UNITS.map((value) => ({ value, label: t.intervalUnit[value] }))}
        />
        <SelectField
          label={t.planForm.anchor}
          hint={t.planForm.anchorHint}
          value={draft.anchorMode}
          disabled={readOnly}
          onChange={(value) => patch({ anchorMode: pick(ANCHOR_MODES, value, draft.anchorMode) })}
          options={ANCHOR_MODES.map((value) => ({ value, label: t.anchorMode[value] }))}
        />
        <DateField
          label={t.planForm.firstDue}
          value={draft.firstDueOn}
          disabled={readOnly}
          onChange={(value) => patch({ firstDueOn: value })}
          {...(invalid.has('firstDueOn') ? { error: t.planForm.issues.FIRST_DUE_REQUIRED } : {})}
        />
        <FormField label={t.planForm.duration}>
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              value={draft.estimatedMinutes}
              disabled={readOnly}
              onChange={(event) =>
                patch({ estimatedMinutes: event.target.value.replace(/\D/g, '') })
              }
            />
          )}
        </FormField>
        <div className="flex items-end gap-2 pb-2 md:col-span-3">
          <Checkbox
            id="plan-stop"
            checked={draft.requiresStop}
            disabled={readOnly}
            onCheckedChange={(checked) => patch({ requiresStop: checked === true })}
          />
          <Label htmlFor="plan-stop">{t.planForm.stop}</Label>
        </div>
      </div>
    </FormBlock>
  );
}

/** Photo required for the operation: a pressed pill, as the prototype marks it (📷 фото). */
function PhotoToggle({
  pressed,
  disabled,
  onChange,
  label,
}: {
  readonly pressed: boolean;
  readonly disabled: boolean;
  readonly onChange: (pressed: boolean) => void;
  readonly label: string;
}) {
  const t = maintenanceMessages();
  return (
    <Toggle
      variant="outline"
      size="sm"
      aria-label={label}
      pressed={pressed}
      disabled={disabled}
      onPressedChange={onChange}
      className="shrink-0 rounded-full text-muted-foreground data-[state=on]:border-foreground/30 data-[state=on]:text-foreground"
    >
      <CameraIcon aria-hidden="true" />
      {t.planForm.photo}
    </Toggle>
  );
}

/** Text fields that read like the row's text until focused; the row border frames them. */
const QUIET_INPUT =
  'h-8 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent';

function RowOrderButtons({
  index,
  count,
  onMove,
  onRemove,
}: {
  readonly index: number;
  readonly count: number;
  readonly onMove: (step: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  const t = maintenanceMessages().planForm;
  return (
    <span className="flex shrink-0 gap-0.5">
      <IconButton
        icon={ArrowUpIcon}
        label={t.moveUp}
        tooltip={t.moveUp}
        variant="ghost"
        size="icon-sm"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      />
      <IconButton
        icon={ArrowDownIcon}
        label={t.moveDown}
        tooltip={t.moveDown}
        variant="ghost"
        size="icon-sm"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      />
      <IconButton
        icon={Trash2Icon}
        label={t.remove}
        tooltip={t.remove}
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
      />
    </span>
  );
}

function OperationRow({
  row,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  readOnly,
}: {
  readonly row: OperationDraft;
  readonly index: number;
  readonly count: number;
  readonly onChange: (row: OperationDraft) => void;
  readonly onMove: (step: -1 | 1) => void;
  readonly onRemove: () => void;
  readonly readOnly: boolean;
}) {
  const t = maintenanceMessages();
  const n = index + 1;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border p-1.5 md:flex-nowrap">
      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {n}
      </span>
      <Input
        aria-label={`${t.planForm.operationText} ${n}`}
        className={cn(QUIET_INPUT, 'min-w-0 flex-1 basis-[calc(100%-2rem)] md:basis-auto')}
        value={row.text}
        disabled={readOnly}
        onChange={(event) => onChange({ ...row, text: event.target.value })}
      />
      <Input
        aria-label={`${t.planForm.operationPlace} ${n}`}
        placeholder={t.planForm.operationPlace}
        className={cn(
          QUIET_INPUT,
          'ml-7 min-w-0 flex-1 text-muted-foreground md:ml-0 md:w-32 md:flex-none',
        )}
        value={row.place}
        disabled={readOnly}
        onChange={(event) => onChange({ ...row, place: event.target.value })}
      />
      <PhotoToggle
        pressed={row.photoRequired}
        disabled={readOnly}
        label={`${t.planForm.photo} ${n}`}
        onChange={(photoRequired) => onChange({ ...row, photoRequired })}
      />
      {readOnly ? null : (
        <RowOrderButtons index={index} count={count} onMove={onMove} onRemove={onRemove} />
      )}
    </li>
  );
}

export function OperationsBlock({ draft, patch, invalid, readOnly }: BlockProps) {
  const t = maintenanceMessages();
  const rows = draft.operations;
  return (
    <FormBlock number={3} title={t.planForm.blockOperations}>
      {invalid.has('operations') ? (
        <p role="alert" className="text-xs text-destructive">
          {t.planForm.issues.OPERATIONS_REQUIRED}
        </p>
      ) : null}
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <OperationRow
            key={row.key}
            row={row}
            index={index}
            count={rows.length}
            readOnly={readOnly}
            onChange={(next) => patch({ operations: replaceRow(rows, next) })}
            onMove={(step) => patch({ operations: move(rows, index, step) })}
            onRemove={() => patch({ operations: removeRow(rows, row.key) })}
          />
        ))}
      </ol>
      {readOnly ? null : (
        <IconButton
          icon={PlusIcon}
          label={t.planForm.addOperation}
          tooltip={t.planForm.addOperationHint}
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => patch({ operations: [...rows, newOperation()] })}
        />
      )}
    </FormBlock>
  );
}

/** Columns of the materials table (prototype block 4); one header row, then a row per item. */
/** A labelled cell of a material card; the label stays visible so a long list still reads. */
function MaterialCell({
  label,
  className,
  children,
}: {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** A compact native select over one set of codes, labelled from the catalog. */
function CodeSelect<T extends string>({
  value,
  values,
  labels,
  disabled,
  onChange,
}: {
  readonly value: T;
  readonly values: readonly T[];
  readonly labels: Readonly<Record<T, string>>;
  readonly disabled: boolean;
  readonly onChange: (value: T) => void;
}) {
  return (
    <NativeSelect
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(pick(values, event.target.value, value))}
    >
      {values.map((code) => (
        <NativeSelectOption key={code} value={code}>
          {labels[code]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Kind, article, quantity, unit and need of one item, under its name. */
function MaterialDetails({
  row,
  onChange,
  readOnly,
}: {
  readonly row: MaterialDraft;
  readonly onChange: (row: MaterialDraft) => void;
  readonly readOnly: boolean;
}) {
  const t = maintenanceMessages();
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-[8rem_minmax(0,1fr)_5.5rem_7rem_10rem]">
      <MaterialCell label={t.planForm.materialKind}>
        <CodeSelect
          value={row.kind}
          values={MATERIAL_KINDS}
          labels={t.materialKind}
          disabled={readOnly}
          onChange={(kind) => onChange({ ...row, kind })}
        />
      </MaterialCell>
      <MaterialCell label={t.planForm.article}>
        <Input
          value={row.article}
          disabled={readOnly}
          onChange={(event) => onChange({ ...row, article: event.target.value })}
        />
      </MaterialCell>
      <MaterialCell label={t.planForm.quantity}>
        <Input
          inputMode="decimal"
          value={row.quantity}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...row, quantity: event.target.value.replace(/[^\d.,]/g, '') })
          }
        />
      </MaterialCell>
      <MaterialCell label={t.planForm.unitOfMeasure}>
        <Input
          value={row.unit}
          disabled={readOnly}
          onChange={(event) => onChange({ ...row, unit: event.target.value })}
        />
      </MaterialCell>
      <MaterialCell label={t.planForm.mode} className="col-span-2 md:col-span-1">
        <CodeSelect
          value={row.mode}
          values={MATERIAL_MODES}
          labels={t.materialMode}
          disabled={readOnly}
          onChange={(mode) => onChange({ ...row, mode })}
        />
      </MaterialCell>
    </div>
  );
}

/**
 * One item to have on hand, as a card: the name gets the whole width and wraps, the numbers and
 * codes sit under it, so long names and many rows stay readable (owner request 2026-09-25).
 */
function MaterialRow({
  row,
  onChange,
  onRemove,
  readOnly,
}: {
  readonly row: MaterialDraft;
  readonly onChange: (row: MaterialDraft) => void;
  readonly onRemove: () => void;
  readonly readOnly: boolean;
}) {
  const t = maintenanceMessages();
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <MaterialCell label={t.planForm.materialName} className="flex-1">
          <Textarea
            rows={1}
            className="min-h-9 resize-y max-md:min-h-11"
            value={row.name}
            disabled={readOnly}
            onChange={(event) => onChange({ ...row, name: event.target.value })}
          />
        </MaterialCell>
        {readOnly ? null : (
          <IconButton
            icon={Trash2Icon}
            label={t.planForm.remove}
            tooltip={t.planForm.remove}
            variant="ghost"
            size="icon-sm"
            className="mt-5 shrink-0"
            onClick={onRemove}
          />
        )}
      </div>
      <MaterialDetails row={row} readOnly={readOnly} onChange={onChange} />
    </li>
  );
}

export function MaterialsBlock({ draft, patch, readOnly }: BlockProps) {
  const t = maintenanceMessages();
  const rows = draft.materials;
  return (
    <FormBlock number={4} title={t.planForm.blockMaterials}>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <MaterialRow
            key={row.key}
            row={row}
            readOnly={readOnly}
            onChange={(next) => patch({ materials: replaceRow(rows, next) })}
            onRemove={() => patch({ materials: removeRow(rows, row.key) })}
          />
        ))}
      </ul>
      {readOnly ? null : (
        <IconButton
          icon={PlusIcon}
          label={t.planForm.addMaterial}
          tooltip={t.planForm.addMaterialHint}
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => patch({ materials: [...rows, newMaterial()] })}
        />
      )}
    </FormBlock>
  );
}

/** "за 7, 3 і 1 день о 09:00" from a reminder rule; the last number picks the word form. */
function remindersText(policy: MaintenancePolicyView | undefined, own?: readonly number[]): string {
  const t = maintenanceMessages().planForm;
  if (!policy) return '—';
  const offsets = [...(own ?? policy.reminderOffsets)].sort((a, b) => b - a);
  const last = offsets.at(-1);
  if (last === undefined) return t.remindersOff;
  const locale = currentLocale();
  const days = new Intl.ListFormat(locale, { type: 'conjunction' }).format(offsets.map(String));
  const form = new Intl.PluralRules(locale).select(last);
  const forms: Readonly<Record<string, string>> = t.remindersPolicy;
  return format(forms[form] ?? t.remindersPolicy.other, { days, time: policy.reminderTime });
}

export function AssigneeBlock({
  draft,
  patch,
  invalid,
  readOnly,
  mechanics,
  policy,
}: BlockProps & {
  readonly mechanics: readonly MechanicOption[];
  readonly policy: MaintenancePolicyView | undefined;
}) {
  const t = maintenanceMessages();
  return (
    <FormBlock number={5} title={t.planForm.blockAssignee}>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          label={t.planForm.assignee}
          value={draft.assigneeEmployeeId}
          disabled={readOnly}
          placeholder={t.form.choose}
          error={invalid.has('assigneeEmployeeId') ? t.planForm.issues.ASSIGNEE_REQUIRED : null}
          onChange={(value) => patch({ assigneeEmployeeId: value })}
          options={mechanics.map((option) => ({ value: option.id, label: option.fullName }))}
        />
        <FormField
          label={t.planForm.reminders}
          hint={format(t.planForm.reminderDaysHint, { policy: remindersText(policy) })}
          error={invalid.has('reminderDays') ? t.planForm.reminderDaysInvalid : null}
        >
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              placeholder={policy ? [...policy.reminderOffsets].join(', ') : ''}
              value={draft.reminderDays}
              readOnly={readOnly}
              onChange={(event) => patch({ reminderDays: event.target.value })}
            />
          )}
        </FormField>
      </div>
      {readOnly || !policy ? null : (
        <p className="text-sm text-muted-foreground">
          {remindersText(policy, effectiveReminderDays(draft, policy.reminderOffsets))}
        </p>
      )}
    </FormBlock>
  );
}

/** "How it will work": the first date, the tenant's reminder days and the rule after it (FR-021). */
export function SchedulePreviewAlert({
  draft,
  mechanics,
  policy,
}: {
  readonly draft: PlanDraft;
  readonly mechanics: readonly MechanicOption[];
  readonly policy: MaintenancePolicyView | undefined;
}) {
  const t = maintenanceMessages();
  const preview = policy ? schedulePreview(draft, policy.reminderOffsets) : null;
  const mechanic = mechanics.find((option) => option.id === draft.assigneeEmployeeId);
  const text =
    preview && mechanic && policy
      ? format(preview.reminders.length ? t.planForm.summary : t.planForm.summaryWithoutReminders, {
          date: formatBusinessDate(preview.firstDueOn),
          mechanic: mechanic.fullName,
          reminders: preview.reminders.map(formatBusinessDate).join(', '),
          time: policy.reminderTime,
          interval: formatInterval(preview.interval),
          anchor: t.anchorMode[draft.anchorMode],
        })
      : t.planForm.summaryIncomplete;
  return (
    <Alert>
      <CalendarDaysIcon />
      <AlertTitle>{t.planForm.howItWorks}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
