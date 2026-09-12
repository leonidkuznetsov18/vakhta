import { templateLabel } from '../lib/template-label';
import { monthDates } from '@vakhta/domain';
import { useState } from 'react';
import { AssignmentInput } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { SelectField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { Button } from '@/components/ui/button';
import { Feedback } from '@/components/app/feedback';
import type { Workspace } from '../model/use-workspace';
import { assignmentKey, gridToItems, setAssignment, setCell } from '../model/grid';
const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
export interface AssignmentContext {
  employeeId: string;
  businessDate: string;
  zoneId: string;
  templateId?: string;
}
export function AssignmentEditor({
  workspace: w,
  context,
  onClose,
}: {
  workspace: Workspace;
  context: AssignmentContext;
  onClose: () => void;
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
    w.zones.some((zone) => zone.id === draft.zoneId && zone.isActive);
  const unchanged =
    !!original &&
    original.businessDate === draft.businessDate &&
    original.templateId === draft.templateId &&
    original.zoneId === draft.zoneId;
  const valid =
    candidate.success &&
    active &&
    draft.businessDate.startsWith(w.month) &&
    !occupied &&
    !unchanged;
  function apply() {
    if (!valid || !candidate.success || !w.writable) return;
    const cleared = original
      ? setCell(w.grid, original.employeeId, original.businessDate, '')
      : w.grid;
    w.edit(setAssignment(cleared, candidate.data));
    onClose();
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <h3 className="font-semibold">{original ? t.editAssignment : t.add}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          placeholder={t.select}
          label={s.employee}
          value={draft.employeeId}
          disabled={!!original || !w.writable}
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
            .filter((zone) => zone.isActive)
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
                onClose();
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
