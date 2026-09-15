import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { cn } from 'cn';
import { InfoTip } from '@/components/app/info-tip';
import type { Tone } from '@/components/app/page';
import { LoadingState } from '@/shared/ui/loading-state';

const VALUE_TONE: Readonly<Record<string, string>> = {
  neutral: 'text-foreground',
  info: 'text-foreground',
  accent: 'text-foreground',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
};

const BORDER_TONE: Readonly<Record<string, string>> = {
  neutral: 'border-border',
  info: 'border-border',
  accent: 'border-border',
  success: 'border-emerald-200 dark:border-emerald-900',
  warning: 'border-amber-300 dark:border-amber-800',
  danger: 'border-red-300 dark:border-red-800',
};

/**
 * One key figure with its definition a hover away, the evidence lines under it and, when there is
 * somewhere to go, the whole tile as the control. Loading and failure replace the number: a KPI
 * never shows a zero it does not know (spec 004 AC-019).
 */
export function KpiTile({
  icon: Icon,
  title,
  hint,
  value,
  details = [],
  tone = 'neutral',
  state = 'ready',
  failure,
  onOpen,
  openLabel,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly hint: string;
  readonly value: ReactNode;
  readonly details?: readonly ReactNode[];
  readonly tone?: Tone;
  readonly state?: 'ready' | 'loading' | 'failed';
  readonly failure?: ReactNode;
  readonly onOpen?: () => void;
  readonly openLabel?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 break-words">{title}</span>
        <span className="relative z-10">
          <InfoTip text={hint} />
        </span>
      </div>
      {state === 'loading' ? (
        <LoadingState className="justify-start py-2" />
      ) : state === 'failed' ? (
        <div className="py-1 text-sm">{failure}</div>
      ) : (
        <>
          <div
            className={cn(
              'text-xl leading-tight font-semibold break-words tabular-nums',
              VALUE_TONE[tone],
            )}
          >
            {value}
          </div>
          {details.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              {details.map((line, index) => (
                <li key={index} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
  const frame = cn(
    'flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-4 text-left',
    state === 'ready' ? BORDER_TONE[tone] : 'border-border',
  );
  if (!onOpen || state !== 'ready') return <div className={frame}>{body}</div>;
  return (
    <div className={cn(frame, 'group relative')}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel ?? title}
        className="absolute inset-0 cursor-pointer rounded-[inherit] transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 active:shadow-sm"
      />
      {body}
      <ChevronRightIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-3 bottom-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      />
    </div>
  );
}
