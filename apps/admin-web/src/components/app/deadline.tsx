import { useEffect, useState } from 'react';
import { format, messages } from '@vakhta/i18n';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusPill, type Tone } from '@/components/app/page';
import { formatDateTime } from '@/lib/format';
import { currentLocale } from '@/i18n';

/** A clock that ticks once a minute, so relative times stay honest on a page left open. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "2 ч 15 мин" or "40 мин"; zero reads as "now". */
export function formatSpan(ms: number): string {
  const t = messages(currentLocale()).ui.time;
  const totalMinutes = Math.round(Math.abs(ms) / 60_000);
  if (totalMinutes === 0) return t.now;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const parts = [];
  if (h > 0) parts.push(format(t.hours, { h }));
  if (m > 0 || h === 0) parts.push(format(t.minutes, { m }));
  return parts.join(' ');
}

const WARN_MS = 15 * 60_000;

/**
 * Deadline shown as time left, coloured by urgency, with the absolute time in a tooltip.
 * `breached` forces the overdue tone when the server has already decided.
 */
export function Deadline({
  at,
  breached = false,
  now,
}: {
  readonly at: string | null | undefined;
  readonly breached?: boolean;
  readonly now?: Date;
}) {
  const clock = useNow();
  if (!at) return <span>—</span>;
  const t = messages(currentLocale()).ui.time;
  const current = now ?? clock;
  const diff = new Date(at).getTime() - current.getTime();
  const overdue = breached || diff < 0;
  const tone: Tone = overdue ? 'danger' : diff < WARN_MS ? 'warning' : 'neutral';
  const label = overdue
    ? format(t.overdueBy, { value: formatSpan(diff) })
    : format(t.in, { value: formatSpan(diff) });
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <StatusPill tone={tone}>{label}</StatusPill>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="tabular-nums">{formatDateTime(at)}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
