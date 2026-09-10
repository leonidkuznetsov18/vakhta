import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { WandSparklesIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { LoadingState } from '@/shared/ui/loading-state';
import { SparkleBurst } from '@/shared/ui/sparkle-burst';

export function AnalyzeButton({
  disabled,
  loading = false,
  finished = null,
  onAnalyze,
}: {
  disabled: boolean;
  loading?: boolean;
  /**
   * The analysis this session asked for, once it has come back. A different value is a different
   * answer, so the burst mounts again and plays again; the same value leaves it where it is.
   */
  finished?: string | null;
  onAnalyze: () => void;
}) {
  const t = messages(currentLocale()).photoInspection;
  return (
    <IconButton
      icon={WandSparklesIcon}
      label={t.analyze}
      tooltip={t.analyzeHint}
      variant="outline"
      className="relative"
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={onAnalyze}
    >
      {loading ? <LoadingState label={t.aiPending} /> : t.analyze}
      {/* The wand's own tip: the icon sits at the button's start, and the sparks leave from there. */}
      {finished !== null && !loading && (
        <SparkleBurst key={finished} className="top-[10px] left-[24px]" />
      )}
    </IconButton>
  );
}
