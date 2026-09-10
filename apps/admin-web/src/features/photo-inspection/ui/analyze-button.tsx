import type { InspectionReview } from '@vakhta/contracts';
import { hasInspectionInput } from '../model/analysis';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { SparklesIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';

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
    <IconButton
      icon={SparklesIcon}
      label={t.analyze}
      tooltip={empty ? t.analyzeEmptyHint : t.analyzeHint}
      variant="outline"
      disabled={unavailable}
      onClick={onAnalyze}
    />
  );
}
