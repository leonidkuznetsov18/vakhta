import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { WandSparklesIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { LoadingState } from '@/shared/ui/loading-state';

export function AnalyzeButton({
  disabled,
  loading = false,
  onAnalyze,
}: {
  disabled: boolean;
  loading?: boolean;
  onAnalyze: () => void;
}) {
  const t = messages(currentLocale()).photoInspection;
  return (
    <IconButton
      icon={WandSparklesIcon}
      label={t.analyze}
      tooltip={t.analyzeHint}
      variant="outline"
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={onAnalyze}
    >
      {loading ? <LoadingState label={t.aiPending} /> : t.analyze}
    </IconButton>
  );
}
