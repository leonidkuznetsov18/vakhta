import { Trash2Icon } from 'lucide-react';
import { useConfirm } from '@/components/app/confirm-dialog';
import { useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { DataTable } from '@/components/app/data-table';
import { QueryFeedback } from '@/components/app/query-feedback';
import { keys } from '@/lib/query';
import { formatDate } from '@/lib/format';
import { scheduleApi } from '../api/schedule-api';
import { gridFromDetail, gridToItems } from '../model/grid';
import type { Workspace } from '../model/use-workspace';
import { assignmentLabel, employeeLabel } from './assignment-changes';
const t = messages(currentLocale()).scheduleWorkspace;
const s = messages(currentLocale()).admin.schedule;
function HistoryDetail({ id, workspace: w }: { id: string; workspace: Workspace }) {
  const query = useQuery({
    queryKey: keys.schedule(id),
    queryFn: ({ signal }) => scheduleApi.detail(id, signal),
  });
  const missing = [...new Set(query.data?.assignments.map((item) => item.employeeId) ?? [])].filter(
    (employeeId) => !w.employees.some((employee) => employee.id === employeeId),
  );
  const names = useQueries({
    queries: missing.map((employeeId) => ({
      queryKey: keys.employee(employeeId),
      queryFn: ({ signal }: { signal: AbortSignal }) => scheduleApi.employee(employeeId, signal),
      enabled: w.canReadEmployees,
    })),
  });
  const labels = {
    ...w,
    employees: [...w.employees, ...names.flatMap((result) => (result.data ? [result.data] : []))],
  };
  return (
    <div className="space-y-3">
      <QueryFeedback query={query} />
      {names
        .filter((result) => result.isError)
        .slice(0, 1)
        .map((result) => (
          <QueryFeedback key="names" query={result} errorMessage={t.namesUnavailable} />
        ))}
      {query.data && (
        <DataTable
          columns={[
            {
              key: 'worker',
              header: t.workers,
              cell: (item) => employeeLabel(labels, item.employeeId),
            },
            {
              key: 'assignment',
              header: t.assigned,
              cell: (item) => <span className="whitespace-normal">{assignmentLabel(w, item)}</span>,
            },
          ]}
          rows={gridToItems(gridFromDetail(query.data))}
          rowKey={(item) => `${item.employeeId}:${item.businessDate}`}
          empty={t.noAssignments}
          pageSize={10}
        />
      )}
    </div>
  );
}
export function ScheduleHistory({ workspace: w }: { workspace: Workspace }) {
  const [opened, setOpened] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  async function remove(id: string) {
    const accepted = await confirm({
      title: s.deleteVersion,
      description: format(s.deleteHistoryConfirm, {
        no: w.versions.find((version) => version.id === id)?.versionNo ?? '',
      }),
      confirmLabel: s.deleteVersion,
      destructive: true,
    });
    if (accepted !== false) w.removeHistory(id);
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t.historyHint}</p>
      <DataTable
        columns={[
          { key: 'version', header: t.version, cell: (version) => `v${version.versionNo}` },
          { key: 'status', header: t.status, cell: (version) => s.statuses[version.status] },
          {
            key: 'date',
            header: t.date,
            cell: (version) => formatDate(version.publishedAt ?? version.createdAt),
          },
        ]}
        rows={w.versions}
        rowKey={(version) => version.id}
        empty={t.empty}
        storageKey="schedule.history"
        rowActions={(version) =>
          w.rights.edit && version.status === 'SUPERSEDED' && version.deletable
            ? [
                {
                  key: 'delete',
                  label: s.deleteVersion,
                  icon: Trash2Icon,
                  destructive: true,
                  disabled: w.busy,
                  onSelect: () => void remove(version.id),
                },
              ]
            : []
        }
        onRowClick={(version) => setOpened(opened === version.id ? null : version.id)}
        expanded={(version) =>
          opened === version.id ? <HistoryDetail id={version.id} workspace={w} /> : null
        }
      />
      {dialog}
    </div>
  );
}
