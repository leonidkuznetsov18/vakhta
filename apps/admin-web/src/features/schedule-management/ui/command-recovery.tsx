import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/shared/ui/loading-state';
import type { Workspace } from '../model/use-workspace';

const t = messages(currentLocale()).scheduleWorkspace;
export function CommandRecovery({ workspace: w }: { workspace: Workspace }) {
  if (!w.pendingCommand && !w.commandStorageError) return null;
  return (
    <Alert className="space-y-2">
      <AlertTitle>
        {w.commandStorageError ? t.commandStorageError : t.commandUnconfirmed}
      </AlertTitle>
      <AlertDescription>
        {w.commandStorageError ? t.commandStorageHint : t.commandRecoveryHint}
      </AlertDescription>
      {w.pendingCommand &&
        (w.busy ? (
          <LoadingState label={t.commandChecking} />
        ) : (
          <div className="space-y-2">
            <Button onClick={w.retryCommand} disabled={!w.canRetryCommand}>
              {t.commandRetry}
            </Button>
            {!w.canRetryCommand && <p className="text-sm">{t.commandPermission}</p>}
          </div>
        ))}
    </Alert>
  );
}
