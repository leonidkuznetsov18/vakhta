import type { AcknowledgementStatusView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { DataTable, type Column } from '@/components/app/data-table';
import { Muted, StatusPill } from '@/components/app/page';
import { currentLocale } from '../i18n.tsx';

const t = messages(currentLocale());

/** Who acknowledged the published version (FR-SCH-03). */
export function AckTable({ rows }: { readonly rows: readonly AcknowledgementStatusView[] }) {
  const s = t.admin.schedule;
  const columns: Column<AcknowledgementStatusView>[] = [
    {
      key: 'employee',
      header: s.employee,
      cell: (r) => (
        <span>
          {r.fullName} <Muted>{r.personnelNumber}</Muted>
        </span>
      ),
    },
    { key: 'shifts', header: s.shifts, align: 'right', cell: (r) => r.assignments },
    {
      key: 'ack',
      header: s.acknowledged,
      align: 'right',
      cell: (r) => (
        <StatusPill tone={r.acknowledged >= r.assignments ? 'success' : 'warning'}>
          {r.acknowledged}/{r.assignments}
        </StatusPill>
      ),
    },
    {
      key: 'telegram',
      header: 'Telegram',
      cell: (r) => (r.telegramLinked ? t.ui.common.yes : <Muted>{t.ui.common.no}</Muted>),
    },
  ];
  return (
    <DataTable columns={columns} rows={rows} rowKey={(r) => r.employeeId} empty={s.emptyGrid} />
  );
}
