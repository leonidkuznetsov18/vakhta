import type { IncidentStatsView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { DataTable, type Column } from '@/components/app/data-table';
import { currentLocale } from '@/i18n';

const all = messages(currentLocale());
const i = all.admin.incidents;

type StatsRow = IncidentStatsView['byReason'][number];

export function StatsTable({
  title,
  storageKey,
  resetKey,
  rows,
  totals,
}: {
  readonly title: string;
  readonly storageKey: string;
  readonly resetKey: string;
  readonly rows: readonly StatsRow[];
  readonly totals: IncidentStatsView['totals'];
}) {
  const columns: Column<StatsRow>[] = [
    { key: 'label', header: title, cell: (r) => r.label, sortValue: (r) => r.label },
    {
      key: 'incidents',
      header: i.colIncidents,
      align: 'right',
      cell: (r) => r.incidents,
      sortValue: (r) => r.incidents,
    },
    {
      key: 'reports',
      header: i.colReports,
      align: 'right',
      cell: (r) => r.reports,
      sortValue: (r) => r.reports,
    },
    {
      key: 'downtime',
      header: i.colDowntime,
      align: 'right',
      cell: (r) => r.downtimeMinutes,
      sortValue: (r) => r.downtimeMinutes,
    },
    {
      key: 'resolution',
      header: i.colResolution,
      align: 'right',
      cell: (r) => r.avgResolutionMinutes ?? '—',
      sortValue: (r) => r.avgResolutionMinutes,
    },
    {
      key: 'breached',
      header: i.colBreached,
      align: 'right',
      cell: (r) => r.slaBreached,
      sortValue: (r) => r.slaBreached,
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.key}
      empty={all.ui.common.noResults}
      storageKey={storageKey}
      resetKey={resetKey}
      caption={title}
      summary={columns
        .filter((column) => column.key !== 'label')
        .map((column) => ({
          label: typeof column.header === 'string' ? column.header : column.key,
          value: column.cell(totals),
        }))}
    />
  );
}
