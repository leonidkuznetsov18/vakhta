import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/shared/config';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { LoadingState } from './loading-state';

export function PhotoLoadState({
  failed,
  retry,
  paused = false,
}: {
  failed: boolean;
  retry: () => void;
  paused?: boolean;
}) {
  const t = messages(currentLocale());
  if (paused)
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-2">
        <p role="status">{t.ui.common.waitingConnection}</p>
      </div>
    );
  return (
    <div className="pointer-events-none [&_button]:pointer-events-auto absolute inset-0 z-10 flex items-center justify-center p-2">
      {failed ? (
        <Alert variant="destructive" role="alert">
          <AlertCircleIcon />
          <AlertTitle>{t.photoInspection.imageFailed}</AlertTitle>
          <Button variant="outline" onClick={retry}>
            <RefreshCwIcon />
            {t.ui.common.retry}
          </Button>
        </Alert>
      ) : (
        <LoadingState />
      )}
    </div>
  );
}
