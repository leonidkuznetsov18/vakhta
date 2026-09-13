import { useMutation } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { ApiError } from '@/api';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Feedback } from '@/components/app/feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { requestScheduleExport, downloadScheduleExport } from '../api/schedule-export';

const t = messages(currentLocale()).scheduleExport;

export function ScheduleExport({
  id,
  revision,
  refreshing,
  refresh,
}: {
  id: string;
  revision: number;
  refreshing: boolean;
  refresh: () => void;
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
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={t.download}>
      <p className="text-sm text-muted-foreground">{t.wholeVersion}</p>
      <Button
        variant="outline"
        onClick={startDownload}
        disabled={unavailable || download.isPending || stale}
      >
        {download.isPending ? (
          <LoadingState label={t.preparing} />
        ) : (
          <>
            <DownloadIcon aria-hidden="true" />
            {t.download}
          </>
        )}
      </Button>
      {unavailable && <p className="text-sm text-muted-foreground">{t.waitForVersion}</p>}
      <Feedback error={download.error ? (stale ? t.stale : t.failed) : null} />
      {stale && (
        <Button variant="outline" disabled={refreshing} onClick={refresh}>
          {t.refresh}
        </Button>
      )}
    </section>
  );
}
