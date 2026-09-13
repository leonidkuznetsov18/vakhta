import { templateLabel } from '../lib/template-label';
import { assignmentInstants, monthDates, resolveBreaks, resolveSegments } from '@vakhta/domain';
import { useState } from 'react';
import {
  AssignmentInput,
  type AssignmentBreakInput,
  type AssignmentSegmentInput,
} from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import { qualifiedFor, requiredQualifications } from '@vakhta/domain';
import {
  PlusIcon,
  XIcon,
  CheckIcon,
  ArrowLeftIcon,
  CircleDashedIcon,
  Trash2Icon,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/shared/ui/icon-button';
import { planIssues, reasonText, reasonsFor, useCandidates } from '../model/use-eligibility';
import { setAssignment as placeAssignment } from '../model/grid';
import { LoadingState } from '@/shared/ui/loading-state';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { FormField, SelectField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { Button } from '@/components/ui/button';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Feedback } from '@/components/app/feedback';
import { InfoTip } from '@/components/app/info-tip';
import type { Workspace } from '../model/use-workspace';
import { assignmentKey, gridToItems, sameAssignment, setAssignment, setCell } from '../model/grid';
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
  onCreateSlot,
}: {
  workspace: Workspace;
  context: AssignmentContext;
  onClose: () => void;
  /** Called instead of onClose after a local change was applied or the assignment removed. */
  onApplied?: () => void;
  /** Creates an internal open slot for the chosen date, zone and shift instead of a person. */
  onCreateSlot?: (input: { businessDate: string; zoneId: string; templateId: string }) => void;
}) {
  const original = gridToItems(w.grid).find(
    (item) => item.employeeId === context.employeeId && item.businessDate === context.businessDate,
  );
  const [draft, setDraft] = useState({
    ...context,
    templateId: context.templateId ?? original?.templateId ?? '',
    custom: !!original?.customStart && !!original.customEnd,
    customStart: original?.customStart ?? '',
    customEnd: original?.customEnd ?? '',
    segments: (original?.segments ?? []) as readonly AssignmentSegmentInput[],
    breaks: (original?.breaks ?? []) as readonly AssignmentBreakInput[],
  });
  const template = w.templates.find((item) => item.id === draft.templateId);
  const { custom, customStart, customEnd, segments, breaks, ...fields } = draft;
  const candidate = AssignmentInput.safeParse({
    ...original,
    ...fields,
    kind: original?.kind ?? 'REGULAR',
    customStart: custom ? customStart : undefined,
    customEnd: custom ? customEnd : undefined,
    segments: segments.length > 0 ? segments : undefined,
    breaks: breaks.length > 0 ? breaks : undefined,
  });
  // Segments must tile the planned interval (SC-37); the server repeats this check on save.
  const tiling =
    template && segments.length > 0 && candidate.success
      ? resolveSegments(
          {
            ...assignmentInstants(
              {
                businessDate: draft.businessDate,
                template,
                customStart: candidate.data.customStart,
                customEnd: candidate.data.customEnd,
              },
              w.timezone,
            ),
            businessDate: draft.businessDate,
          },
          segments,
          w.timezone,
        )
      : { segments: [] };
  const segmentsInvalid = 'error' in tiling;
  const pauses =
    template && breaks.length > 0 && candidate.success
      ? resolveBreaks(
          {
            ...assignmentInstants(
              {
                businessDate: draft.businessDate,
                template,
                customStart: candidate.data.customStart,
                customEnd: candidate.data.customEnd,
              },
              w.timezone,
            ),
            businessDate: draft.businessDate,
          },
          breaks,
          w.timezone,
        )
      : { breaks: [] };
  const breaksInvalid = 'error' in pauses;
  const setBreak = (index: number, patch: Partial<AssignmentBreakInput>) =>
    setDraft({
      ...draft,
      breaks: breaks.map((pause, at) => (at === index ? { ...pause, ...patch } : pause)),
    });
  // Relief candidates: other people planned on the same date in the loaded plan.
  const reliefOptions = gridToItems(w.grid)
    .filter(
      (item) => item.businessDate === draft.businessDate && item.employeeId !== draft.employeeId,
    )
    .map((item) => ({
      value: item.employeeId,
      label:
        w.employees.find((employee) => employee.id === item.employeeId)?.fullName ??
        item.employeeId,
    }));
  const setSegment = (index: number, patch: Partial<AssignmentSegmentInput>) =>
    setDraft({
      ...draft,
      segments: segments.map((segment, at) => (at === index ? { ...segment, ...patch } : segment)),
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
    (!original || context.move) &&
    draft.zoneId &&
    draft.templateId &&
    draft.businessDate.startsWith(w.month)
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
    employeeName: (id: string) =>
      w.employees.find((employee) => employee.id === id)?.fullName ?? id,
  };
  const unchanged = !!original && candidate.success && sameAssignment(original, candidate.data);
  // Borrowing (D-06, SC-38): a person whose position sits in another unit of the site.
  const sourceUnit = w.context?.otherUnitEmployees.find(
    (member) => member.employeeId === draft.employeeId,
  );
  const sourcePlanned = evaluated.some(
    (reason) => reason.code === 'OVERLAP' && reason.detail['orgUnitId'] === sourceUnit?.orgUnitId,
  );
  const valid =
    candidate.success &&
    active &&
    draft.businessDate.startsWith(w.month) &&
    !occupied &&
    missingQualifications.length === 0 &&
    !blockedByRules &&
    !segmentsInvalid &&
    !breaksInvalid &&
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
      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="assignment-custom-time"
            checked={custom}
            disabled={!w.writable}
            onCheckedChange={(value) =>
              setDraft({
                ...draft,
                custom: value === true,
                customStart: customStart || template?.localStart || '',
                customEnd: customEnd || template?.localEnd || '',
              })
            }
          />
          <label htmlFor="assignment-custom-time" className="text-sm font-medium">
            {t.customTime}
          </label>
          <InfoTip text={t.customTimeHint} />
        </div>
        {custom && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t.customStart}>
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  step={60}
                  value={customStart}
                  disabled={!w.writable}
                  onChange={(event) => setDraft({ ...draft, customStart: event.target.value })}
                />
              )}
            </FormField>
            <FormField label={t.customEnd}>
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  step={60}
                  value={customEnd}
                  disabled={!w.writable}
                  onChange={(event) => setDraft({ ...draft, customEnd: event.target.value })}
                />
              )}
            </FormField>
          </div>
        )}
      </div>
      <section className="space-y-2 rounded-md border p-3" aria-label={t.segments}>
        <div className="flex items-center gap-1">
          <h4 className="text-sm font-semibold">{t.segments}</h4>
          <InfoTip text={t.segmentsHint} />
        </div>
        {segments.map((segment, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="grid gap-2 @min-[26rem]:grid-cols-3">
              <SelectField
                placeholder={t.select}
                label={t.zone}
                value={segment.zoneId}
                disabled={!w.writable}
                onChange={(zoneId) => setSegment(index, { zoneId })}
                options={w.zones
                  .filter((zone) => zone.isActive && zoneAllowed(w.rights.zones, zone.id))
                  .map((zone) => ({ value: zone.id, label: zone.name }))}
              />
              <FormField label={t.customStart}>
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    step={60}
                    value={segment.localStart}
                    disabled={!w.writable}
                    onChange={(event) => setSegment(index, { localStart: event.target.value })}
                  />
                )}
              </FormField>
              <FormField label={t.customEnd}>
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    step={60}
                    value={segment.localEnd}
                    disabled={!w.writable}
                    onChange={(event) => setSegment(index, { localEnd: event.target.value })}
                  />
                )}
              </FormField>
            </div>
            <IconButton
              icon={XIcon}
              label={t.removeSegment}
              tooltip={t.removeSegment}
              variant="ghost"
              size="icon"
              disabled={!w.writable}
              onClick={() =>
                setDraft({ ...draft, segments: segments.filter((_, at) => at !== index) })
              }
            />
          </div>
        ))}
        {segmentsInvalid && <Feedback error={t.segmentInvalid} />}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!w.writable || segments.length >= 8}
          onClick={() => {
            const last = segments.at(-1);
            const start = last?.localEnd ?? (custom ? customStart : template?.localStart) ?? '';
            const end = (custom ? customEnd : template?.localEnd) ?? '';
            setDraft({
              ...draft,
              segments: [...segments, { zoneId: draft.zoneId, localStart: start, localEnd: end }],
            });
          }}
        >
          <PlusIcon aria-hidden="true" />
          {t.addSegment}
        </Button>
      </section>
      <section className="space-y-2 rounded-md border p-3" aria-label={t.breaks}>
        <div className="flex items-center gap-1">
          <h4 className="text-sm font-semibold">{t.breaks}</h4>
          <InfoTip text={t.breaksHint} />
        </div>
        {breaks.map((pause, index) => (
          <div key={index} className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="grid gap-2 @min-[26rem]:grid-cols-3">
              <FormField label={t.customStart}>
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    step={60}
                    value={pause.localStart}
                    disabled={!w.writable}
                    onChange={(event) => setBreak(index, { localStart: event.target.value })}
                  />
                )}
              </FormField>
              <FormField label={t.customEnd}>
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    step={60}
                    value={pause.localEnd}
                    disabled={!w.writable}
                    onChange={(event) => setBreak(index, { localEnd: event.target.value })}
                  />
                )}
              </FormField>
              <SelectField
                label={t.relief}
                value={pause.reliefEmployeeId ?? ''}
                disabled={!w.writable}
                onChange={(reliefEmployeeId) =>
                  setBreak(index, { reliefEmployeeId: reliefEmployeeId || null })
                }
                options={[{ value: '', label: t.noRelief }, ...reliefOptions]}
              />
            </div>
            <IconButton
              icon={XIcon}
              label={t.removeBreak}
              tooltip={t.removeBreak}
              variant="ghost"
              size="icon"
              disabled={!w.writable}
              onClick={() => setDraft({ ...draft, breaks: breaks.filter((_, at) => at !== index) })}
            />
          </div>
        ))}
        {breaksInvalid && <Feedback error={t.breakInvalid} />}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!w.writable || breaks.length >= 8}
          onClick={() => {
            const last = breaks.at(-1);
            const start = last?.localEnd ?? (custom ? customStart : template?.localStart) ?? '';
            setDraft({
              ...draft,
              breaks: [...breaks, { localStart: start, localEnd: start, reliefEmployeeId: null }],
            });
          }}
        >
          <PlusIcon aria-hidden="true" />
          {t.addBreak}
        </Button>
      </section>
      {sourceUnit && (
        <div className="space-y-1 rounded-md border p-3 text-sm" role="note">
          <div className="flex items-center gap-1 font-medium">
            {format(t.borrowing, { unit: labels.unitName(sourceUnit.orgUnitId) })}
            <InfoTip text={t.borrowingHint} />
          </div>
          <p className="text-muted-foreground">
            {sourcePlanned ? t.borrowingSourcePlanned : t.borrowingSourceFree}
          </p>
        </div>
      )}
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
                if (!employee || item.employeeId === original?.employeeId) return null;
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
        <Button
          type="submit"
          disabled={!valid || !w.writable}
          className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
        >
          <CheckIcon aria-hidden="true" />
          {t.apply}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          <ArrowLeftIcon aria-hidden="true" />
          {t.backToDetails}
        </Button>
        {!original && onCreateSlot && (
          <Button
            type="button"
            variant="secondary"
            disabled={
              !w.writable ||
              !draft.zoneId ||
              !draft.templateId ||
              !draft.businessDate.startsWith(w.month)
            }
            onClick={() =>
              onCreateSlot({
                businessDate: draft.businessDate,
                zoneId: draft.zoneId,
                templateId: draft.templateId,
              })
            }
          >
            <CircleDashedIcon aria-hidden="true" />
            {t.createOpenSlot}
          </Button>
        )}
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
            <Trash2Icon aria-hidden="true" />
            {t.removeAssignment}
          </Button>
        )}
      </div>
    </form>
  );
}
