import { useState, type FormEvent } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { AddDialog } from '@/components/app/add-dialog';
import { DateField } from '@/components/app/date-picker';
import { DetailSheet } from '@/components/app/detail-sheet';
import { FormField } from '@/components/app/fields';
import { Muted } from '@/components/app/page';
import { formatDate } from '@/lib/format';
import { TermMode, Unit, type Assignment, type Level, type ResolvedComponent } from './model';
import { fill, money, text } from './text';

const UNITS: readonly Unit[] = [Unit.PER_MONTH, Unit.PER_HOUR, Unit.PER_POINT, Unit.COEFFICIENT];
const MIN_REASON = 3;

export interface TermDraft {
  readonly key: ResolvedComponent['key'];
  readonly mode: TermMode;
  readonly value: string;
  readonly unit: Unit;
  readonly validFrom: string;
  readonly validTo: string;
  readonly afterEnd: 'GROUP' | 'KEEP';
  readonly reason: string;
}

type Patch<T> = (patch: Partial<T>) => void;

function isReason(value: string) {
  return value.trim().length >= MIN_REASON;
}

function isNumber(value: string) {
  return value !== '' && !Number.isNaN(Number(value));
}

function PreviewLine({
  was,
  becomes,
  currency,
}: {
  readonly was: number;
  readonly becomes: number;
  readonly currency: string;
}) {
  const diff = becomes - was;
  return (
    <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs tabular-nums">
      {text.preview.was} {money(was, currency)} → {text.preview.becomes}{' '}
      <b>{money(becomes, currency)}</b> · {text.preview.diff} {diff >= 0 ? '+' : ''}
      {money(diff, currency)}
    </p>
  );
}

