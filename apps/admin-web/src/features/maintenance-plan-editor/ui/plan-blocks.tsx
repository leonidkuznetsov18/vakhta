import type { ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CalendarDaysIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { formatBusinessDate, maintenanceMessages } from '@/entities/maintenance';
import { DateField } from '@/components/app/date-picker';
import { FormField, SelectField } from '@/components/app/fields';
import { IconButton } from '@/shared/ui/icon-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
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
  return (
    <li className="flex flex-col gap-2 rounded-md border p-2 md:flex-row md:items-center">
      <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
      <Input
        aria-label={`${t.planForm.operationText} ${index + 1}`}
        className="flex-1"
        value={row.text}
        disabled={readOnly}
        onChange={(event) => onChange({ ...row, text: event.target.value })}
      />
      <Input
        aria-label={`${t.planForm.operationPlace} ${index + 1}`}
        placeholder={t.planForm.operationPlace}
        className="md:w-40"
        value={row.place}
        disabled={readOnly}
        onChange={(event) => onChange({ ...row, place: event.target.value })}
      />
      <span className="flex items-center gap-1.5">
        <Checkbox
          id={`photo-${row.key}`}
          checked={row.photoRequired}
          disabled={readOnly}
          onCheckedChange={(checked) => onChange({ ...row, photoRequired: checked === true })}
        />
        <Label htmlFor={`photo-${row.key}`}>{t.planForm.photo}</Label>
      </span>
      {readOnly ? null : (
        <span className="flex gap-1">
          <IconButton
            icon={ArrowUpIcon}
            label={t.planForm.moveUp}
            tooltip={t.planForm.moveUp}
            variant="ghost"
            size="icon-sm"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <IconButton
            icon={ArrowDownIcon}
            label={t.planForm.moveDown}
            tooltip={t.planForm.moveDown}
            variant="ghost"
            size="icon-sm"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          />
          <IconButton
            icon={Trash2Icon}
            label={t.planForm.remove}
            tooltip={t.planForm.remove}
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
          />
        </span>
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
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => patch({ operations: [...rows, newOperation()] })}
        >
          <PlusIcon /> {t.planForm.addOperation}
        </Button>
      )}
    </FormBlock>
  );
}

function MaterialAmount({
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
    <>
      <FormField label={t.planForm.quantity}>
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            value={row.quantity}
            disabled={readOnly}
            onChange={(event) =>
              onChange({ ...row, quantity: event.target.value.replace(/[^\d.,]/g, '') })
            }
          />
        )}
      </FormField>
      <FormField label={t.planForm.unitOfMeasure}>
        {(id) => (
          <Input
            id={id}
            value={row.unit}
            disabled={readOnly}
            onChange={(event) => onChange({ ...row, unit: event.target.value })}
          />
        )}
      </FormField>
    </>
  );
}

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
    <li className="grid gap-2 rounded-md border p-2 md:grid-cols-[9rem_1fr_8rem_5rem_5rem_9rem_auto] md:items-end">
      <SelectField
        label={t.planForm.materialKind}
        value={row.kind}
        disabled={readOnly}
        onChange={(value) => onChange({ ...row, kind: pick(MATERIAL_KINDS, value, row.kind) })}
        options={MATERIAL_KINDS.map((value) => ({ value, label: t.materialKind[value] }))}
      />
      <FormField label={t.planForm.materialName}>
        {(id) => (
          <Input
            id={id}
            value={row.name}
            disabled={readOnly}
            onChange={(event) => onChange({ ...row, name: event.target.value })}
          />
        )}
      </FormField>
      <FormField label={t.planForm.article} optional>
        {(id) => (
          <Input
            id={id}
            value={row.article}
            disabled={readOnly}
            onChange={(event) => onChange({ ...row, article: event.target.value })}
          />
        )}
      </FormField>
      <MaterialAmount row={row} onChange={onChange} readOnly={readOnly} />
      <SelectField
        label={t.planForm.mode}
        value={row.mode}
        disabled={readOnly}
        onChange={(value) => onChange({ ...row, mode: pick(MATERIAL_MODES, value, row.mode) })}
        options={MATERIAL_MODES.map((value) => ({ value, label: t.materialMode[value] }))}
      />
      {readOnly ? null : (
        <IconButton
          icon={Trash2Icon}
          label={t.planForm.remove}
          tooltip={t.planForm.remove}
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
        />
      )}
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
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => patch({ materials: [...rows, newMaterial()] })}
        >
          <PlusIcon /> {t.planForm.addMaterial}
        </Button>
      )}
    </FormBlock>
  );
}

export function AssigneeBlock({
  draft,
  patch,
  invalid,
  readOnly,
  mechanics,
}: BlockProps & { readonly mechanics: readonly MechanicOption[] }) {
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
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t.planForm.reminders}</span>
          <span className="flex h-9 items-center text-sm">{t.planForm.remindersValue}</span>
        </div>
      </div>
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
          interval: format(t.intervalEvery[draft.intervalUnit], { count: draft.intervalCount }),
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
