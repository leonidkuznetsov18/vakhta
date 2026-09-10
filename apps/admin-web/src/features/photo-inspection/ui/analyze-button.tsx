import type { InspectionReview } from '@vakhta/contracts';
import { hasInspectionInput } from '../model/analysis';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function AnalyzeButton({
  review,
  disabled,
  onAnalyze,
}: {
  review: InspectionReview;
  disabled: boolean;
  onAnalyze: () => void;
}) {
  const t = messages(currentLocale()).photoInspection;
  const empty = !hasInspectionInput(review);
  const unavailable = disabled || empty;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={unavailable ? 0 : undefined}
          aria-label={unavailable ? t.analyze : undefined}
        >
          <Button variant="outline" disabled={unavailable} onClick={onAnalyze}>
            {t.analyze}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{empty ? t.analyzeEmptyHint : t.analyzeHint}</TooltipContent>
    </Tooltip>
  );
}
