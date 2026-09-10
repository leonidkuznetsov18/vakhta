import { QueryFeedback } from '@/components/app/query-feedback';
import { useQuery } from '@tanstack/react-query';
import type { BonusHistoryView, BonusPointsView, PointAwardKind } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/app/data-table';
import { DateField } from '@/components/app/date-picker';
import { MonthField } from '@/components/app/date-picker';
import { FormField, SelectField } from '@/components/app/fields';
import { Muted, Section, StatusPill, Toolbar } from '@/components/app/page';
import { HowItWorks } from '@/components/app/how-it-works';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DownloadIcon } from 'lucide-react';
import { usePersistentState } from '@/lib/ui-store';
import { useOrg } from '@/lib/org';
import { keys } from '@/lib/query';
import { bonusApi, type BonusHistoryFilters } from '../api.ts';
import { currentLocale } from '../i18n.tsx';

import { nominationStatus } from './nomination-status.ts';

const all = messages(currentLocale());
const b = all.admin.bonus;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

type PointsRow = BonusPointsView['employees'][number];

/**
 * "Бонус" (2026-09-08): read-only points. A point has exactly one cause — a checklist the shift
 * master approved — so the page just shows who has how many, with a chart and a table. Nothing is
 * scored, adjusted or closed here: points are earned in the bot and confirmed at the zone handover.
 */
