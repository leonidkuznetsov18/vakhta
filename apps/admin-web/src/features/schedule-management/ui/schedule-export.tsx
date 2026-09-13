import { useMutation } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { ApiError } from '@/api';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Feedback } from '@/components/app/feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { IconButton } from '@/shared/ui/icon-button';
import { requestScheduleExport, downloadScheduleExport } from '../api/schedule-export';

const t = messages(currentLocale()).scheduleExport;

/** Downloads the complete saved plan of the month; local edits and calendar filters are excluded. */
export function ScheduleExport({
  id,
  revision,
  refreshing,
  refresh,
  compact = false,
}: {
  id: string;
  revision: number;
  refreshing: boolean;
  refresh: () => void;
  /** Toolbar placement: one labelled button, feedback inline beside it. */
  compact?: boolean;
}) {
  const download = useMutation({
    mutationFn: () => requestScheduleExport(id, revision),
    retry: false,
    networkMode: 'always',
  });
  const stale = download.error instanceof ApiError && download.error.status === 409;
  const unavailable = revision < 1 || refreshing;
  function startDownload() {
    if (unavailable || download.isPending || stale) return;
    // Per-call callbacks are removed when this version/actor detail unmounts.
    download.mutate(undefined, {
      onSuccess: (blob) => downloadScheduleExport(blob, id, revision),
    });
  }
  const button = download.isPending ? (
    <Button variant="outline" size={compact ? 'sm' : 'default'} disabled>
      <LoadingState label={t.preparing} />
    </Button>
  ) : (
    <IconButton
      icon={DownloadIcon}
      label={t.download}
      tooltip={t.wholeVersion}
      variant="outline"
      size={compact ? 'sm' : 'default'}
      onClick={startDownload}
      disabled={unavailable || stale}
    />
  );
  const feedback = (
    <>
      {!compact && unavailable && (
        <p className="text-sm text-muted-foreground">{t.waitForVersion}</p>
      )}
      <Feedback error={download.error ? (stale ? t.stale : t.failed) : null} />
      {stale && (
        <Button
          variant="outline"
          size={compact ? 'sm' : 'default'}
          disabled={refreshing}
          onClick={refresh}
        >
          {t.refresh}
        </Button>
      )}
    </>
  );
  if (compact)
    return (
      <span className="flex flex-wrap items-center gap-2">
        {button}
        {feedback}
      </span>
    );
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={t.download}>
      <p className="text-sm text-muted-foreground">{t.wholeVersion}</p>
      {button}
      {feedback}
    </section>
  );
}
