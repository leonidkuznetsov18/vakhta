import { useMemo } from 'react';
import type { ReportTableView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Muted, Section } from '@/components/app/page';
import { currentLocale } from '@/i18n';

const all = messages(currentLocale());

export type ChartType = 'bar' | 'line' | 'stacked';

/** Numeric columns each report draws by default; the first text column is the category axis. */
export const DEFAULT_SERIES: Partial<Record<ReportTableView['kind'], readonly string[]>> = {
  hours: ['plannedMinutes', 'actualMinutes'],
  'time-structure': ['workMinutes', 'breakMinutes', 'mealMinutes', 'downtimeMinutes'],
  downtime: ['downtimeMinutes', 'incidents'],
  handover: ['handovers', 'accepted', 'disputed'],
  'bot-usage': ['qrArrivals', 'reserveArrivals', 'masterStarts'],
  bonus: ['avgScore', 'sMonth'],
};
const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

/** Rows of the report as chart points: minutes become hours, the category is the first text column. */
export function chartPoints(
  report: ReportTableView,
  keys: readonly string[],
  top: number,
): { readonly data: Record<string, string | number>[]; readonly category: string | null } {
  const category = report.columns.find((c) => c.kind === 'text') ?? null;
  const columns = report.columns.filter((c) => keys.includes(c.key));
  const rows = report.rows.map((row) => {
    const point: Record<string, string | number> = {
      name: String(category ? (row[category.key] ?? '—') : '—'),
    };
    for (const c of columns) {
      const v = row[c.key];
      const n = typeof v === 'number' ? v : Number(v ?? 0);
      point[c.key] = c.kind === 'minutes' ? Math.round((n / 60) * 10) / 10 : n;
    }
    return point;
  });
  const lead = columns[0]?.key;
  const sorted =
    top > 0 && lead
      ? [...rows].sort((a, b) => Number(b[lead] ?? 0) - Number(a[lead] ?? 0)).slice(0, top)
      : rows.slice(0, 60);
  return { data: sorted, category: category?.key ?? null };
}

/**
 * The chart of the current report: bars, lines or stacked bars over the selected series. What is
 * drawn follows the view options, so the planner sees the picture before downloading the file.
 */
export function ReportChart({
  report,
  series,
  type,
  top,
}: {
  readonly report: ReportTableView;
  readonly series: readonly string[];
  readonly type: ChartType;
  readonly top: number;
}) {
  const columns = report.columns.filter((c) => series.includes(c.key));
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        columns.map((c, i) => [c.key, { label: c.label, color: PALETTE[i % PALETTE.length] }]),
      ),
    [columns],
  );
  const { data, category } = useMemo(() => chartPoints(report, series, top), [report, series, top]);
  return (
    <Section
      title={all.ui.common.chart}
      hint={all.ui.hints.reportsChart}
      className="print:break-inside-avoid"
    >
      {!category || columns.length === 0 || data.length === 0 ? (
        <Muted>{all.admin.reports.noSeries}</Muted>
      ) : (
        <ChartContainer config={config} className="h-72 w-full">
          {type === 'line' ? (
            <LineChart data={data} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                interval={0}
                height={48}
                angle={-20}
                textAnchor="end"
                fontSize={11}
              />
              <YAxis tickLine={false} axisLine={false} width={40} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {columns.map((c) => (
                <Line
                  key={c.key}
                  type="monotone"
                  dataKey={c.key}
                  stroke={`var(--color-${c.key})`}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                interval={0}
                height={48}
                angle={-20}
                textAnchor="end"
                fontSize={11}
              />
              <YAxis tickLine={false} axisLine={false} width={40} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {columns.map((c) => (
                <Bar
                  key={c.key}
                  dataKey={c.key}
                  fill={`var(--color-${c.key})`}
                  radius={type === 'stacked' ? 0 : 4}
                  {...(type === 'stacked' ? { stackId: 'a' } : {})}
                />
              ))}
            </BarChart>
          )}
        </ChartContainer>
      )}
    </Section>
  );
}
