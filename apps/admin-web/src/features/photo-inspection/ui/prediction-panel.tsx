import { useStore } from 'zustand';
import { availableSuggestions, rejectedSuggestions } from '../model/suggestions';
import { RejectionReason, type PhotoInspectionView } from '@vakhta/contracts';
import type { InspectionEditor } from '../model/editor';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { CopyPlusIcon, Undo2Icon, XIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
        {run.errorCode === 'RULES_MISSING' ? t.aiRulesMissing : t.aiFailed}
      </p>
    );
  if (!run.prediction) return null;
  const suggestions = availableSuggestions(run, review);
  const rejected = rejectedSuggestions(run, review);
  const label = (finding: (typeof suggestions)[number]['finding']) =>
    finding.objectName
      ? `${finding.objectName}${finding.comment && finding.comment !== finding.objectName ? ` — ${finding.comment}` : ''}`
      : finding.comment;
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-md border p-3 text-sm">
      <h3 className="font-semibold">{t.aiTitle}</h3>
      {run.reviewVersion !== latest.version && <p>{t.staleAi}</p>}
      <p className="text-muted-foreground">
        {run.prediction.findings.length
          ? `${t.aiSummary}: ${run.prediction.findings.length}${run.prediction.summary ? ` (${run.prediction.summary})` : ''}`
          : t.aiNone}
      </p>
      {run.prediction.findings.length > 0 && suggestions.length === 0 && (
        <p role="status">{t.allSuggestionsAdded}</p>
      )}
      {suggestions.map(({ finding, index, key }) => (
        <div key={key} className="rounded-md border p-2">
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
            {label(finding)}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={XIcon}
                  label={t.reject}
                  tooltip={t.hints.reject}
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                >
                  {t.reject}
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {RejectionReason.options.map((reason) => (
                  <DropdownMenuItem
                    key={reason}
                    onSelect={() => editor.rejectSuggestion(run, index, reason)}
                  >
                    {t.rejectReasons[reason]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
      {rejected.map(({ finding, index, reason }) => (
        <div
          key={`rejected:${index}`}
          className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-muted-foreground"
        >
          <span className="min-w-0 flex-1 break-words line-through">{label(finding)}</span>
          <span>
            {t.rejected}: {t.rejectReasons[reason]}
          </span>
          <IconButton
            icon={Undo2Icon}
            label={t.restore}
            tooltip={t.hints.restore}
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => editor.restoreSuggestion(run, index)}
          >
            {t.restore}
          </IconButton>
        </div>
      ))}
    </section>
  );
}
