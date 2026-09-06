import { useMemo } from 'react';
import type { ReportTableView } from '@vakhta/contracts';
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
import { Section } from '@/components/app/page';
import { currentLocale } from '@/i18n';

const all = messages(currentLocale());

/** Which numeric columns each report draws; the first text column is the category axis. */
const SERIES: Partial<Record<ReportTableView['kind'], readonly string[]>> = {
  hours: ['plannedMinutes', 'actualMinutes'],
  'time-structure': ['workMinutes', 'breakMinutes', 'mealMinutes', 'downtimeMinutes'],
  downtime: ['downtimeMinutes', 'incidents'],
  handover: ['handovers', 'accepted', 'disputed'],
  'bot-usage': ['qrArrivals', 'reserveArrivals', 'masterStarts'],
  bonus: ['avgScore', 'sMonth'],
};
const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];

/** A bar chart over the rows of the current report; minutes are shown as hours. */
export function ReportChart({ report }: { readonly report: ReportTableView }) {
  const keys = SERIES[report.kind] ?? [];
  const category = report.columns.find((c) => c.kind === 'text');
  const columns = report.columns.filter((c) => keys.includes(c.key));
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        columns.map((c, i) => [c.key, { label: c.label, color: PALETTE[i % PALETTE.length] }]),
      ),
    [columns],
  );
  const data = useMemo(
    () =>
      report.rows.slice(0, 30).map((row) => {
        const point: Record<string, string | number> = {
          name: String(category ? (row[category.key] ?? '—') : '—'),
        };
        for (const c of columns) {
          const v = row[c.key];
          const n = typeof v === 'number' ? v : Number(v ?? 0);
          point[c.key] = c.kind === 'minutes' ? Math.round((n / 60) * 10) / 10 : n;
        }
        return point;
      }),
    [report, columns, category],
  );
  if (!category || columns.length === 0 || data.length === 0) return null;
  return (
    <Section
      title={all.ui.common.chart}
      hint={all.ui.hints.reportsChart}
      className="print:break-inside-avoid"
    >
      <ChartContainer config={config} className="h-72 w-full">
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
            <Bar key={c.key} dataKey={c.key} fill={`var(--color-${c.key})`} radius={4} />
          ))}
        </BarChart>
      </ChartContainer>
    </Section>
  );
}
