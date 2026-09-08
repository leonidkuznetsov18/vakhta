import { useEffect, useMemo, useState } from 'react';
import type { BonusPointsView, OrgSnapshot } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DataTable, type Column } from '@/components/app/data-table';
import { Feedback, useAction } from '@/components/app/feedback';
import { MonthField } from '@/components/app/date-picker';
import { SelectField } from '@/components/app/fields';
import { Muted, Section, StatusPill, Toolbar } from '@/components/app/page';
import { HowItWorks } from '@/components/app/how-it-works';
import { usePersistentState } from '@/lib/persistent-state';
import { bonusApi, orgApi } from '../api.ts';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

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
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [siteId, setSiteId] = usePersistentState('bonus.siteId', '');
  const [month, setMonth] = usePersistentState('bonus.month', currentMonth);
  const [data, setData] = useState<BonusPointsView | null>(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    orgApi
      .snapshot()
      .then((snapshot) => {
        setOrg(snapshot);
        if (!siteId && snapshot.sites[0]) setSiteId(snapshot.sites[0].id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!siteId) return;
    void run(async () => setData(await bonusApi.points(siteId, month)));
  }, [siteId, month]);

  const rows = data?.employees ?? [];
  const totalPoints = rows.reduce((s, r) => s + r.points, 0);
  const totalApproved = rows.reduce((s, r) => s + r.approved, 0);
  const totalRemarks = rows.reduce((s, r) => s + r.remarks, 0);

  const top = useMemo(() => rows.filter((r) => r.points > 0).slice(0, 10), [rows]);
  const chartConfig: ChartConfig = { points: { label: b.points, color: 'var(--chart-1)' } };
  const chartData = top.map((r) => ({ name: r.employeeName, points: r.points }));

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
      <Toolbar>
        <SelectField
          label={b.site}
          value={siteId}
          onChange={setSiteId}
          options={org?.sites.map((s) => ({ value: s.id, label: s.name })) ?? []}
          className="w-56"
        />
        <MonthField label={b.month} value={month} onChange={setMonth} className="w-48" />
      </Toolbar>
      <Feedback error={error ? describeError(error) : null} />

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
              <Bar dataKey="points" fill="var(--color-points)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </Section>

      <Section title={b.detailTitle}>
        <DataTable
          columns={columns}
          rows={rows}
          storageKey="bonus-points"
          searchText={(r) => `${r.employeeName} ${r.personnelNumber}`}
          rowKey={(r) => r.employeeId}
          empty={b.empty}
          loading={busy && rows.length === 0}
        />
      </Section>
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
