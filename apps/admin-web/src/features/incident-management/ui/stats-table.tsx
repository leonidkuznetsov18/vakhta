import type { IncidentStatsView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { TableCell, TableRow } from '@/components/ui/table';
import { DataTable, type Column } from '@/components/app/data-table';
import { currentLocale } from '@/i18n';

const all = messages(currentLocale());
const i = all.admin.incidents;

type StatsRow = IncidentStatsView['byReason'][number];

export function StatsTable({
  title,
  rows,
  totals,
}: {
  readonly title: string;
  readonly rows: readonly StatsRow[];
  readonly totals: IncidentStatsView['totals'];
}) {
  const columns: Column<StatsRow>[] = [
    { key: 'label', header: title, cell: (r) => r.label },
    { key: 'incidents', header: i.colIncidents, align: 'right', cell: (r) => r.incidents },
    { key: 'reports', header: i.colReports, align: 'right', cell: (r) => r.reports },
    { key: 'downtime', header: i.colDowntime, align: 'right', cell: (r) => r.downtimeMinutes },
    {
      key: 'resolution',
      header: i.colResolution,
      align: 'right',
      cell: (r) => r.avgResolutionMinutes ?? '—',
    },
    { key: 'breached', header: i.colBreached, align: 'right', cell: (r) => r.slaBreached },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.key}
      empty={all.ui.common.noResults}
      footer={
        <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
          <TableCell>{totals.label}</TableCell>
          <TableCell className="text-right">{totals.incidents}</TableCell>
          <TableCell className="text-right">{totals.reports}</TableCell>
          <TableCell className="text-right">{totals.downtimeMinutes}</TableCell>
          <TableCell className="text-right">{totals.avgResolutionMinutes ?? '—'}</TableCell>
          <TableCell className="text-right">{totals.slaBreached}</TableCell>
        </TableRow>
      }
    />
  );
}
