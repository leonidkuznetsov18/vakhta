import { useStore } from 'zustand';
import { availableSuggestions, rejectedSuggestions } from '../model/suggestions';
import { AiFeedbackRating, RejectionReason, type PhotoInspectionView } from '@vakhta/contracts';
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
import { ObjectSwatch } from './object-swatch';
import { InfoTip } from '@/components/app/info-tip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
const t = messages(currentLocale()).photoInspection;

/** The reviewer's verdict on the run itself: the usefulness number the pilot is judged by. */
function RunFeedback({
  run,
  disabled,
  onRate,
}: {
  run: PhotoInspectionView['runs'][number];
  disabled: boolean;
  onRate: (runId: string, rating: AiFeedbackRating) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2">
      <span className="flex items-center gap-1 font-medium">
        {t.feedbackQuestion}
        <InfoTip text={t.feedbackHint} />
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        className="max-w-full flex-wrap"
        value={run.feedback?.rating ?? ''}
        aria-label={t.feedbackQuestion}
        onValueChange={(value) => {
          const rating = AiFeedbackRating.safeParse(value);
          if (rating.success) onRate(run.id, rating.data);
        }}
      >
        {AiFeedbackRating.options.map((rating) => (
          <ToggleGroupItem key={rating} value={rating} disabled={disabled}>
            {t.feedbackRatings[rating]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {run.feedback && (
        <p role="status" className="text-muted-foreground">
          {t.feedbackSaved}
        </p>
      )}
    </div>
  );
}

export function PredictionPanel({
  latest,
  editor,
  disabled,
  onRate,
}: {
  latest: PhotoInspectionView;
  editor: InspectionEditor;
  disabled: boolean;
  onRate: (runId: string, rating: AiFeedbackRating) => void;
}) {
  const review = useStore(editor.store, (state) => state.review);
  const run = latest.runs[0];
  if (!run || run.status === 'PENDING') return null;
  if (run.status === 'FAILED')
    return (
      <section className="flex min-w-0 flex-col gap-2 rounded-md border p-3 text-sm">
        <p role="alert">{run.errorCode === 'RULES_MISSING' ? t.aiRulesMissing : t.aiFailed}</p>
        <RunFeedback run={run} disabled={disabled} onRate={onRate} />
      </section>
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
          <p className="flex max-h-32 items-start gap-2 overflow-y-auto whitespace-pre-wrap break-words">
            <ObjectSwatch
              objectId={finding.objectId}
              objectName={finding.objectName}
              rules={latest.rules}
            />
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
      <RunFeedback run={run} disabled={disabled} onRate={onRate} />
    </section>
  );
}
