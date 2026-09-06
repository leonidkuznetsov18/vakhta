import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { OrgSnapshot, ReportKind, ReportTableView } from '@vakhta/contracts';
import { REPORT_KINDS } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { DownloadIcon, PrinterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback } from '@/components/app/feedback';
import { DateField } from '@/components/app/date-picker';
import { SelectField } from '@/components/app/fields';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, Toolbar } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { isUnchanged } from '@/lib/forms';
import { usePersistentState } from '@/lib/persistent-state';
import { orgApi, reportsApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';
import { DEFAULT_SERIES, ReportChart, type ChartType } from './ReportChart.tsx';

const all = messages(currentLocale());
const r = all.admin.reports;
const hints = all.ui.hints;
type Row = ReportTableView['rows'][number];
type Preset = keyof typeof r.presets;
const PRESETS = Object.keys(r.presets) as Preset[];
const TOPS = [10, 20, 50, 0] as const;

/** View options are remembered per report kind, so each report keeps its own picture. */
interface ViewOptions {
  readonly chart: ChartType;
  readonly series: readonly string[] | null;
  readonly columns: readonly string[] | null;
  readonly top: number;
}
const DEFAULT_VIEW: ViewOptions = { chart: 'bar', series: null, columns: null, top: 20 };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: Preset, today = new Date()): { from: string; to: string } | null {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (preset) {
    case 'thisMonth':
      return { from: isoDate(new Date(Date.UTC(y, m, 1))), to: isoDate(today) };
    case 'lastMonth':
      return {
        from: isoDate(new Date(Date.UTC(y, m - 1, 1))),
        to: isoDate(new Date(Date.UTC(y, m, 0))),
      };
    case 'last7':
      return { from: isoDate(new Date(today.getTime() - 6 * 86_400_000)), to: isoDate(today) };
    case 'last30':
      return { from: isoDate(new Date(today.getTime() - 29 * 86_400_000)), to: isoDate(today) };
    default:
      return null;
  }
}

