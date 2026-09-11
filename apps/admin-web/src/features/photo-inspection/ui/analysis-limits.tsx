import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/shared/ui/loading-state';
import type { AnalysisLimitsView } from '../model/analysis-limits';

export function AnalysisLimits({ view, retry }: { view: AnalysisLimitsView; retry: () => void }) {
  const t = messages(currentLocale()).photoInspection;
  return (
    <div className="min-w-0 space-y-1 text-sm text-muted-foreground" role="status">
      {view.summary && <p className="break-words">{view.summary}</p>}
      {view.status === 'checking' && <LoadingState label={t.analysisLimitsChecking} />}
      {(view.status === 'error' || view.status === 'offline') && <p>{view.disabledReason}</p>}
      {view.status === 'error' && (
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {t.refresh}
        </Button>
      )}
    </div>
  );
}