function ValueFields({
  draft,
  onChange,
}: {
  readonly draft: TermDraft;
  readonly onChange: Patch<TermDraft>;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
      <FormField label={text.editor.value}>
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            value={draft.value}
            onChange={(event) => onChange({ value: event.target.value })}
            autoFocus
          />
        )}
      </FormField>
      <FormField label={text.editor.unit}>
        {(id) => (
          <NativeSelect
            id={id}
            value={draft.unit}
            onChange={(event) => onChange({ unit: event.target.value as Unit })}
          >
            {UNITS.map((unit) => (
              <NativeSelectOption key={unit} value={unit}>
                {text.components.units[unit]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
    </div>
  );
}

function PeriodFields({
  draft,
  onChange,
}: {
  readonly draft: TermDraft;
  readonly onChange: Patch<TermDraft>;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <DateField
          label={text.editor.validFrom}
          value={draft.validFrom}
          onChange={(validFrom) => onChange({ validFrom })}
        />
        <DateField
          label={text.editor.validTo}
          hint={text.editor.validToHint}
          value={draft.validTo}
          onChange={(validTo) => onChange({ validTo })}
        />
      </div>
      {draft.validTo && (
        <FormField label={text.editor.afterEnd}>
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.afterEnd}
              onChange={(event) =>
                onChange({ afterEnd: event.target.value === 'KEEP' ? 'KEEP' : 'GROUP' })
              }
            >
              <NativeSelectOption value="GROUP">{text.editor.afterEndGroup}</NativeSelectOption>
              <NativeSelectOption value="KEEP">{text.editor.afterEndKeep}</NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
      )}
    </>
  );
}

function EditorFooter({
  valid,
  onClose,
  onSubmit,
}: {
  readonly valid: boolean;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <Muted className="mr-auto text-xs">{text.editor.approvalHint}</Muted>
      <Button type="button" variant="outline" size="sm" onClick={onClose}>
        {text.editor.cancel}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={!valid} onClick={onSubmit}>
        {text.editor.draft}
      </Button>
      <Button type="button" size="sm" disabled={!valid} onClick={onSubmit}>
        <CheckIcon aria-hidden="true" />
        {text.editor.submit}
      </Button>
    </div>
  );
}

function becomesAfter(draft: TermDraft, row: ResolvedComponent, monthBase: number) {
  const numeric = Number(draft.value);
  if (!isNumber(draft.value)) return monthBase;
  if (draft.mode === TermMode.REPLACE) return monthBase - (row.applied ?? 0) + numeric;
  return monthBase + numeric;
}

/**
 * Personal replace or added supplement: value, unit, dates, what applies after a temporary
 * condition ends, and the reason that goes into history and approval (GRP-08, LVL-07).
 */
export function TermEditor({
  row,
  mode,
  currency,
  monthBase,
  today,
  onClose,
  onSubmit,
}: {
  readonly row: ResolvedComponent;
  readonly mode: typeof TermMode.REPLACE | typeof TermMode.ADD;
  readonly currency: string;
  readonly monthBase: number;
  readonly today: string;
  readonly onClose: () => void;
  readonly onSubmit: (draft: TermDraft) => void;
}) {
  const [draft, setDraft] = useState<TermDraft>({
    key: row.key,
    mode,
    value: mode === TermMode.REPLACE ? String(row.applied ?? row.groupValue ?? '') : '',
    unit: row.unit,
    validFrom: today,
    validTo: '',
    afterEnd: 'GROUP',
    reason: '',
  });
  const patch: Patch<TermDraft> = (next) => setDraft({ ...draft, ...next });
  const valid = isNumber(draft.value) && isReason(draft.reason);
  const title = mode === TermMode.REPLACE ? text.editor.replaceTitle : text.editor.addTitle;
  return (
    <DetailSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={text.components.keys[row.key]}
      footer={<EditorFooter valid={valid} onClose={onClose} onSubmit={() => onSubmit(draft)} />}
    >
      <ValueFields draft={draft} onChange={patch} />
      <PeriodFields draft={draft} onChange={patch} />
      <FormField label={text.editor.reason} hint={text.editor.reasonHint}>
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            value={draft.reason}
            onChange={(event) => patch({ reason: event.target.value })}
          />
        )}
      </FormField>
      <PreviewLine
        was={monthBase}
        becomes={becomesAfter(draft, row, monthBase)}
        currency={currency}
      />
    </DetailSheet>
  );
}

export interface AdjustmentDraft {
  readonly kind: string;
  readonly amount: string;
  readonly sourcePeriod: string;
  readonly period: string;
  readonly reason: string;
}

function AdjustmentFields({
  draft,
  currency,
  onChange,
}: {
  readonly draft: AdjustmentDraft;
  readonly currency: string;
  readonly onChange: Patch<AdjustmentDraft>;
}) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
        <FormField label={text.adjustments.kind}>
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.kind}
              onChange={(event) => onChange({ kind: event.target.value })}
            >
              {Object.entries(text.adjustments.kinds).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label={`${text.adjustments.amount}, ${currency}`}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={draft.amount}
              onChange={(event) => onChange({ amount: event.target.value })}
              autoFocus
            />
          )}
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label={text.adjustments.sourcePeriod}>
          {(id) => (
            <Input
              id={id}
              type="month"
              value={draft.sourcePeriod}
              onChange={(event) => onChange({ sourcePeriod: event.target.value })}
            />
          )}
        </FormField>
        <FormField label={text.adjustments.period}>
          {(id) => (
            <Input
              id={id}
              type="month"
              value={draft.period}
              onChange={(event) => onChange({ period: event.target.value })}
            />
          )}
        </FormField>
      </div>
      <AdjustmentBasis draft={draft} onChange={onChange} />
    </>
  );
}

function AdjustmentBasis({
  draft,
  onChange,
}: {
  readonly draft: AdjustmentDraft;
  readonly onChange: Patch<AdjustmentDraft>;
}) {
  return (
    <>
      <FormField label={text.adjustments.reason}>
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            value={draft.reason}
            onChange={(event) => onChange({ reason: event.target.value })}
          />
        )}
      </FormField>
      <FormField
        label={text.adjustments.attachment}
        hint={text.adjustments.attachmentHint}
        optional
      >
        {(id) => <Input id={id} type="file" />}
      </FormField>
    </>
  );
}

