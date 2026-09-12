import type { IncidentStatsView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { DataTable, type Column } from '@/components/app/data-table';
import { formatDuration } from '@/lib/format';
import { currentLocale } from '@/i18n';

const all = messages(currentLocale());
const i = all.admin.incidents;

type StatsRow = IncidentStatsView['byReason'][number];

export function StatsTable({
  title,
  storageKey,
  resetKey,
  rows,
}: {
  readonly title: string;
  readonly storageKey: string;
  readonly resetKey: string;
  readonly rows: readonly StatsRow[];
}) {
  const columns: Column<StatsRow>[] = [
    {
      key: 'label',
      header: title,
      minWidth: '14rem',
      className: 'w-full',
      cell: (r) => (
        <span className="block max-w-md whitespace-normal [overflow-wrap:anywhere]">{r.label}</span>
      ),
      sortValue: (r) => r.label,
    },
    {
      key: 'incidents',
      header: i.colIncidents,
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      cell: (r) => r.incidents,
      sortValue: (r) => r.incidents,
    },
    {
      key: 'reports',
      header: i.colReports,
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      cell: (r) => r.reports,
      sortValue: (r) => r.reports,
    },
    {
      key: 'downtime',
      header: i.downtimeLabel,
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      cell: (r) => formatDuration(r.downtimeMinutes),
      sortValue: (r) => r.downtimeMinutes,
    },
    {
      key: 'resolution',
      header: i.resolutionLabel,
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      cell: (r) => (r.avgResolutionMinutes === null ? '—' : formatDuration(r.avgResolutionMinutes)),
      sortValue: (r) => r.avgResolutionMinutes,
    },
    {
      key: 'breached',
      header: i.colBreached,
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
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
      primaryKey="label"
      searchText={(row) => row.label}
    />
  );
}
