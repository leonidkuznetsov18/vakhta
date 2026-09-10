import { useIsMutating } from '@tanstack/react-query';
import { messages } from '@vakhta/i18n';
import { AlertCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { currentLocale } from '@/i18n';
import { readError } from '@/errors';

/** Structural query state keeps shared feedback independent of the record type. */
export interface QueryFeedbackState {
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  error: unknown;
  refetch: () => Promise<unknown>;
}

export function QueryFeedback({ query }: { query: QueryFeedbackState }) {
  const t = messages(currentLocale()).ui.common;
  if (query.isError)
    return (
      <Alert variant="destructive" role="alert" className="max-w-2xl">
        <AlertCircleIcon />
        <AlertTitle>{readError(query.error)}</AlertTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="col-start-2 w-fit justify-self-start"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? t.loading : t.retry}
        </Button>
      </Alert>
    );
  if (query.fetchStatus === 'paused')
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t.waitingConnection}
      </p>
    );
  if (!query.isFetching) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner />
      {query.isPending ? t.loading : t.refreshing}
    </div>
  );
}

/** Shared mutation feedback also covers dialogs and forms outside a table. */
export function MutationActivity() {
  const pending = useIsMutating();
  return pending ? (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner />
      {messages(currentLocale()).ui.common.saving}
    </div>
  ) : null;
}
