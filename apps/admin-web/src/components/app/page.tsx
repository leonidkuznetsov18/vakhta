import type { ReactNode } from 'react';
import { messages } from '@vakhta/i18n';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { InfoTip } from '@/components/app/info-tip';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

/** Filters and primary actions of a page, wrapping on narrow screens. */
export function Toolbar({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn('flex flex-wrap items-end gap-3', className)}>{children}</div>;
}

/** A titled block with an optional info tooltip; the card is the only container the pages use. */
export function Section({
  title,
  hint,
  description,
  actions,
  children,
  className,
}: {
  readonly title?: string;
  readonly hint?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card className={className}>
      {title ? (
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle>{title}</CardTitle>
            {hint ? <InfoTip text={hint} /> : null}
          </div>
          {description ? <CardDescription>{description}</CardDescription> : null}
          {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export function EmptyState({
  text,
  description,
  action,
}: {
  readonly text: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <Empty className="py-8">
      <EmptyHeader>
        <EmptyTitle className="text-sm font-normal text-muted-foreground">{text}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function Muted({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <span className={cn('text-sm text-muted-foreground', className)}>{children}</span>;
}

/** Live-updates indicator for pages fed by server-sent events. */
export function LiveBadge({ live, hint }: { readonly live: boolean; readonly hint?: string }) {
  const o = messages(currentLocale()).admin.operations;
  const state = live ? o.live : o.offline;
  // A dot, not a sentence: the state is either "green, fine" or "red, reload", and a line of text
  // in the toolbar took the room of a control to say it. The words stay a hover and a screen
  // reader away, so nothing is lost.
  return (
    <div className="flex items-center gap-1" aria-live="polite">
      {/* Its own provider, like the info tip: a page rendered on its own (a test, a preview) has
          no app-level one, and a tooltip without a provider throws. */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              role="status"
              aria-label={state}
              className="inline-flex size-6 cursor-default items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block size-2.5 rounded-full',
                  live ? 'bg-emerald-500' : 'bg-red-500',
                )}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{state}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {hint ? <InfoTip text={hint} /> : null}
    </div>
  );
}

/**
 * How a chosen option in a group of buttons is marked: its own border and a lift, not a black fill.
 * Black reads as "primary action" everywhere else in the panel, and a language or a theme is a
 * setting, not an action.
 */
export const SELECTED_TOGGLE =
  'border-emerald-500 text-foreground shadow-sm shadow-emerald-100 dark:border-emerald-600 dark:shadow-none';

/**
 * A table row that needs attention: red, and still red once it is opened. The selected-row
 * background is written under the same variant, so without repeating the tint there the highlight
 * painted over exactly the rows that were worth marking.
 */
export const ROW_DANGER =
  'bg-red-50/60 data-[state=selected]:bg-red-50/60 dark:bg-red-950/30 dark:data-[state=selected]:bg-red-950/30';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-foreground',
  // The palette is white, black, red, amber and emerald: red for what is wrong, amber for what
  // wants attention, emerald for what is well. Anything merely informational stays neutral.
  info: 'border-border bg-muted text-foreground',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  danger:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
};

/** Status chip; semantic colour is separate from the accent so states read at a glance. */
export function StatusPill({
  tone = 'neutral',
  children,
}: {
  readonly tone?: Tone;
  readonly children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', TONE[tone])}>
      {children}
    </Badge>
  );
}

export function EmptyDescriptionText({ children }: { readonly children: ReactNode }) {
  return <EmptyDescription>{children}</EmptyDescription>;
}
