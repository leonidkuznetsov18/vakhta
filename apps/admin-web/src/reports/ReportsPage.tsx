import { useEffect, useMemo, useState } from 'react';
import type { LossesQuery, LossesView, OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ArrowLeftIcon, DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/app/data-table';
import { DateField } from '@/components/app/date-picker';
import { Feedback, useAction } from '@/components/app/feedback';
import { SelectField } from '@/components/app/fields';
import { HowItWorks } from '@/components/app/how-it-works';
import { InfoTip } from '@/components/app/info-tip';
import { Muted, Section, StatusPill, Toolbar } from '@/components/app/page';
import { usePersistentState } from '@/lib/persistent-state';
import { formatDateTime, formatDuration } from '@/lib/format';
import { reportsApi, orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const r = all.admin.reports;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthStart(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

type Bar_ = LossesView['bars'][number];
type Interval = LossesView['intervals'][number];

/**
 * The Pareto zones, and the whole point of the colour: red is the vital few that make up the first
 * 80% of the lost time, amber is what comes after them, grey is the tail that can wait. One bar
 * colour would have said only "these are bars"; this says where to start.
 */
const ZONES = ['vital', 'next', 'tail'] as const;
type Zone = (typeof ZONES)[number];
const ZONE_FILL: Record<Zone, string> = {
  vital: 'var(--chart-4)',
  next: 'var(--chart-2)',
  tail: 'var(--muted-foreground)',
};
/** `cumulative` is a share of one, not a percentage. */
function zoneOf(cumulative: number): Zone {
  if (cumulative <= 0.8) return 'vital';
  return cumulative <= 0.95 ? 'next' : 'tail';
}

/**
 * "Time losses" — the one report (2026-09-09).
 *
 * A Pareto of the time a shift did not spend on its main work: categories ranked by how much they
 * took, with the running share that shows which two or three make up most of it. Choosing a bar
 * opens the reasons recorded inside that category, and under them the intervals themselves.
 *
 * It ranks losses, it does not price them: what an hour of handover costs in output is not in this
 * system. And it is only as honest as the reasons people record, so the share of explained minutes
 * sits next to the totals rather than in a footnote.
 */
export function ReportsPage() {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [from, setFrom] = usePersistentState('losses.from', monthStart);
  const [to, setTo] = usePersistentState('losses.to', today);
  const [siteId, setSiteId] = usePersistentState('losses.siteId', '');
  const [orgUnitId, setOrgUnitId] = usePersistentState('losses.orgUnitId', '');
  const [category, setCategory] = useState<string | null>(null);
  const [data, setData] = useState<LossesView | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    orgApi
      .snapshot()
      .then(setOrg)
      .catch(() => undefined);
  }, []);

  const query: LossesQuery = useMemo(
    () => ({
      from,
      to,
      ...(siteId ? { siteId } : {}),
      ...(orgUnitId ? { orgUnitId } : {}),
      ...(category ? { category } : {}),
    }),
    [from, to, siteId, orgUnitId, category],
  );

  useEffect(() => {
    void run(async () => setData(await reportsApi.losses(query)));
  }, [query]);

  const bars = data?.bars ?? [];
  const chart = bars.map((b) => ({
    ...b,
    minutes: b.minutes,
    // The zone is taken before the share becomes a percentage: the axis wants 0…100, the colour
    // rule is written against 0…1, and reading one as the other painted every bar the same.
    zone: zoneOf(b.cumulative),
    cumulative: Math.round(b.cumulative * 100),
  }));
  const config: ChartConfig = {
    minutes: { label: r.lossMinutes, color: 'var(--chart-4)' },
    cumulative: { label: r.lossCumulative, color: 'var(--foreground)' },
  };
  // Everything up to the 80% line is what to fix first; the tail is noise until that is done.
  const vital = (b: Bar_) => b.cumulative <= 0.8;

  const barColumns: Column<Bar_>[] = [
    {
      key: 'label',
      header: category ? r.lossReason : r.lossCategory,
      cell: (b) => (
        <span className="flex items-center gap-2">
          {b.label}
          {vital(b) && <StatusPill tone="danger">80%</StatusPill>}
        </span>
      ),
      sortValue: (b) => b.label,
    },
    {
      key: 'minutes',
      header: r.lossMinutes,
      align: 'right',
      cell: (b) => <span className="font-semibold tabular-nums">{b.minutes}</span>,
      sortValue: (b) => b.minutes,
    },
    {
      key: 'share',
      header: r.lossShare,
      align: 'right',
      cell: (b) => <span className="tabular-nums">{Math.round(b.share * 100)}%</span>,
      sortValue: (b) => b.share,
    },
    {
      key: 'cumulative',
      header: r.lossCumulative,
      align: 'right',
      cell: (b) => <span className="tabular-nums">{Math.round(b.cumulative * 100)}%</span>,
      sortValue: (b) => b.cumulative,
    },
    {
      key: 'intervals',
      header: r.lossIntervals,
      align: 'right',
      cell: (b) => <span className="tabular-nums">{b.intervals}</span>,
      sortValue: (b) => b.intervals,
    },
    {
      key: 'employees',
      header: r.lossEmployees,
      align: 'right',
      cell: (b) => <span className="tabular-nums">{b.employees}</span>,
      sortValue: (b) => b.employees,
    },
  ];

  const intervalColumns: Column<Interval>[] = [
    {
      key: 'date',
      header: r.lossDate,
      cell: (i) => i.businessDate,
      sortValue: (i) => i.businessDate,
    },
    {
      key: 'employee',
      header: r.lossEmployee,
      cell: (i) => (
        <span>
          {i.employeeName} <Muted>{i.orgUnitName ?? ''}</Muted>
        </span>
      ),
      sortValue: (i) => i.employeeName,
    },
    { key: 'zone', header: r.lossZone, cell: (i) => i.zoneName ?? <Muted>—</Muted> },
    {
      key: 'reason',
      header: r.lossReason,
      cell: (i) => i.reasonLabel ?? <Muted>{r.lossNoReason}</Muted>,
    },
    {
      key: 'from',
      header: r.lossFrom,
      cell: (i) => <span className="tabular-nums">{formatDateTime(i.startedAt)}</span>,
      sortValue: (i) => i.startedAt,
    },
    {
      key: 'minutes',
      header: r.lossMinutes,
      align: 'right',
      cell: (i) => <span className="font-semibold tabular-nums">{i.minutes}</span>,
      sortValue: (i) => i.minutes,
    },
    { key: 'comment', header: r.lossComment, cell: (i) => i.comment ?? <Muted>—</Muted> },
  ];

  const units = org?.orgUnits.filter((u) => !siteId || u.siteId === siteId) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="reports" />
      <Toolbar>
        <DateField label={r.from} value={from} onChange={setFrom} className="w-44" />
        <DateField label={r.to} value={to} onChange={setTo} className="w-44" />
        <SelectField
          label={r.site}
          value={siteId}
          onChange={(v) => {
            setSiteId(v);
            setOrgUnitId('');
          }}
          placeholder="—"
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-52"
        />
        <SelectField
          label={r.orgUnit}
          value={orgUnitId}
          onChange={setOrgUnitId}
          placeholder="—"
          options={units.map((u) => ({ value: u.id, label: u.name }))}
          className="w-52"
        />
        <div className="flex items-end gap-1">
          <Button asChild variant="outline">
            <a href={reportsApi.lossesExportUrl(query, 'csv')} target="_blank" rel="noreferrer">
              <DownloadIcon aria-hidden="true" />
              {r.exportCsv}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={reportsApi.lossesExportUrl(query, 'xlsx')} target="_blank" rel="noreferrer">
              <DownloadIcon aria-hidden="true" />
              {r.exportXlsx}
            </a>
          </Button>
        </div>
      </Toolbar>
      <Feedback error={error ? describeError(error) : null} />

      <Section title={r.lossTitle} hint={r.lossPurpose}>
        {/* The way out of a category sits above everything the category changed, not under the
            tables it opened: a reader who drilled in should not hunt for it. */}
        {category && (
          <div>
            <Button type="button" variant="outline" onClick={() => setCategory(null)}>
              <ArrowLeftIcon aria-hidden="true" />
              {r.lossBack}
            </Button>
          </div>
        )}
        <dl className="mb-4 grid gap-3 sm:grid-cols-3">
          <Tile label={r.lossTotal} value={formatDuration(data?.totalMinutes ?? 0)} />
          <Tile label={r.lossLost} value={formatDuration(data?.lostMinutes ?? 0)} tone="warning" />
          <Tile
            label={r.lossExplained}
            value={`${Math.round((data?.explainedShare ?? 0) * 100)}%`}
            hint={r.lossExplainedHint}
            tone={(data?.explainedShare ?? 0) < 0.5 ? 'danger' : undefined}
          />
        </dl>

        {bars.length === 0 ? (
          <Muted>{r.lossEmpty}</Muted>
        ) : (
          <>
            <ChartContainer config={config} className="mb-4 h-64 w-full">
              <ComposedChart data={chart} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  interval={0}
                />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} width={40} fontSize={11} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  fontSize={11}
                  unit="%"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar yAxisId="left" dataKey="minutes" radius={4} maxBarSize={72}>
                  {chart.map((b) => (
                    <Cell
                      key={b.key}
                      fill={ZONE_FILL[b.zone]}
                      cursor="pointer"
                      onClick={() => !category && setCategory(b.key)}
                    />
                  ))}
                </Bar>
                {/* The cumulative share is a reference, not a series: black keeps the hues free
                    to mean the zones. */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulative"
                  stroke="var(--foreground)"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ChartContainer>
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {ZONES.map((zone) => (
                <span key={zone} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ background: ZONE_FILL[zone] }}
                  />
                  {r.lossZones[zone]}
                </span>
              ))}
            </div>
            <DataTable
              columns={barColumns}
              rows={bars}
              storageKey={category ? 'losses-reasons' : 'losses-categories'}
              rowKey={(b) => b.key}
              {...(category ? {} : { onRowClick: (b: Bar_) => setCategory(b.key) })}
              empty={r.lossEmpty}
              loading={busy && bars.length === 0}
            />
          </>
        )}
      </Section>

      {category ? (
        <Section title={`${r.lossIntervals}: ${data?.categoryLabel ?? ''}`}>
          <DataTable
            columns={intervalColumns}
            rows={data?.intervals ?? []}
            storageKey="losses-intervals"
            rowKey={(i) => i.id}
            searchText={(i) => `${i.employeeName} ${i.orgUnitName ?? ''} ${i.reasonLabel ?? ''}`}
            empty={r.lossEmpty}
          />
        </Section>
      ) : (
        <Muted>{r.lossPickCategory}</Muted>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  readonly label: string;
  readonly value: number | string;
  readonly hint?: string;
  readonly tone?: 'warning' | 'danger';
}) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {hint ? <InfoTip text={hint} /> : null}
      </dt>
      <dd
        className={
          tone === 'danger'
            ? 'text-2xl font-semibold text-red-700 tabular-nums dark:text-red-300'
            : tone === 'warning'
              ? 'text-2xl font-semibold text-amber-700 tabular-nums dark:text-amber-300'
              : 'text-2xl font-semibold tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  );
}