function formatCell(value: string | number | null | undefined, kind: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && kind === 'minutes') {
    const h = Math.floor(value / 60);
    const min = Math.abs(value % 60);
    return `${h}:${String(min).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && kind === 'percent') return `${value}%`;
  return String(value);
}

/**
 * "Reports" (spec 9.3): six reports as a chart and a table. The planner shapes the picture on
 * screen (period presets, series, columns, top N, search) and downloads CSV/XLSX when it is right.
 */
export function ReportsPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [kind, setKind] = usePersistentState<ReportKind>('reports.kind', 'hours');
  const [siteId, setSiteId] = usePersistentState('reports.siteId', '');
  const [orgUnitId, setOrgUnitId] = usePersistentState('reports.orgUnitId', '');
  const [preset, setPreset] = usePersistentState<Preset>('reports.preset', 'thisMonth');
  const [from, setFrom] = usePersistentState(
    'reports.from',
    () => presetRange('thisMonth')?.from ?? isoDate(new Date()),
  );
  const [to, setTo] = usePersistentState('reports.to', () => isoDate(new Date()));
  const [views, setViews] = usePersistentState<Partial<Record<ReportKind, ViewOptions>>>(
    'reports.view',
    {},
  );
  const [report, setReport] = useState<ReportTableView | null>(null);
  const [builtFor, setBuiltFor] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    orgApi
      .snapshot()
      .then(setOrg)
      .catch((e: unknown) => setError(describeError(e)));
  }, []);

  const q = { ...(siteId ? { siteId } : {}), ...(orgUnitId ? { orgUnitId } : {}), from, to };
  const request = { kind, ...q };
  const unchanged = report !== null && isUnchanged(request, builtFor);

  function applyPreset(next: Preset) {
    setPreset(next);
    const range = presetRange(next);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  }

  function build(ev?: FormEvent) {
    ev?.preventDefault();
    setBusy(true);
    setError(null);
    reportsApi
      .build(kind, q)
      .then((view) => {
        setReport(view);
        setBuiltFor(request);
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  const view = views[kind] ?? DEFAULT_VIEW;
  const setView = (patch: Partial<ViewOptions>) =>
    setViews((v) => ({ ...v, [kind]: { ...(v[kind] ?? DEFAULT_VIEW), ...patch } }));

  const numeric = report?.columns.filter((c) => c.kind !== 'text' && c.kind !== 'date') ?? [];
  const series = useMemo(
    () =>
      view.series ??
      numeric.filter((c) => (DEFAULT_SERIES[kind] ?? []).includes(c.key)).map((c) => c.key),
    [view.series, numeric, kind],
  );
  const visible = useMemo(
    () => view.columns ?? report?.columns.map((c) => c.key) ?? [],
    [view.columns, report],
  );

  const units = org?.orgUnits.filter((u) => !siteId || u.siteId === siteId) ?? [];
  const shownColumns = report?.columns.filter((c) => visible.includes(c.key)) ?? [];
  const columns: Column<Row>[] = shownColumns.map((c) => ({
    key: c.key,
    header: c.label,
    align: c.kind === 'text' ? 'left' : 'right',
    sortValue: (row) => row[c.key] ?? null,
    cell: (row) => (
      <span className={c.kind === 'text' ? undefined : 'tabular-nums'}>
        {formatCell(row[c.key], c.kind)}
      </span>
    ),
  }));
  const textKeys = report?.columns.filter((c) => c.kind === 'text').map((c) => c.key) ?? [];

  /** Totals of the numeric columns: from the server when it gives them, otherwise summed here. */
  const summary = useMemo(() => {
    if (!report) return [];
    return numeric.map((c) => {
      const given = report.totals?.[c.key];
      const value =
        given !== undefined && given !== null
          ? given
          : c.kind === 'percent'
            ? null
            : report.rows.reduce((sum, row) => sum + Number(row[c.key] ?? 0), 0);
      return { column: c, value };
    });
  }, [report, numeric]);

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
            className="w-72"
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
          <SelectField
            label={r.preset}
            value={preset}
            onChange={(v) => applyPreset(v as Preset)}
            options={PRESETS.map((p) => ({ value: p, label: r.presets[p] }))}
            className="w-44"
          />
          <DateField
            label={r.from}
            value={from}
            onChange={(v) => {
              setPreset('custom');
              setFrom(v);
            }}
            className="w-44"
          />
          <DateField
            label={r.to}
            value={to}
            onChange={(v) => {
              setPreset('custom');
              setTo(v);
            }}
            className="w-44"
          />
          <Button type="submit" disabled={busy || unchanged}>
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
            {formatDateTime(report.generatedAt)} · {r.dataVersion} {report.dataVersion} ·{' '}
            {format(r.rowsCount, { n: report.rows.length })}
            <InfoTip text={hints.reportsDataVersion} />
          </Muted>

          {summary.length > 0 && (
            <Section title={r.summary} className="print:break-inside-avoid">
              <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {summary.map(({ column, value }) => (
                  <div key={column.key} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{column.label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {formatCell(value, column.kind)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <Section title={r.options} hint={hints.reportsOptions} className="print:hidden">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{r.chartType}</span>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={view.chart}
                    onValueChange={(v) => v && setView({ chart: v as ChartType })}
                    aria-label={r.chartType}
                  >
                    {(['bar', 'line', 'stacked'] as const).map((t) => (
                      <ToggleGroupItem key={t} value={t}>
                        {r.chartTypes[t]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{r.top}</span>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={String(view.top)}
                    onValueChange={(v) => v && setView({ top: Number(v) })}
                    aria-label={r.top}
                  >
                    {TOPS.map((n) => (
                      <ToggleGroupItem key={n} value={String(n)}>
                        {n === 0 ? r.topAll : `Top ${n}`}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </div>
              <OptionChips
                label={r.series}
                hint={hints.reportsSeries}
                options={numeric.map((c) => ({ key: c.key, label: c.label }))}
                selected={series}
                onChange={(next) => setView({ series: next })}
              />
              <OptionChips
                label={r.tableColumns}
                hint={hints.reportsColumns}
                options={report.columns.map((c) => ({ key: c.key, label: c.label }))}
                selected={visible}
                onChange={(next) => setView({ columns: next })}
              />
            </div>
          </Section>

          <ReportChart report={report} series={series} type={view.chart} top={view.top} />

          <DataTable
            columns={columns}
            rows={report.rows}
            rowKey={(row) => JSON.stringify(row)}
            empty={r.empty}
            storageKey={`reports.${kind}`}
            searchText={(row) => textKeys.map((k) => String(row[k] ?? '')).join(' ')}
            searchPlaceholder={r.search}
            footer={
              report.totals ? (
                <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                  {shownColumns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={c.kind === 'text' ? undefined : 'text-right tabular-nums'}
                    >
                      {formatCell(report.totals?.[c.key], c.kind)}
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

/** A row of checkbox chips: which series to draw, which columns to show. */
function OptionChips({
  label,
  hint,
  options,
  selected,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly options: readonly { key: string; label: string }[];
  readonly selected: readonly string[];
  readonly onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-sm font-medium">
        {label}
        <InfoTip text={hint} />
      </span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = selected.includes(o.key);
          return (
            <label
              key={o.key}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <Checkbox
                checked={checked}
                aria-label={o.label}
                onCheckedChange={(next) =>
                  onChange(next ? [...selected, o.key] : selected.filter((k) => k !== o.key))
                }
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
