import { useState } from 'react';
import { Trash2Icon, PencilIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import type { StaffingRequirementView } from '@vakhta/contracts';
import { currentLocale } from '@/i18n';
import { useNavigation } from '@/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField, FormField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { DataTable } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { QueryFeedback } from '@/components/app/query-feedback';
import { WorkflowSection } from '@/shared/ui/workflow-section';
import { CalendarDetailPanel } from '@/shared/ui/resource-calendar';
import { readError } from '@/errors';
import { templateLabel } from '../lib/template-label';
import type { Workspace } from '../model/use-workspace';
import { employeeLabel } from './assignment-changes';

const t = messages(currentLocale()).scheduleWorkspace;
const weekdays = messages(currentLocale()).schedule.weekdaysShort;
const DEMAND_OWNERS = ['ADMIN', 'PRODUCTION_HEAD'];
const EVIDENCE_OWNERS = ['ADMIN', 'HR'];
const AVAILABILITY_OWNERS = ['ADMIN', 'HR', 'PLANNER', 'PRODUCTION_HEAD'];
/** Catalog order is Monday first; preferences store 0 = Sunday. */
const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 0] as const;

type RequirementDraft = {
  id?: string;
  zoneId: string;
  templateId: string;
  requiredCount: string;
  qualificationId: string;
  effectiveFrom: string;
  effectiveTo: string;
  note: string;
};

/**
 * Staffing demand and qualification evidence of the unit (SC-01, SC-04). Requirements belong to
 * administrators and production heads, qualification records to administrators and HR (D-02).
 */
