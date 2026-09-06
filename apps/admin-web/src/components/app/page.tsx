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
  return (
    <div className="flex items-center gap-1" aria-live="polite">
      <Badge variant={live ? 'default' : 'outline'}>
        <span
          aria-hidden="true"
          className={cn(
            'mr-1 inline-block size-1.5 rounded-full',
            live ? 'bg-primary-foreground' : 'bg-muted-foreground',
          )}
        />
        {live ? o.live : o.offline}
      </Badge>
      {hint ? <InfoTip text={hint} /> : null}
    </div>
  );
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-foreground',
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200',
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
