import { useState } from 'react';
import { monthDates } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/app/fields';
import { Feedback } from '@/components/app/feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import type { Workspace } from '../model/use-workspace';
import { copyPeriod, type CopySkip } from '../model/batch';
import { addDays, adjacentMonth } from '../model/business-dates';
import { gridFromItems, gridToItems } from '../model/grid';
import { useAdjacentPlan } from '../model/use-adjacent';
import { planIssues, reasonText } from '../model/use-eligibility';
import { AssignmentChanges, employeeLabel } from './assignment-changes';

const t = messages(currentLocale()).scheduleWorkspace;

type Source = 'previousWeek' | 'previousMonth';

/**
 * Copy a period onto the loaded plan (SC-26): the previous week onto the visible week, or the
 * previous month onto this month. The preview lists exact changes, skipped references and rule
 * reasons; applying keeps the result local until the plan is saved or published.
 */
export function CopyPeriodDialog({
  workspace: w,
  weekDates,
  onClose,
}: {
  readonly workspace: Workspace;
  /** Dates of the visible week, all in the loaded month or not. */
  readonly weekDates: readonly string[];
  readonly onClose: () => void;
}) {
  const [source, setSource] = useState<Source>('previousWeek');
  const [mode, setMode] = useState<'fill' | 'replace'>('fill');
  const [review, setReview] = useState(false);
  const monthDays = monthDates(w.month);
  const target =
    source === 'previousWeek' ? weekDates.filter((date) => date.startsWith(w.month)) : monthDays;
  const sourceDates =
    source === 'previousWeek'
      ? weekDates
          .map((date) => addDays(date, -7))
          .filter((date, index) => target[index] !== undefined)
      : monthDates(adjacentMonth(w.month, -1)).slice(0, monthDays.length);
  const adjacent = useAdjacentPlan({ ...w, dates: sourceDates });
  const sourceGrid = gridFromItems([
    ...gridToItems(w.grid).filter((item) => sourceDates.includes(item.businessDate)),
    ...gridToItems(adjacent.grid),
  ]);
  const ready = !adjacent.loading && !adjacent.failed;
  const result = ready
    ? copyPeriod({
        grid: w.grid,
        source: sourceGrid,
        sourceDates,
        targetDates: target,
        mode,
        activeEmployees: new Set(
          w.employees.filter((employee) => employee.status === 'ACTIVE').map((item) => item.id),
        ),
        activeZones: new Set(w.zones.filter((zone) => zone.isActive).map((zone) => zone.id)),
        activeTemplates: new Set(
          w.templates.filter((template) => template.isActive).map((template) => template.id),
        ),
      })
    : null;
  const evaluation = result
    ? planIssues({
        grid: result.grid,
        month: w.month,
        orgUnitId: w.orgUnitId,
        templates: w.templates,
        timezone: w.timezone,
        staffing: w.staffing,
        context: w.context,
      })
    : null;
  const affected = new Set(result?.changes.map((change) => change.key) ?? []);
  const reasons = (evaluation?.reasons ?? []).filter((reason) =>
    affected.has(`${reason.employeeId}:${reason.businessDate}`),
  );
  const blocked = reasons.some((reason) => reason.severity === 'BLOCK');
  const labels = {
    unitName: (id: string) => w.units.find((unit) => unit.id === id)?.name ?? id,
    zoneName: (id: string) => w.zones.find((zone) => zone.id === id)?.name ?? id,
  };
  const skipLabel = (skip: CopySkip) =>
    ({
      INACTIVE_EMPLOYEE: t.skipInactiveEmployee,
      INACTIVE_ZONE: t.skipInactiveZone,
      INACTIVE_TEMPLATE: t.skipInactiveTemplate,
      OCCUPIED: t.skipOccupied,
    })[skip.reason];
  const canApply = !!result && result.changes.length > 0 && w.writable && !blocked;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t.copyPeriod}</DialogTitle>
          <DialogDescription>{t.copyHint}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {!review && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label={t.copySource}
                value={source}
                onChange={(value) => {
                  setSource(value === 'previousMonth' ? 'previousMonth' : 'previousWeek');
                  setReview(false);
                }}
                options={[
                  { value: 'previousWeek', label: `${t.previousWeek} → ${t.currentWeek}` },
                  { value: 'previousMonth', label: `${t.previousMonth} → ${t.currentMonth}` },
                ]}
              />
              <SelectField
                label={t.batchMode}
                value={mode}
                onChange={(value) => {
                  setMode(value === 'replace' ? 'replace' : 'fill');
                  setReview(false);
                }}
                options={[
                  { value: 'fill', label: t.fill },
                  { value: 'replace', label: t.replace },
                ]}
              />
              <p className="text-sm text-muted-foreground sm:col-span-2">
                {sourceDates[0]} – {sourceDates.at(-1)} → {target[0]} – {target.at(-1)}
              </p>
            </div>
          )}
          {adjacent.loading && <LoadingState label={t.loadingAdjacent} />}
          {adjacent.failed && <Feedback error={t.adjacentUnavailable} />}
          {review && result && (
            <>
              <AssignmentChanges changes={result.changes} labels={w} />
              {result.skipped.length > 0 && (
                <section className="space-y-1 text-sm" aria-label={t.skipped}>
                  <h4 className="font-semibold">
                    {t.skipped}: {result.skipped.length}
                  </h4>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
                    {result.skipped.slice(0, 50).map((skip, index) => (
                      <li key={index}>
                        {employeeLabel(w, skip.employeeId)} · {skip.targetDate} · {skipLabel(skip)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {blocked && <Feedback error={t.eligibilityError} />}
              {reasons.length > 0 && (
                <ul className="space-y-1 text-sm" aria-label={t.conflict}>
                  {reasons.slice(0, 20).map((reason, index) => (
                    <li
                      key={index}
                      className={
                        reason.severity === 'BLOCK'
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-amber-700 dark:text-amber-300'
                      }
                    >
                      {employeeLabel(w, reason.employeeId)} · {reason.businessDate} ·{' '}
                      {reasonText(reason, labels)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {ready && result && result.changes.length === 0 && (
            <p className="text-sm text-muted-foreground">{t.unchanged}</p>
          )}
          {review && result && (
            <p className="text-sm text-muted-foreground">
              {format(t.shiftsCount, { count: result.changes.length })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => (review ? setReview(false) : onClose())}>
            {review ? t.editSelection : t.cancel}
          </Button>
          {review ? (
            <Button
              disabled={!canApply}
              onClick={() => {
                if (!canApply || !result) return;
                w.edit(result.grid);
                onClose();
              }}
            >
              {t.apply}
            </Button>
          ) : (
            <Button
              disabled={!result || result.changes.length === 0 || !w.writable}
              onClick={() => setReview(true)}
            >
              {t.preview}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