/** One-time correction (GRP-09): a reason and a period, never a change to any component. */
export function AdjustmentDialog({
  monthKey,
  currency,
  onClose,
  onSubmit,
}: {
  readonly monthKey: string;
  readonly currency: string;
  readonly onClose: () => void;
  readonly onSubmit: (draft: AdjustmentDraft) => void;
}) {
  const [draft, setDraft] = useState<AdjustmentDraft>({
    kind: 'BONUS',
    amount: '',
    sourcePeriod: monthKey,
    period: monthKey,
    reason: '',
  });
  const valid = isNumber(draft.amount) && isReason(draft.reason);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onSubmit(draft);
  };
  return (
    <AddDialog
      title={text.adjustments.add}
      open
      onOpenChange={(open) => !open && onClose()}
      hideTrigger
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <AdjustmentFields
          draft={draft}
          currency={currency}
          onChange={(next) => setDraft({ ...draft, ...next })}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {text.editor.cancel}
          </Button>
          <Button type="submit" disabled={!valid}>
            {text.adjustments.save}
          </Button>
        </DialogFooter>
      </form>
    </AddDialog>
  );
}

function LevelPreview({
  before,
  after,
  validFrom,
  plannedHours,
  currency,
}: {
  readonly before: number;
  readonly after: number;
  readonly validFrom: string;
  readonly plannedHours: number;
  readonly currency: string;
}) {
  return (
    <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs tabular-nums">
      {text.level.segments}: {text.level.before} {formatDate(validFrom)} — {money(before, currency)}
      ; {text.level.after} — <b>{money(after, currency)}</b> (
      {fill(text.preview.hours, { n: plannedHours })})
    </p>
  );
}

interface LevelDraft {
  readonly levelId: string;
  readonly validFrom: string;
  readonly reason: string;
}

interface LevelFormProps {
  readonly assignment: Assignment;
  readonly draft: LevelDraft;
  readonly next: Level | null;
  readonly plannedHours: number;
  readonly currency: string;
  readonly onChange: Patch<LevelDraft>;
}

function LevelForm({ assignment, draft, next, plannedHours, currency, onChange }: LevelFormProps) {
  return (
    <>
      <FormField label={text.level.pick}>
        {(id) => (
          <NativeSelect
            id={id}
            value={draft.levelId}
            onChange={(event) => onChange({ levelId: event.target.value })}
          >
            {assignment.levelScale.map((level) => (
              <NativeSelectOption key={level.id} value={level.id}>
                {level.name} · {money(level.supplementPerHour, currency)}{' '}
                {text.components.units.PER_HOUR}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <DateField
        label={text.level.date}
        value={draft.validFrom}
        onChange={(validFrom) => onChange({ validFrom })}
      />
      <FormField label={text.level.reason}>
        {(id) => (
          <Input
            id={id}
            value={draft.reason}
            onChange={(event) => onChange({ reason: event.target.value })}
          />
        )}
      </FormField>
      <LevelPreview
        before={(assignment.level?.supplementPerHour ?? 0) * plannedHours}
        after={(next?.supplementPerHour ?? 0) * plannedHours}
        validFrom={draft.validFrom}
        plannedHours={plannedHours}
        currency={currency}
      />
      <Muted className="text-xs">{text.level.keepPersonal}</Muted>
    </>
  );
}

/** Level change (PROC-05): a level from the position's scale, a date, a reason, a segmented preview. */
export function LevelChangePopover({
  assignment,
  plannedHours,
  currency,
  today,
  defaultOpen = false,
  onSubmit,
}: {
  readonly assignment: Assignment;
  readonly plannedHours: number;
  readonly currency: string;
  readonly today: string;
  readonly defaultOpen?: boolean;
  readonly onSubmit: (level: Level, validFrom: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<LevelDraft>({
    levelId: assignment.level?.id ?? '',
    validFrom: today,
    reason: '',
  });
  const next = assignment.levelScale.find((level) => level.id === draft.levelId) ?? null;
  const changed = next !== null && next.id !== assignment.level?.id;
  const submit = () => {
    if (next) onSubmit(next, draft.validFrom, draft.reason);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="xs" variant="outline">
          {text.assignment.changeLevel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" aria-label={text.level.title}>
        <p className="border-b px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
          {text.level.title}
        </p>
        <div className="flex flex-col gap-2 p-2.5">
          <LevelForm
            assignment={assignment}
            draft={draft}
            next={next}
            plannedHours={plannedHours}
            currency={currency}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
          />
          <Button
            type="button"
            size="sm"
            disabled={!changed || !isReason(draft.reason)}
            onClick={submit}
          >
            <CheckIcon aria-hidden="true" />
            {text.level.submit}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
