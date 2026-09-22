import { messages } from '@vakhta/i18n';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from 'cn';
import { currentLocale } from '../i18n.tsx';

const b = messages(currentLocale()).admin.bonus;

export interface PointsRemarksBar {
  readonly key: string;
  readonly label: string;
  readonly points: number;
  readonly remarks: number;
}

// Points keep the chart blue used across the page; remarks take the amber of the remark pill.
const CONFIG: ChartConfig = {
  points: { label: b.points, color: 'var(--chart-1)' },
  remarks: { label: b.remarks, color: '#f59e0b' },
};

/** A value above its bar, left out for zero so a quiet period stays clean. */
function barValue(value: unknown): string {
  return typeof value === 'number' && value > 0 ? String(value) : '';
}

/** Points and remarks side by side per period, each bar labelled with its count. */
export function PointsRemarksChart({
  bars,
  className,
}: {
  readonly bars: readonly PointsRemarksBar[];
  readonly className?: string;
}) {
  return (
    <ChartContainer config={CONFIG} className={cn('h-56 w-full', className)}>
      <BarChart data={[...bars]} margin={{ top: 20, left: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={32} fontSize={11} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="points" fill="var(--color-points)" radius={4} maxBarSize={32}>
          <LabelList dataKey="points" position="top" fontSize={11} formatter={barValue} />
        </Bar>
        <Bar dataKey="remarks" fill="var(--color-remarks)" radius={4} maxBarSize={32}>
          <LabelList dataKey="remarks" position="top" fontSize={11} formatter={barValue} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
