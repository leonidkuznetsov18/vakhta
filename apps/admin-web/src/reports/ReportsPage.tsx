import { useEffect, useState, type FormEvent } from 'react';
import type { OrgSnapshot, ReportKind, ReportTableView } from '@vakhta/contracts';
import { REPORT_KINDS } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { DateField } from '@/components/app/date-picker';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Toolbar } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { orgApi, reportsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { usePersistentState } from '@/lib/persistent-state';
import { ReportChart } from './ReportChart.tsx';
import { PrinterIcon } from 'lucide-react';

const all = messages(currentLocale());
const r = all.admin.reports;
const hints = all.ui.hints;
type Row = ReportTableView['rows'][number];

function monthStart(): string {
  const d = new Date();
  return `${d.toISOString().slice(0, 7)}-01`;
}

/** "Reports" (spec 9.3): six reports as tables, CSV/XLSX with a data version. */
export function ReportsPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [kind, setKind] = usePersistentState<ReportKind>('reports.kind', 'hours');
  const [siteId, setSiteId] = usePersistentState('reports.siteId', '');
  const [orgUnitId, setOrgUnitId] = usePersistentState('reports.orgUnitId', '');
  const [from, setFrom] = usePersistentState('reports.from', monthStart);
  const [to, setTo] = usePersistentState('reports.to', () => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportTableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    orgApi
      .snapshot()
      .then(setOrg)
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const q = { ...(siteId ? { siteId } : {}), ...(orgUnitId ? { orgUnitId } : {}), from, to };

  function build(ev?: FormEvent) {
    ev?.preventDefault();
    setBusy(true);
    setError(null);
    reportsApi
      .build(kind, q)
      .then(setReport)
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  const units = org?.orgUnits.filter((u) => !siteId || u.siteId === siteId) ?? [];
  const columns: Column<Row>[] = (report?.columns ?? []).map((c) => ({
    key: c.key,
    header: c.label,
    align: c.kind === 'text' ? 'left' : 'right',
    cell: (row) => (
      <span className={c.kind === 'text' ? undefined : 'tabular-nums'}>{row[c.key] ?? '—'}</span>
    ),
  }));

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={build}>
        <Toolbar>
          <SelectField
            label={all.admin.sections.reports}
            hint={hints.reportsKind}
            value={kind}
            onChange={(v) => setKind(v as ReportKind)}
            options={REPORT_KINDS.map((k) => ({ value: k, label: r.kinds[k] }))}
            className="w-80"
          />
          <SelectField
            label={r.site}
            value={siteId}
            onChange={setSiteId}
            placeholder="—"
            options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
            className="w-48"
          />
          <SelectField
            label={r.orgUnit}
            value={orgUnitId}
            onChange={setOrgUnitId}
            placeholder="—"
            options={units.map((u) => ({ value: u.id, label: u.name }))}
            className="w-48"
          />
          <DateField label={r.from} value={from} onChange={setFrom} className="w-44" />
          <DateField label={r.to} value={to} onChange={setTo} className="w-44" />
          <Button type="submit" disabled={busy}>
            {r.build}
          </Button>
          {report && (
            <div className="flex items-center gap-1">
              <Button asChild variant="outline">
                <a href={reportsApi.exportUrl(kind, q, 'csv')} target="_blank" rel="noreferrer">
                  <DownloadIcon aria-hidden="true" />
                  {r.exportCsv}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={reportsApi.exportUrl(kind, q, 'xlsx')} target="_blank" rel="noreferrer">
                  <DownloadIcon aria-hidden="true" />
                  {r.exportXlsx}
                </a>
              </Button>
              <InfoTip text={hints.reportsExport} />
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <PrinterIcon aria-hidden="true" />
                {all.ui.common.print}
              </Button>
            </div>
          )}
        </Toolbar>
      </form>
      <Feedback error={error} />
      {report && (
        <>
          <Muted className="flex flex-wrap items-center gap-1">
            {report.title} · {report.from} – {report.to} · {r.generatedAt}{' '}
            {formatDateTime(report.generatedAt)} · {r.dataVersion} {report.dataVersion}
            <InfoTip text={hints.reportsDataVersion} />
          </Muted>
          <ReportChart report={report} />
          <DataTable
            columns={columns}
            rows={report.rows}
            rowKey={(row) => JSON.stringify(row)}
            empty={r.empty}
            footer={
              report.totals ? (
                <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                  {report.columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={c.kind === 'text' ? undefined : 'text-right tabular-nums'}
                    >
                      {report.totals?.[c.key] ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
