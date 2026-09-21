export { IconButton } from './ui/icon-button';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from './i18n';

/** One loader per pending surface (AGENTS.md admin panel UI). */
export function LoadingState({ label }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Spinner />
      <span>{label ?? t().common.loading}</span>
    </div>
  );
}

export function FailureState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="my-4">
      <AlertTitle>{t().common.error}</AlertTitle>
      {message ? <AlertDescription>{message}</AlertDescription> : null}
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {t().common.retry}
        </Button>
      ) : null}
    </Alert>
  );
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  PROVISIONING: 'bg-sky-100 text-sky-800',
  DRAFT: 'bg-neutral-200 text-neutral-700',
  SUSPENDED: 'bg-orange-100 text-orange-800',
  ARCHIVED: 'bg-neutral-100 text-neutral-500',
  DONE: 'bg-emerald-100 text-emerald-800',
  RUNNING: 'bg-sky-100 text-sky-800',
  PENDING: 'bg-neutral-200 text-neutral-700',
  FAILED: 'bg-red-100 text-red-800',
  SKIPPED: 'bg-neutral-100 text-neutral-500',
  MANUAL_REQUIRED: 'bg-orange-100 text-orange-800',
  CANCELLED: 'bg-neutral-100 text-neutral-500',
  VERIFIED: 'bg-emerald-100 text-emerald-800',
};

/** Colour is never the only signal: the label always accompanies the tone. */
export function StatusBadge({ code, label }: { code: string; label: string }) {
  return (
    <Badge variant="outline" className={`border-transparent ${STATUS_TONE[code] ?? ''}`}>
      {label}
    </Badge>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs font-normal text-red-700">{error}</span> : null}
    </label>
  );
}
