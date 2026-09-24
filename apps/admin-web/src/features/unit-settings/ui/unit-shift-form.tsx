import { useState, type ReactNode } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import {
  SHIFT_PERIODS,
  endsNextDay,
  templateMinutes,
  type TemplateHoursIssue,
} from '@vakhta/domain';
import { UNIT_SHIFT_NAME_MAX } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { calendarItemColors } from '@/shared/ui/resource-calendar';
import { formatDuration } from '@/lib/format';
import { PERIOD_TONE, PeriodBadge } from '@/entities/shift-template';
import { cn } from 'cn';
import {
  LENGTH_PRESETS,
  canSubmit,
  draftIssues,
  withHours,
  withLength,
  withPeriod,
  withStart,
  type ShiftDraft,
} from '../model/shift-draft';
import { TimeField } from './time-field';

const t = messages(currentLocale()).unitShifts;
const common = messages(currentLocale()).ui.common;

type DraftChange = (next: ShiftDraft) => void;

/**
 * Create or edit one unit shift: hours first, a length preset sets the end, the type follows the
 * hours until chosen, the name is optional. The preview is the card the Schedule will show.
 */
export function UnitShiftForm({
  initial,
  saved,
  usedCount,
  taken,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  readonly initial: ShiftDraft;
  /** The saved values when editing; null for a new shift. */
  readonly saved: ShiftDraft | null;
  readonly usedCount: number;
  readonly taken: ReadonlySet<string>;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly error: ReactNode;
  readonly onSubmit: (draft: ShiftDraft) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const issues = draftIssues(draft, taken);
  const ready = canSubmit(draft, saved, issues) && !pending;
  return (
    <form
      className="space-y-4 rounded-xl border bg-muted/30 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(draft);
      }}
    >
      <HoursFields draft={draft} onChange={setDraft} />
      <PeriodField draft={draft} issue={issues.hours} onChange={setDraft} />
      <FormField
        label={t.name}
        optional
        error={issues.nameTaken ? t.errors.SHIFT_TEMPLATE_NAME_TAKEN : null}
      >
        {(id) => (
          <Input
            id={id}
            value={draft.name}
            maxLength={UNIT_SHIFT_NAME_MAX}
            placeholder={t.namePlaceholder}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        )}
      </FormField>
      <ShiftPreview draft={draft} />
      {saved && usedCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {format(t.usedNotice, { count: usedCount })}
        </p>
      )}
      {error}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          {common.cancel}
        </Button>
        <Button type="submit" pending={pending} disabled={!ready}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function HoursFields({ draft, onChange }: { draft: ShiftDraft; onChange: DraftChange }) {
  const minutes = templateMinutes(draft);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t.start}>
          {(id) => (
            <TimeField
              id={id}
              value={draft.localStart}
              onChange={(value) => onChange(withStart(draft, value))}
            />
          )}
        </FormField>
        <FormField label={t.end}>
          {(id) => (
            <TimeField
              id={id}
              value={draft.localEnd}
              onChange={(value) => onChange(withHours(draft, draft.localStart, value))}
            />
          )}
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.length}>
        {LENGTH_PRESETS.map((hours) => (
          <Button
            key={hours}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={minutes === hours * 60}
            className="rounded-full tabular-nums aria-pressed:border-sky-500 aria-pressed:bg-sky-50 aria-pressed:text-sky-950 dark:aria-pressed:bg-sky-950 dark:aria-pressed:text-sky-100"
            onClick={() => onChange(withLength(draft, hours))}
          >
            {formatDuration(hours * 60)}
          </Button>
        ))}
        <span className="ml-1 text-sm text-muted-foreground">
          {formatDuration(minutes)}
          {endsNextDay(draft) && `, ${t.untilNextDay}`}
        </span>
      </div>
    </>
  );
}

function PeriodField({
  draft,
  issue,
  onChange,
}: {
  draft: ShiftDraft;
  issue: TemplateHoursIssue | null;
  onChange: DraftChange;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="flex items-center gap-1 text-sm font-medium">
        {t.period}
        <InfoTip text={t.periodHint} />
      </legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {SHIFT_PERIODS.map((period) => (
          <label
            key={period}
            className={cn(
              'flex cursor-pointer items-center justify-center rounded-md px-2 py-1.5 transition-colors hover:bg-background/70',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              'has-[:checked]:bg-background has-[:checked]:shadow-sm',
            )}
          >
            <input
              type="radio"
              name="unit-shift-period"
              value={period}
              checked={draft.period === period}
              onChange={() => onChange(withPeriod(draft, period))}
              className="sr-only"
            />
            <PeriodBadge period={period} className="border-transparent bg-transparent" />
          </label>
        ))}
      </div>
      {issue && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{t.hoursIssues[issue]}</AlertTitle>
        </Alert>
      )}
    </fieldset>
  );
}

/** The card as the Schedule will show it. */
function ShiftPreview({ draft }: { draft: ShiftDraft }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{t.preview}</p>
      <div
        className={cn(
          'w-44 rounded-md border px-2 py-1.5 text-xs leading-tight',
          calendarItemColors[PERIOD_TONE[draft.period]],
        )}
      >
        <div className="font-semibold tabular-nums">
          {draft.localStart}–{draft.localEnd}
        </div>
        <div className="truncate">
          {draft.name.trim() || t.periods[draft.period]} · {formatDuration(templateMinutes(draft))}
        </div>
      </div>
    </div>
  );
}