export function BonusPage() {
  const { org, queryState: orgQuery } = useOrg();
  const [siteId, setSiteId] = usePersistentState('bonus.siteId', '');
  const [month, setMonth] = usePersistentState('bonus.month', currentMonth);
  const [unitId, setUnitId] = usePersistentState('bonus.unitId', '');
  const [tab, setTab] = usePersistentState<'points' | 'history'>('bonus.tab', 'points');
  const [groupBy, setGroupBy] = usePersistentState<'day' | 'month' | 'year'>(
    'bonus.groupBy',
    'month',
  );
  const [from, setFrom] = usePersistentState('bonus.from', `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = usePersistentState('bonus.to', new Date().toISOString().slice(0, 10));
  const [kind, setKind] = usePersistentState<'' | PointAwardKind>('bonus.kind', '');
  const [search, setSearch] = usePersistentState('bonus.search', '');

  // With one site there is nothing to choose: the page opens on it instead of on an empty filter.
  const site = siteId || (org?.sites[0]?.id ?? '');
  const points = useQuery({
    queryKey: keys.bonusPoints({ site, month }),
    queryFn: () => bonusApi.points(site, month),
    enabled: site !== '',
  });
  const data = points.data ?? null;
  const nominationsStatus = nominationStatus(data, currentLocale());

  const filters: BonusHistoryFilters = {
    from,
    to,
    groupBy,
    ...(site ? { siteId: site } : {}),
    ...(unitId ? { orgUnitId: unitId } : {}),
    ...(kind ? { kind } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const historyQuery = useQuery({
    queryKey: keys.bonusHistory(filters),
    queryFn: () => bonusApi.history(filters),
    enabled: tab === 'history',
  });
  const history = historyQuery.data ?? null;

  const everyone = data?.employees ?? [];
  const rows = unitId ? everyone.filter((r) => r.orgUnitId === unitId) : everyone;
  const units = data?.units ?? [];
  const totalPoints = rows.reduce((s, r) => s + r.points, 0);
  const totalApproved = rows.reduce((s, r) => s + r.approved, 0);
  const totalRemarks = rows.reduce((s, r) => s + r.remarks, 0);

  const top = rows.filter((r) => r.points > 0).slice(0, 10);
  const chartConfig: ChartConfig = { points: { label: b.points, color: 'var(--chart-1)' } };
  // A colour per unit, so the chart shows at a glance which unit a person belongs to.
  const unitColour = new Map<string, string>();
  units.forEach((u, i) => unitColour.set(u.orgUnitId ?? '', `var(--chart-${(i % 8) + 1})`));
  const chartData = top.map((r) => ({
    name: r.employeeName,
    points: r.points,
    fill: unitColour.get(r.orgUnitId ?? '') ?? 'var(--chart-1)',
  }));

  const historyColumns: Column<BonusHistoryView['buckets'][number]>[] = [
    { key: 'key', header: b.historyPeriod, cell: (r) => r.key },
    {
      key: 'points',
      header: b.historyPoints,
      align: 'right',
      cell: (r) => <span className="font-semibold tabular-nums">{r.points}</span>,
    },
    {
      key: 'checklists',
      header: b.historyChecklists,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.checklistPoints}</span>,
    },
    {
      key: 'awards',
      header: b.historyAwards,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.awardPoints}</span>,
    },
    {
      key: 'employees',
      header: b.historyEmployees,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.employees}</span>,
    },
    {
      key: 'units',
      header: b.historyUnits,
      cell: (r) =>
        r.units.length > 0 ? (
          <span className="whitespace-normal">{r.units.join(', ')}</span>
        ) : (
          <Muted>{b.noUnit}</Muted>
        ),
    },
  ];

  const entryColumns: Column<BonusHistoryView['entries'][number]>[] = [
    {
      key: 'date',
      header: b.historyDate,
      cell: (r) => r.businessDate ?? r.month,
      sortValue: (r) => r.businessDate ?? `${r.month}-01`,
    },
    {
      key: 'employee',
      header: b.employee,
      cell: (r) => (
        <span>
          {r.employeeName} <Muted>{r.personnelNumber}</Muted>
        </span>
      ),
      sortValue: (r) => r.employeeName,
    },
    {
      key: 'unit',
      header: b.unit,
      cell: (r) => r.orgUnitName ?? <Muted>{b.noUnit}</Muted>,
      sortValue: (r) => r.orgUnitName ?? '',
    },
    {
      key: 'reason',
      header: b.historyReason,
      cell: (r) =>
        r.kind === 'CHECKLIST_APPROVED' ? (
          b.historyKinds[r.kind]
        ) : (
          <StatusPill tone="success">{b.historyKinds[r.kind]}</StatusPill>
        ),
      sortValue: (r) => b.historyKinds[r.kind] ?? r.kind,
    },
    {
      key: 'points',
      header: b.points,
      align: 'right',
      cell: (r) => <span className="font-semibold tabular-nums">{r.points}</span>,
      sortValue: (r) => r.points,
    },
  ];

  const columns: Column<PointsRow>[] = [
    {
      key: 'employee',
      header: b.employee,
      cell: (r) => (
        <span>
          {r.employeeName} <Muted>{r.personnelNumber}</Muted>
        </span>
      ),
      sortValue: (r) => r.employeeName,
    },
    {
      key: 'unit',
      header: b.unit,
      cell: (r) => r.orgUnitName ?? <Muted>{b.noUnit}</Muted>,
      sortValue: (r) => r.orgUnitName ?? '',
    },
    {
      key: 'shifts',
      header: b.shifts,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.shifts}</span>,
      sortValue: (r) => r.shifts,
    },
    {
      key: 'checklists',
      header: b.checklists,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.checklists}</span>,
      sortValue: (r) => r.checklists,
    },
    {
      key: 'approved',
      header: b.approved,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{r.approved}</span>,
      sortValue: (r) => r.approved,
    },
    {
      key: 'remarks',
      header: b.remarks,
      align: 'right',
      cell: (r) =>
        r.remarks > 0 ? (
          <StatusPill tone="warning">{r.remarks}</StatusPill>
        ) : (
          <span className="tabular-nums">0</span>
        ),
      sortValue: (r) => r.remarks,
    },
    {
      key: 'points',
      header: b.points,
      align: 'right',
      cell: (r) => <span className="font-semibold tabular-nums">{r.points}</span>,
      sortValue: (r) => r.points,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <HowItWorks guide="bonus" />
      <QueryFeedback query={orgQuery} />
      <Toolbar>
        <SelectField
          label={b.site}
          value={site}
          onChange={setSiteId}
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-56"
        />
        <SelectField
          label={b.unit}
          value={unitId}
          onChange={setUnitId}
          placeholder="—"
          options={units
            .filter((u) => u.orgUnitId !== null)
            .map((u) => ({ value: u.orgUnitId as string, label: u.orgUnitName ?? '' }))}
          className="w-56"
        />
      </Toolbar>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'points' | 'history')} className="gap-4">
        <TabsList>
          <TabsTrigger value="points">{b.tabPoints}</TabsTrigger>
          <TabsTrigger value="history">{b.tabHistory}</TabsTrigger>
        </TabsList>

        <TabsContent value="points" className="flex flex-col gap-4">
          <Toolbar>
            <MonthField label={b.month} value={month} onChange={setMonth} className="w-48" />
          </Toolbar>
          {nominationsStatus && <Muted>{nominationsStatus}</Muted>}
          {(data?.employeeOfMonth || data?.unitOfMonth) && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Winner label={b.employeeOfMonth} winner={data?.employeeOfMonth ?? null} icon="🏆" />
              <Winner label={b.unitOfMonth} winner={data?.unitOfMonth ?? null} icon="🏭" />
              <Winner label={b.masterOfMonth} winner={data?.masterOfMonth ?? null} icon="⭐" />
            </div>
          )}

          <Section title={b.summary} hint={b.pointsHint}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label={b.employee} value={rows.length} />
              <Tile label={b.approved} value={totalApproved} />
              <Tile
                label={b.remarks}
                value={totalRemarks}
                tone={totalRemarks > 0 ? 'warning' : undefined}
              />
              <Tile label={b.points} value={totalPoints} />
            </dl>
          </Section>

          <Section title={b.unitLeaderboard}>
            {units.length === 0 ? (
              <Muted>{b.noLeaderboard}</Muted>
            ) : (
              <ul className="flex flex-col gap-2">
                {units.map((u, i) => (
                  <li
                    key={u.orgUnitId ?? 'none'}
                    className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: `var(--chart-${(i % 8) + 1})` }}
                    />
                    <span className="font-medium">{u.orgUnitName ?? b.noUnit}</span>
                    <Muted>
                      {b.unitMasters}: {u.masters.length > 0 ? u.masters.join(', ') : '—'}
                    </Muted>
                    <span className="ml-auto flex items-center gap-4 tabular-nums">
                      <span>
                        {b.approved}: {u.approved}
                      </span>
                      <span className="font-semibold">
                        {b.points}: {u.points}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={b.leaderboard} className="print:break-inside-avoid">
            {chartData.length === 0 ? (
              <Muted>{b.noLeaderboard}</Muted>
            ) : (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={56}
                    angle={-20}
                    textAnchor="end"
                    fontSize={11}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="points" radius={4} maxBarSize={72}>
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </Section>

          <Section title={b.detailTitle}>
            <DataTable
              queryState={points}
              columns={columns}
              rows={rows}
              storageKey="bonus-points"
              searchText={(r) => `${r.employeeName} ${r.personnelNumber}`}
              rowKey={(r) => r.employeeId}
              empty={b.empty}
              loading={points.isPending}
            />
          </Section>
        </TabsContent>
        <TabsContent value="history" className="flex flex-col gap-4">
          <Toolbar>
            <DateField label={b.from} value={from} onChange={setFrom} className="w-44" />
            <DateField label={b.to} value={to} onChange={setTo} className="w-44" />
            <SelectField
              label={b.groupBy}
              searchable={false}
              value={groupBy}
              onChange={(v) => setGroupBy(v as 'day' | 'month' | 'year')}
              options={[
                { value: 'day', label: b.groupDay },
                { value: 'month', label: b.groupMonth },
                { value: 'year', label: b.groupYear },
              ]}
              className="w-44"
            />
            <SelectField
              label={b.historyKind}
              searchable={false}
              value={kind}
              onChange={(v) => setKind(v as '' | PointAwardKind)}
              placeholder={b.historyAll}
              options={[
                { value: 'CHECKLIST_APPROVED', label: b.historyKinds.CHECKLIST_APPROVED ?? '' },
                { value: 'UNIT_OF_MONTH', label: b.historyKinds.UNIT_OF_MONTH ?? '' },
                { value: 'MASTER_OF_MONTH', label: b.historyKinds.MASTER_OF_MONTH ?? '' },
              ]}
              className="w-56"
            />
            <FormField label={b.employee} className="w-56">
              {(id) => (
                <Input
                  id={id}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={all.ui.common.searchPlaceholder}
                />
              )}
            </FormField>
            <div className="flex items-end gap-1">
              <Button asChild variant="outline">
                <a
                  href={bonusApi.historyExportUrl(filters, 'csv')}
                  target="_blank"
                  rel="noreferrer"
                >
                  <DownloadIcon aria-hidden="true" />
                  {all.admin.reports.exportCsv}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={bonusApi.historyExportUrl(filters, 'xlsx')}
                  target="_blank"
                  rel="noreferrer"
                >
                  <DownloadIcon aria-hidden="true" />
                  {all.admin.reports.exportXlsx}
                </a>
              </Button>
            </div>
          </Toolbar>
          <Section title={b.tabHistory}>
            {(history?.buckets.length ?? 0) === 0 ? (
              <Muted>{b.historyEmpty}</Muted>
            ) : (
              <>
                <ChartContainer
                  config={{ points: { label: b.historyPoints, color: 'var(--chart-1)' } }}
                  className="mb-4 h-56 w-full"
                >
                  <BarChart data={history?.buckets ?? []} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="key" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="points" fill="var(--chart-1)" radius={4} maxBarSize={72} />
                  </BarChart>
                </ChartContainer>
                <DataTable
                  queryState={historyQuery}
                  columns={historyColumns}
                  rows={history?.buckets ?? []}
                  storageKey="bonus-history"
                  rowKey={(r) => r.key}
                  empty={b.historyEmpty}
                />
              </>
            )}
          </Section>
          <Section
            title={b.historyDetail}
            hint={
              history && history.total > history.entries.length
                ? format(b.historyTruncated, {
                    shown: history.entries.length,
                    total: history.total,
                  })
                : undefined
            }
          >
            <DataTable
              queryState={historyQuery}
              columns={entryColumns}
              rows={history?.entries ?? []}
              storageKey="bonus-history-entries"
              rowKey={(r) => r.id}
              searchText={(r) => `${r.employeeName} ${r.personnelNumber} ${r.orgUnitName ?? ''}`}
              empty={b.historyDetailEmpty}
              loading={historyQuery.isPending}
            />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Winner({
  label,
  winner,
  icon,
}: {
  readonly label: string;
  readonly winner: { name: string; points: number } | null;
  readonly icon: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <span aria-hidden="true" className="text-2xl">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="truncate font-semibold">{winner?.name ?? '—'}</div>
      </div>
      <div className="ml-auto text-2xl font-semibold tabular-nums">{winner?.points ?? 0}</div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone?: 'warning';
}) {
  return (
    <div className="rounded-lg border p-3">
      <div
        className={
          tone === 'warning'
            ? 'text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-300'
            : 'text-2xl font-semibold tabular-nums'
        }
      >
        {value}
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
