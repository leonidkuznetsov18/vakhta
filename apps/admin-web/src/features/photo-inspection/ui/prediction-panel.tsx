import { useStore } from 'zustand';
import { availableSuggestions } from '../model/suggestions';
import type { PhotoInspectionView } from '@vakhta/contracts';
import type { InspectionEditor } from '../model/editor';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { CopyPlusIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
const t = messages(currentLocale()).photoInspection;

export function PredictionPanel({
  latest,
  editor,
  disabled,
}: {
  latest: PhotoInspectionView;
  editor: InspectionEditor;
  disabled: boolean;
}) {
  const review = useStore(editor.store, (state) => state.review);
  const run = latest.runs[0];
  if (!run || run.status === 'PENDING') return null;
  if (run.status === 'FAILED')
    return (
      <p role="alert" className="text-sm">
        {t.aiFailed}
      </p>
    );
  if (!run.prediction) return null;
  const suggestions = availableSuggestions(run, review);
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-md border p-3 text-sm">
      <h3 className="font-semibold">{t.aiTitle}</h3>
      {run.reviewVersion !== latest.version && <p>{t.staleAi}</p>}
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
        {run.prediction.summary}
      </p>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">
        {run.prediction.limitations}
      </p>
      {run.prediction.findings.length > 0 && suggestions.length === 0 && (
        <p role="status">{t.allSuggestionsAdded}</p>
      )}
      {suggestions.map(({ finding, index, key }) => (
        <div key={key} className="rounded-md border p-2">
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
            {finding.comment}
          </p>
          {finding.geometry ? (
            <IconButton
              icon={CopyPlusIcon}
              label={t.accept}
              tooltip={t.hints.accept}
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => editor.acceptSuggestion(run, index)}
            >
              {t.accept}
            </IconButton>
          ) : (
            <p>{t.noGeometry}</p>
          )}
        </div>
      ))}
    </section>
  );
}