export function StaffingSheet({
  workspace: w,
  open,
  onClose,
  onRestoreFocus,
  date,
}: {
  readonly workspace: Workspace;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRestoreFocus: () => void;
  /** Default effective date for a new requirement. */
  readonly date: string;
}) {
  const { roles } = useNavigation();
  const owner = roles.some((role) => DEMAND_OWNERS.includes(role)) && w.rights.publish;
  const recorder = roles.some((role) => EVIDENCE_OWNERS.includes(role));
  const staffing = w.staffingState;
  const data = w.staffing;
  const emptyDraft = (): RequirementDraft => ({
    zoneId: w.zones[0]?.id ?? '',
    templateId: w.templates.find((template) => template.isActive)?.id ?? '',
    requiredCount: '1',
    qualificationId: '',
    effectiveFrom: `${date.slice(0, 7)}-01`,
    effectiveTo: '',
    note: '',
  });
  const [stored, setDraft] = useState<RequirementDraft>(emptyDraft);
  // The panel mounts before directories load: empty selections fall back to the first choice.
  const draft: RequirementDraft = {
    ...stored,
    zoneId: stored.zoneId || (w.zones.find((zone) => zone.isActive)?.id ?? ''),
    templateId: stored.templateId || (w.templates.find((template) => template.isActive)?.id ?? ''),
  };
  const [qualification, setQualification] = useState({ code: '', name: '' });
  const [holding, setHolding] = useState({
    employeeId: '',
    qualificationId: '',
    validFrom: date,
    validUntil: '',
  });
  const storedRules = data?.rules;
  const [rulesDraft, setRulesDraft] = useState<{
    minRestHours: string;
    maxMonthHours: string;
    restSeverity: 'WARN' | 'BLOCK';
    hoursSeverity: 'WARN' | 'BLOCK';
  } | null>(null);
  const rulesForm = rulesDraft ?? {
    minRestHours: storedRules ? String(storedRules.minRestMinutes / 60) : '11',
    maxMonthHours: storedRules ? String(storedRules.maxMonthMinutes / 60) : '200',
    restSeverity: storedRules?.restSeverity ?? 'WARN',
    hoursSeverity: storedRules?.hoursSeverity ?? 'WARN',
  };
  const minRest = Math.round(Number(rulesForm.minRestHours) * 60);
  const maxMonth = Math.round(Number(rulesForm.maxMonthHours) * 60);
  const rulesValid =
    Number.isFinite(minRest) && minRest >= 0 && Number.isFinite(maxMonth) && maxMonth > 0;
  const rulesChanged =
    !storedRules ||
    !storedRules.configured ||
    storedRules.minRestMinutes !== minRest ||
    storedRules.maxMonthMinutes !== maxMonth ||
    storedRules.restSeverity !== rulesForm.restSeverity ||
    storedRules.hoursSeverity !== rulesForm.hoursSeverity;
  const canSaveRules = owner && rulesValid && rulesChanged && !staffing.busy;
  const availabilityOwner = roles.some((role) => AVAILABILITY_OWNERS.includes(role));
  const [availability, setAvailability] = useState({
    employeeId: '',
    kind: 'UNAVAILABLE' as 'UNAVAILABLE' | 'PREFERRED',
    target: 'weekday' as 'weekday' | 'date',
    weekday: '1',
    date,
    validFrom: date,
    validTo: '',
  });
  const canRecordAvailability =
    availabilityOwner &&
    !!availability.employeeId &&
    (availability.target === 'weekday' ? availability.weekday !== '' : !!availability.date) &&
    /^\d{4}-\d{2}-\d{2}$/.test(availability.validFrom) &&
    (!availability.validTo || availability.validTo >= availability.validFrom) &&
    !staffing.busy;
  const weekdayLabel = (value: number) => weekdays[WEEKDAY_VALUES.indexOf(value as 0)] ?? '';
  const count = Number(draft.requiredCount);
  const requirementValid =
    !!draft.zoneId &&
    !!draft.templateId &&
    Number.isInteger(count) &&
    count > 0 &&
    count <= 200 &&
    /^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom) &&
    (!draft.effectiveTo || draft.effectiveTo >= draft.effectiveFrom);
  const existing = data?.requirements.find((row) => row.id === draft.id);
  const requirementChanged =
    !existing ||
    existing.zoneId !== draft.zoneId ||
    existing.templateId !== draft.templateId ||
    existing.requiredCount !== count ||
    (existing.qualificationId ?? '') !== draft.qualificationId ||
    existing.effectiveFrom !== draft.effectiveFrom ||
    (existing.effectiveTo ?? '') !== draft.effectiveTo ||
    (existing.note ?? '') !== draft.note;
  const canSaveRequirement = owner && requirementValid && requirementChanged && !staffing.busy;
  const canAddQualification =
    owner && !!qualification.code.trim() && !!qualification.name.trim() && !staffing.busy;
  const canRecordHolding =
    recorder &&
    !!holding.employeeId &&
    !!holding.qualificationId &&
    /^\d{4}-\d{2}-\d{2}$/.test(holding.validFrom) &&
    (!holding.validUntil || holding.validUntil >= holding.validFrom) &&
    !staffing.busy;
  const zoneName = (id: string) => w.zones.find((zone) => zone.id === id)?.name ?? id;
  const template = (id: string) => w.templates.find((item) => item.id === id);
  const qualificationName = (id: string | null) =>
    id ? (data?.qualifications.find((item) => item.id === id)?.name ?? id) : t.anyQualification;
  function saveRequirement() {
    if (!canSaveRequirement) return;
    staffing.setRequirement.mutate(
      {
        ...(draft.id ? { id: draft.id } : {}),
        zoneId: draft.zoneId,
        templateId: draft.templateId,
        requiredCount: count,
        qualificationId: draft.qualificationId || null,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo || null,
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      },
      { onSuccess: () => setDraft(emptyDraft()) },
    );
  }
  function editRequirement(row: StaffingRequirementView) {
    setDraft({
      id: row.id,
      zoneId: row.zoneId,
      templateId: row.templateId,
      requiredCount: String(row.requiredCount),
      qualificationId: row.qualificationId ?? '',
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? '',
      note: row.note ?? '',
    });
  }
  return (
    <CalendarDetailPanel
      open={open}
      title={t.staffing}
      description={t.staffingHint}
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      wide
    >
      <div className="space-y-6">
        <QueryFeedback query={staffing.query} />
        <Feedback
          error={readError(
            staffing.setRequirement.error ??
              staffing.removeRequirement.error ??
              staffing.createQualification.error ??
              staffing.recordHolding.error ??
              staffing.removeHolding.error,
          )}
        />
        <WorkflowSection title={t.requirementRows}>
          <DataTable
            columns={[
              { key: 'zone', header: t.zone, cell: (row) => zoneName(row.zoneId) },
              {
                key: 'template',
                header: t.template,
                cell: (row) => {
                  const item = template(row.templateId);
                  return item ? templateLabel(item.code, t) : row.templateId;
                },
              },
              { key: 'count', header: t.requiredCount, cell: (row) => String(row.requiredCount) },
              {
                key: 'qualification',
                header: t.qualification,
                cell: (row) => qualificationName(row.qualificationId),
              },
              {
                key: 'period',
                header: t.inForce,
                cell: (row) => `${row.effectiveFrom} – ${row.effectiveTo ?? t.noEnd}`,
              },
            ]}
            rows={data?.requirements ?? []}
            rowKey={(row) => row.id}
            empty={t.noRequirements}
            pageSize={10}
            queryState={staffing.query}
            rowActions={(row) =>
              owner
                ? [
                    {
                      key: 'edit',
                      label: t.editRequirement,
                      icon: PencilIcon,
                      onSelect: () => editRequirement(row),
                    },
                    {
                      key: 'remove',
                      label: t.removeRequirement,
                      icon: Trash2Icon,
                      destructive: true,
                      disabled: staffing.busy,
                      onSelect: () => staffing.removeRequirement.mutate(row.id),
                    },
                  ]
                : []
            }
          />
          {owner ? (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                saveRequirement();
              }}
            >
              <SelectField
                label={t.zone}
                value={draft.zoneId}
                onChange={(zoneId) => setDraft({ ...draft, zoneId })}
                options={w.zones
                  .filter((zone) => zone.isActive)
                  .map((zone) => ({ value: zone.id, label: zone.name }))}
              />
              <SelectField
                label={t.template}
                value={draft.templateId}
                onChange={(templateId) => setDraft({ ...draft, templateId })}
                options={w.templates
                  .filter((item) => item.isActive)
                  .map((item) => ({ value: item.id, label: templateLabel(item.code, t) }))}
              />
              <FormField label={t.requiredCount}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={200}
                    value={draft.requiredCount}
                    onChange={(event) => setDraft({ ...draft, requiredCount: event.target.value })}
                  />
                )}
              </FormField>
              <SelectField
                label={t.qualification}
                value={draft.qualificationId}
                onChange={(qualificationId) => setDraft({ ...draft, qualificationId })}
                options={[
                  { value: '', label: t.anyQualification },
                  ...(data?.qualifications ?? [])
                    .filter((item) => item.isActive)
                    .map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
              <DateField
                label={t.effectiveFrom}
                value={draft.effectiveFrom}
                onChange={(effectiveFrom) => setDraft({ ...draft, effectiveFrom })}
              />
              <DateField
                label={t.effectiveTo}
                value={draft.effectiveTo}
                minDate={draft.effectiveFrom}
                onChange={(effectiveTo) => setDraft({ ...draft, effectiveTo })}
              />
              <FormField label={t.note} className="sm:col-span-2">
                {(id) => (
                  <Input
                    id={id}
                    maxLength={500}
                    value={draft.note}
                    onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                  />
                )}
              </FormField>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit" disabled={!canSaveRequirement}>
                  {draft.id ? t.saveRequirement : t.addRequirement}
                </Button>
                {(draft.id || draft.effectiveTo || draft.note) && (
                  <Button type="button" variant="outline" onClick={() => setDraft(emptyDraft())}>
                    {t.cancel}
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{t.staffingReadOnly}</p>
          )}
        </WorkflowSection>
        <WorkflowSection title={t.qualifications}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {(data?.qualifications ?? []).map((item) => (
              <li key={item.id} className="rounded-md border px-2 py-1">
                <span className="font-medium">{item.code}</span> · {item.name}
              </li>
            ))}
          </ul>
          {owner && (
            <form
              className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canAddQualification) return;
                staffing.createQualification.mutate(
                  {
                    siteId: w.siteId,
                    code: qualification.code.trim().toUpperCase(),
                    name: qualification.name.trim(),
                  },
                  { onSuccess: () => setQualification({ code: '', name: '' }) },
                );
              }}
            >
              <FormField label={t.code}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={40}
                    value={qualification.code}
                    onChange={(event) =>
                      setQualification({ ...qualification, code: event.target.value })
                    }
                  />
                )}
              </FormField>
              <FormField label={t.name}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={120}
                    value={qualification.name}
                    onChange={(event) =>
                      setQualification({ ...qualification, name: event.target.value })
                    }
                  />
                )}
              </FormField>
              <Button type="submit" variant="outline" disabled={!canAddQualification}>
                {t.addQualification}
              </Button>
            </form>
          )}
        </WorkflowSection>
        <WorkflowSection title={t.rules} hint={t.rulesHint}>
          {storedRules && !storedRules.configured && (
            <p className="text-sm text-muted-foreground">{t.rulesDefault}</p>
          )}
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSaveRules) return;
              staffing.setRules.mutate(
                {
                  siteId: w.siteId,
                  minRestMinutes: minRest,
                  maxMonthMinutes: maxMonth,
                  restSeverity: rulesForm.restSeverity,
                  hoursSeverity: rulesForm.hoursSeverity,
                },
                { onSuccess: () => setRulesDraft(null) },
              );
            }}
          >
            <FormField label={t.minRestHours}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  step={0.5}
                  disabled={!owner}
                  value={rulesForm.minRestHours}
                  onChange={(event) =>
                    setRulesDraft({ ...rulesForm, minRestHours: event.target.value })
                  }
                />
              )}
            </FormField>
            <SelectField
              label={`${t.severity} · ${t.minRestHours}`}
              value={rulesForm.restSeverity}
              disabled={!owner}
              onChange={(value) =>
                setRulesDraft({ ...rulesForm, restSeverity: value === 'BLOCK' ? 'BLOCK' : 'WARN' })
              }
              options={[
                { value: 'WARN', label: t.severityWarn },
                { value: 'BLOCK', label: t.severityBlock },
              ]}
            />
            <FormField label={t.maxMonthHours}>
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  disabled={!owner}
                  value={rulesForm.maxMonthHours}
                  onChange={(event) =>
                    setRulesDraft({ ...rulesForm, maxMonthHours: event.target.value })
                  }
                />
              )}
            </FormField>
            <SelectField
              label={`${t.severity} · ${t.maxMonthHours}`}
              value={rulesForm.hoursSeverity}
              disabled={!owner}
              onChange={(value) =>
                setRulesDraft({
                  ...rulesForm,
                  hoursSeverity: value === 'BLOCK' ? 'BLOCK' : 'WARN',
                })
              }
              options={[
                { value: 'WARN', label: t.severityWarn },
                { value: 'BLOCK', label: t.severityBlock },
              ]}
            />
            {owner && (
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!canSaveRules}>
                  {t.saveRules}
                </Button>
              </div>
            )}
          </form>
        </WorkflowSection>
        <WorkflowSection title={t.availability} hint={t.availabilityHint}>
          <DataTable
            columns={[
              {
                key: 'employee',
                header: t.workers,
                cell: (row) => employeeLabel(w, row.employeeId),
              },
              {
                key: 'kind',
                header: t.availability,
                cell: (row) => (row.kind === 'UNAVAILABLE' ? t.unavailable : t.preferred),
              },
              {
                key: 'when',
                header: t.date,
                cell: (row) => row.date ?? `${t.everyWeek} · ${weekdayLabel(row.weekday ?? -1)}`,
              },
              {
                key: 'validity',
                header: t.inForce,
                cell: (row) => `${row.validFrom} – ${row.validTo ?? t.noEnd}`,
              },
            ]}
            rows={data?.availability ?? []}
            rowKey={(row) => row.id}
            empty={t.noAvailability}
            pageSize={10}
            queryState={staffing.query}
            rowActions={(row) =>
              availabilityOwner
                ? [
                    {
                      key: 'remove',
                      label: t.removeAvailability,
                      icon: Trash2Icon,
                      destructive: true,
                      disabled: staffing.busy,
                      onSelect: () => staffing.removeAvailability.mutate(row.id),
                    },
                  ]
                : []
            }
          />
          {availabilityOwner && (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canRecordAvailability) return;
                staffing.recordAvailability.mutate(
                  {
                    employeeId: availability.employeeId,
                    kind: availability.kind,
                    weekday:
                      availability.target === 'weekday' ? Number(availability.weekday) : null,
                    date: availability.target === 'date' ? availability.date : null,
                    validFrom: availability.validFrom,
                    validTo: availability.validTo || null,
                  },
                  { onSuccess: () => setAvailability({ ...availability, employeeId: '' }) },
                );
              }}
            >
              <SelectField
                placeholder={t.select}
                label={t.workers}
                value={availability.employeeId}
                onChange={(employeeId) => setAvailability({ ...availability, employeeId })}
                options={w.employees
                  .filter((employee) => employee.status === 'ACTIVE')
                  .map((employee) => ({ value: employee.id, label: employee.fullName }))}
              />
              <SelectField
                label={t.availability}
                value={availability.kind}
                onChange={(value) =>
                  setAvailability({
                    ...availability,
                    kind: value === 'PREFERRED' ? 'PREFERRED' : 'UNAVAILABLE',
                  })
                }
                options={[
                  { value: 'UNAVAILABLE', label: t.unavailable },
                  { value: 'PREFERRED', label: t.preferred },
                ]}
              />
              <SelectField
                label={t.pattern}
                value={availability.target}
                onChange={(value) =>
                  setAvailability({
                    ...availability,
                    target: value === 'date' ? 'date' : 'weekday',
                  })
                }
                options={[
                  { value: 'weekday', label: t.everyWeek },
                  { value: 'date', label: t.specificDate },
                ]}
              />
              {availability.target === 'weekday' ? (
                <SelectField
                  label={t.weekday}
                  value={availability.weekday}
                  onChange={(weekday) => setAvailability({ ...availability, weekday })}
                  options={WEEKDAY_VALUES.map((value, index) => ({
                    value: String(value),
                    label: weekdays[index] ?? String(value),
                  }))}
                />
              ) : (
                <DateField
                  label={t.specificDate}
                  value={availability.date}
                  onChange={(value) => setAvailability({ ...availability, date: value })}
                />
              )}
              <DateField
                label={t.validFrom}
                value={availability.validFrom}
                onChange={(validFrom) => setAvailability({ ...availability, validFrom })}
              />
              <DateField
                label={t.validUntil}
                value={availability.validTo}
                minDate={availability.validFrom}
                onChange={(validTo) => setAvailability({ ...availability, validTo })}
              />
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!canRecordAvailability}>
                  {t.addAvailability}
                </Button>
              </div>
            </form>
          )}
        </WorkflowSection>
        <WorkflowSection title={t.holdings}>
          <DataTable
            columns={[
              {
                key: 'employee',
                header: t.workers,
                cell: (row) => employeeLabel(w, row.employeeId),
              },
              {
                key: 'qualification',
                header: t.qualification,
                cell: (row) => qualificationName(row.qualificationId),
              },
              {
                key: 'validity',
                header: t.inForce,
                cell: (row) => `${row.validFrom} – ${row.validUntil ?? t.noEnd}`,
              },
            ]}
            rows={data?.holdings ?? []}
            rowKey={(row) => row.id}
            empty={t.noHoldings}
            pageSize={10}
            queryState={staffing.query}
            rowActions={(row) =>
              recorder
                ? [
                    {
                      key: 'remove',
                      label: t.removeHolding,
                      icon: Trash2Icon,
                      destructive: true,
                      disabled: staffing.busy,
                      onSelect: () => staffing.removeHolding.mutate(row.id),
                    },
                  ]
                : []
            }
          />
          {recorder ? (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canRecordHolding) return;
                staffing.recordHolding.mutate(
                  {
                    employeeId: holding.employeeId,
                    qualificationId: holding.qualificationId,
                    validFrom: holding.validFrom,
                    validUntil: holding.validUntil || null,
                  },
                  { onSuccess: () => setHolding({ ...holding, employeeId: '' }) },
                );
              }}
            >
              <SelectField
                placeholder={t.select}
                label={t.workers}
                value={holding.employeeId}
                onChange={(employeeId) => setHolding({ ...holding, employeeId })}
                options={w.employees
                  .filter((employee) => employee.status === 'ACTIVE')
                  .map((employee) => ({ value: employee.id, label: employee.fullName }))}
              />
              <SelectField
                placeholder={t.select}
                label={t.qualification}
                value={holding.qualificationId}
                onChange={(qualificationId) => setHolding({ ...holding, qualificationId })}
                options={(data?.qualifications ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
              <DateField
                label={t.validFrom}
                value={holding.validFrom}
                onChange={(validFrom) => setHolding({ ...holding, validFrom })}
              />
              <DateField
                label={t.validUntil}
                value={holding.validUntil}
                minDate={holding.validFrom}
                onChange={(validUntil) => setHolding({ ...holding, validUntil })}
              />
              <div className="sm:col-span-2">
                <Button type="submit" disabled={!canRecordHolding}>
                  {t.addHolding}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{t.holdingsReadOnly}</p>
          )}
        </WorkflowSection>
      </div>
    </CalendarDetailPanel>
  );
}
