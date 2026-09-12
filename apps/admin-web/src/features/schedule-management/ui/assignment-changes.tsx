import { templateLabel } from '../lib/template-label';
import type { AssignmentInput, EmployeeView, ShiftTemplateView, ZoneView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { DataTable } from '@/components/app/data-table';
import { Badge } from '@/components/ui/badge';
import type { AssignmentChange } from '../model/grid';
const t = messages(currentLocale()).scheduleWorkspace;
export interface ScheduleLabels {
  employees: readonly EmployeeView[];
  templates: readonly ShiftTemplateView[];
  zones: readonly ZoneView[];
}
export function employeeLabel(labels: ScheduleLabels, id: string) {
  return (
    labels.employees.find((item) => item.id === id)?.fullName ??
    `${t.unknownEmployee} · ${id.slice(-6)}`
  );
}
export function assignmentLabel(labels: ScheduleLabels, item?: AssignmentInput) {
  if (!item) return '—';
  const template = labels.templates.find((value) => value.id === item.templateId);
  const zone = labels.zones.find((value) => value.id === item.zoneId);
  return `${item.businessDate} · ${template ? templateLabel(template.code, t) : t.unknownTemplate} · ${zone?.name ?? t.noZone}`;
}
export function AssignmentChanges({
  changes,
  labels,
}: {
  changes: readonly AssignmentChange[];
  labels: ScheduleLabels;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="status">
        {(['added', 'removed', 'changed'] as const).map((type) => (
          <Badge key={type} variant="secondary">
            {t[type]}: {changes.filter((change) => change.type === type).length}
          </Badge>
        ))}
        <Badge variant="outline">
          {t.workers}:{' '}
          {
            new Set(changes.map((change) => change.after?.employeeId ?? change.before?.employeeId))
              .size
          }
        </Badge>
      </div>
      <DataTable
        columns={[
          {
            key: 'employee',
            header: t.workers,
            cell: (change) =>
              employeeLabel(labels, change.after?.employeeId ?? change.before?.employeeId ?? ''),
          },
          {
            key: 'before',
            header: t.before,
            cell: (change) => (
              <span className="whitespace-normal break-words">
                {assignmentLabel(labels, change.before)}
              </span>
            ),
          },
          {
            key: 'after',
            header: t.after,
            cell: (change) => (
              <span className="whitespace-normal break-words">
                {assignmentLabel(labels, change.after)}
              </span>
            ),
          },
        ]}
        rows={changes}
        rowKey={(change) => change.key}
        empty={t.unchanged}
        pageSize={10}
      />
    </div>
  );
}
