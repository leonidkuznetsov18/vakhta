import { templateLabel } from '../lib/template-label';
import { monthDates } from '@vakhta/domain';
import { useState } from 'react';
import { AssignmentInput } from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import { qualifiedFor, requiredQualifications } from '@vakhta/domain';
import { planIssues, reasonText, reasonsFor, useCandidates } from '../model/use-eligibility';
import { setAssignment as placeAssignment } from '../model/grid';
import { LoadingState } from '@/shared/ui/loading-state';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { SelectField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { Button } from '@/components/ui/button';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import type { Workspace } from '../model/use-workspace';
import { assignmentKey, gridToItems, setAssignment, setCell } from '../model/grid';
import { zoneAllowed } from '../model/planning';
const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
export interface AssignmentContext {
  employeeId: string;
  businessDate: string;
  zoneId: string;
  templateId?: string;
  /** Explicit Move: the person may change as well as the date and zone (SC-31). */
  move?: boolean;
}
export function AssignmentEditor({
  workspace: w,
  context,
  onClose,
  onApplied = onClose,
}: {
  workspace: Workspace;
  context: AssignmentContext;
  onClose: () => void;
  /** Called instead of onClose after a local change was applied or the assignment removed. */
  onApplied?: () => void;
}) {
  const original = gridToItems(w.grid).find(
    (item) => item.employeeId === context.employeeId && item.businessDate === context.businessDate,
  );
  const [draft, setDraft] = useState({
    ...context,
    templateId: context.templateId ?? original?.templateId ?? '',
  });
  const candidate = AssignmentInput.safeParse({
    ...original,
    ...draft,
    kind: original?.kind ?? 'REGULAR',
  });
  const occupied = gridToItems(w.grid).some(
    (item) =>
      item.employeeId === draft.employeeId &&
      item.businessDate === draft.businessDate &&
      (!original || assignmentKey(item) !== assignmentKey(original)),
  );
  const active =
    w.employees.some(
      (employee) => employee.id === draft.employeeId && employee.status === 'ACTIVE',
    ) &&
    w.templates.some((template) => template.id === draft.templateId && template.isActive) &&
    w.zones.some((zone) => zone.id === draft.zoneId && zone.isActive) &&
    zoneAllowed(w.rights.zones, draft.zoneId);
  const rules = w.staffing?.requirements ?? [];
  const missingQualifications =
    draft.zoneId && draft.templateId && draft.businessDate && draft.employeeId
      ? qualifiedFor(rules, w.staffing?.holdings ?? [], {
          employeeId: draft.employeeId,
          businessDate: draft.businessDate,
          templateId: draft.templateId,
          zoneId: draft.zoneId,
        })
        ? []
        : requiredQualifications(rules, draft.zoneId, draft.templateId, draft.businessDate).map(
            (id) => w.staffing?.qualifications.find((item) => item.id === id)?.name ?? id,
          )
      : [];
  // The draft evaluated against the rest of the plan and the server context (SC-02/05/06).
  const evaluated =
    candidate.success && draft.employeeId && draft.templateId && draft.businessDate
      ? reasonsFor(
          planIssues({
            grid: placeAssignment(
              original ? setCell(w.grid, original.employeeId, original.businessDate, '') : w.grid,
              candidate.data,
            ),
            month: w.month,
            orgUnitId: w.orgUnitId,
            templates: w.templates,
            timezone: w.timezone,
            staffing: w.staffing,
            context: w.context,
          }).reasons,
          draft.employeeId,
          draft.businessDate,
        )
      : [];
  const blockedByRules = evaluated.some((reason) => reason.severity === 'BLOCK');
  const candidateQuery =
    !original && draft.zoneId && draft.templateId && draft.businessDate.startsWith(w.month)
      ? {
          siteId: w.siteId,
          orgUnitId: w.orgUnitId,
          zoneId: draft.zoneId,
          templateId: draft.templateId,
          businessDate: draft.businessDate,
        }
      : null;
  const candidates = useCandidates(w.accessKey, candidateQuery, w.writable);
  const labels = {
    unitName: (id: string) => w.units.find((unit) => unit.id === id)?.name ?? id,
    zoneName: (id: string) => w.zones.find((zone) => zone.id === id)?.name ?? id,
  };
  const unchanged =
    !!original &&
    original.employeeId === draft.employeeId &&
    original.businessDate === draft.businessDate &&
    original.templateId === draft.templateId &&
    original.zoneId === draft.zoneId;
  const valid =
    candidate.success &&
    active &&
    draft.businessDate.startsWith(w.month) &&
    !occupied &&
    missingQualifications.length === 0 &&
    !blockedByRules &&
    !unchanged;
  function apply() {
    if (!valid || !candidate.success || !w.writable) return;
    const cleared = original
      ? setCell(w.grid, original.employeeId, original.businessDate, '')
      : w.grid;
    w.edit(setAssignment(cleared, candidate.data));
    onApplied();
  }
  return (
    <form
      className="@container space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <h3 className="font-semibold">
        {original ? (context.move ? t.moveAssignment : t.editAssignment) : t.add}
      </h3>
      <div className="grid gap-4 @min-[36rem]:grid-cols-2">
        <QueryFeedback query={w.employeeResult.queryState} errorMessage={t.rosterUnavailable} />
        <SelectField
          placeholder={t.select}
          label={s.employee}
          value={draft.employeeId}
          disabled={(!!original && !context.move) || !w.writable}
          onChange={(employeeId) => setDraft({ ...draft, employeeId })}
          options={w.employees
            .filter((employee) => employee.status === 'ACTIVE' || employee.id === draft.employeeId)
            .map((employee) => ({ value: employee.id, label: employee.fullName }))}
        />
        <DateField
          minDate={`${w.month}-01`}
          maxDate={monthDates(w.month).at(-1)}
          label={t.date}
          value={draft.businessDate}
          onChange={(businessDate) => setDraft({ ...draft, businessDate })}
        />
        <SelectField
          placeholder={t.select}
          label={t.zone}
          value={draft.zoneId}
          onChange={(zoneId) => setDraft({ ...draft, zoneId })}
          options={w.zones
            .filter((zone) => zone.isActive && zoneAllowed(w.rights.zones, zone.id))
            .map((zone) => ({ value: zone.id, label: zone.name }))}
        />
        <SelectField
          placeholder={t.select}
          label={t.template}
          value={draft.templateId}
          onChange={(templateId) => setDraft({ ...draft, templateId })}
          options={w.templates
            .filter((template) => template.isActive)
            .map((template) => ({
              value: template.id,
              label: `${templateLabel(template.code, t)} · ${template.localStart}–${template.localEnd}`,
            }))}
        />
      </div>
      {occupied && <Feedback error={t.occupied} />}
      {missingQualifications.length > 0 && (
        <Feedback
          error={format(t.qualificationRequired, { names: missingQualifications.join(', ') })}
        />
      )}
      {evaluated.filter((reason) => reason.code !== 'QUALIFICATION').length > 0 && (
        <ul className="space-y-1 text-sm" aria-label={t.conflict}>
          {evaluated
            .filter((reason) => reason.code !== 'QUALIFICATION')
            .map((reason, index) => (
              <li
                key={index}
                className={
                  reason.severity === 'BLOCK'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-amber-700 dark:text-amber-300'
                }
              >
                {reasonText(reason, labels)}
              </li>
            ))}
        </ul>
      )}
      {candidateQuery && (
        <section className="space-y-2" aria-label={t.candidates}>
          <div className="flex items-center gap-1">
            <h4 className="text-sm font-semibold">{t.candidates}</h4>
            <InfoTip text={t.candidatesHint} />
          </div>
          {candidates.isPending && candidates.fetchStatus !== 'idle' && (
            <LoadingState label={t.candidates} />
          )}
          {candidates.isError && <Feedback error={t.candidatesUnavailable} />}
          {candidates.data && candidates.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t.noCandidates}</p>
          )}
          {candidates.data && candidates.data.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
              {candidates.data.slice(0, 50).map((item) => {
                const employee = w.employees.find((value) => value.id === item.employeeId);
                if (!employee) return null;
                const tone =
                  item.status === 'BLOCKED'
                    ? 'text-red-700 dark:text-red-300'
                    : item.status === 'WARNING'
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-700 dark:text-emerald-300';
                return (
                  <li key={item.employeeId}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full flex-col items-start gap-0.5 whitespace-normal py-1.5 text-left"
                      aria-pressed={draft.employeeId === item.employeeId}
                      disabled={item.status === 'BLOCKED'}
                      onClick={() => setDraft({ ...draft, employeeId: item.employeeId })}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {employee.fullName}
                        </span>
                        {!item.ownUnit && (
                          <span className="text-xs text-muted-foreground">{t.otherUnit}</span>
                        )}
                        <span className={`text-xs ${tone}`}>
                          {item.status === 'BLOCKED'
                            ? t.blocked
                            : item.status === 'WARNING'
                              ? t.warning
                              : t.eligible}
                        </span>
                      </span>
                      {item.reasons.length > 0 && (
                        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {item.reasons.map((reason) => reasonText(reason, labels)).join(' · ')}
                        </span>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {!occupied && !unchanged && !valid && (
        <p className="text-sm text-muted-foreground">{t.invalid}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!valid || !w.writable}>
          {t.apply}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t.cancel}
        </Button>
        {original && (
          <Button
            type="button"
            variant="destructive"
            disabled={!w.writable}
            onClick={() => {
              if (w.writable) {
                w.edit(setCell(w.grid, original.employeeId, original.businessDate, ''));
                onApplied();
              }
            }}
          >
            {t.removeAssignment}
          </Button>
        )}
      </div>
    </form>
  );
}
