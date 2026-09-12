import { templateLabel } from '../lib/template-label';
import { useState } from 'react';
import { messages } from '@vakhta/i18n';
import { monthDates } from '@vakhta/domain';
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
import { Checkbox } from '@/components/ui/checkbox';
import { SelectField } from '@/components/app/fields';
import { DateField } from '@/components/app/date-picker';
import { TableSearch } from '@/shared/ui/table-search';
import type { Workspace } from '../model/use-workspace';
import { batchPreview, type BatchInput } from '../model/planning';
import { ROTATION_PATTERNS } from '../model/grid';
import { AssignmentChanges } from './assignment-changes';
const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
export function BatchPlanner({
  workspace: w,
  zoneId,
  date,
  onClose,
}: {
  workspace: Workspace;
  zoneId: string;
  date: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [input, setInput] = useState<BatchInput>({
    employeeIds: w.preset?.people.map((person) => person.id) ?? [],
    zoneId,
    from: date,
    to: date,
    pattern: 'SINGLE',
    templateId: '',
    mode: 'fill',
  });
  const [review, setReview] = useState(false);
  const active = w.employees.filter((employee) => employee.status === 'ACTIVE');
  const visible = active.filter((employee) =>
    `${employee.fullName} ${employee.personnelNumber}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const validPeople = input.employeeIds.every((id) =>
    active.some((employee) => employee.id === id),
  );
  const result =
    validPeople && w.zones.some((zone) => zone.id === input.zoneId && zone.isActive)
      ? batchPreview(w.grid, input, w.month, w.templates)
      : null;
  function update(next: Partial<BatchInput>) {
    setInput({ ...input, ...next });
    setReview(false);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t.add}</DialogTitle>
          <DialogDescription>{t.batchHint}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
          {!review && (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="min-w-0 space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {t.selectedPeople}: {input.employeeIds.length}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!input.employeeIds.length}
                    onClick={() => update({ employeeIds: [] })}
                  >
                    {t.clearPeople}
                  </Button>
                </div>
                <TableSearch value={search} onChange={setSearch} label={t.workerSearch} />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!visible.some((employee) => !input.employeeIds.includes(employee.id))}
                  onClick={() =>
                    update({
                      employeeIds: [
                        ...new Set([
                          ...input.employeeIds,
                          ...visible.map((employee) => employee.id),
                        ]),
                      ],
                    })
                  }
                >
                  {t.allPeople}
                </Button>
                <div className="max-h-56 overflow-y-auto space-y-1 rounded-md border p-1">
                  {visible.map((employee) => (
                    <label
                      key={employee.id}
                      className="flex min-h-11 items-center gap-3 rounded-md p-2 text-sm hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={input.employeeIds.includes(employee.id)}
                        onCheckedChange={(checked) =>
                          update({
                            employeeIds: checked
                              ? [...input.employeeIds, employee.id]
                              : input.employeeIds.filter((id) => id !== employee.id),
                          })
                        }
                      />
                      <span className="min-w-0 break-words">{employee.fullName}</span>
                    </label>
                  ))}
                </div>
              </section>
              <section className="space-y-3 rounded-lg border p-3">
                <SelectField
                  placeholder={t.select}
                  label={t.zone}
                  value={input.zoneId}
                  onChange={(value) => update({ zoneId: value })}
                  options={w.zones
                    .filter((zone) => zone.isActive)
                    .map((zone) => ({ value: zone.id, label: zone.name }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <DateField
                    minDate={`${w.month}-01`}
                    maxDate={monthDates(w.month).at(-1)}
                    label={t.from}
                    value={input.from}
                    onChange={(value) => update({ from: value })}
                  />
                  <DateField
                    minDate={`${w.month}-01`}
                    maxDate={monthDates(w.month).at(-1)}
                    label={t.to}
                    value={input.to}
                    onChange={(value) => update({ to: value })}
                  />
                </div>
                <SelectField
                  placeholder={t.select}
                  label={t.pattern}
                  value={input.pattern}
                  onChange={(value) => {
                    const pattern = ['SINGLE' as const, ...ROTATION_PATTERNS].find(
                      (item) => item === value,
                    );
                    if (pattern)
                      update({
                        pattern,
                        ...(pattern !== 'SINGLE' && input.from === input.to
                          ? { to: monthDates(w.month).at(-1) ?? input.to }
                          : {}),
                      });
                  }}
                  options={[
                    { value: 'SINGLE', label: t.single },
                    ...ROTATION_PATTERNS.map((pattern) => ({
                      value: pattern,
                      label: s.patterns[pattern],
                    })),
                  ]}
                />
                {input.pattern === 'SINGLE' && (
                  <SelectField
                    placeholder={t.select}
                    label={t.template}
                    value={input.templateId}
                    onChange={(value) => update({ templateId: value })}
                    options={w.templates
                      .filter((template) => template.isActive)
                      .map((template) => ({
                        value: template.id,
                        label: `${templateLabel(template.code, t)} · ${template.localStart}–${template.localEnd}`,
                      }))}
                  />
                )}
                <SelectField
                  placeholder={t.select}
                  label={t.batchMode}
                  value={input.mode}
                  onChange={(value) => {
                    if (value === 'fill' || value === 'replace') update({ mode: value });
                  }}
                  options={[
                    { value: 'fill', label: t.fill },
                    { value: 'replace', label: t.replace },
                  ]}
                />
              </section>
            </div>
          )}
          {!result && <p className="text-sm text-muted-foreground">{t.invalid}</p>}
          {review && result && <AssignmentChanges changes={result.changes} labels={w} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => (review ? setReview(false) : onClose())}>
            {review ? t.editSelection : t.cancel}
          </Button>
          {review ? (
            <Button
              disabled={!result?.changes.length || !w.writable}
              onClick={() => {
                if (result?.changes.length && w.writable) {
                  w.edit(result.grid);
                  onClose();
                }
              }}
            >
              {t.apply}
            </Button>
          ) : (
            <Button
              disabled={!result?.changes.length || !w.writable}
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
