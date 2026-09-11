import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { WandSparklesIcon } from 'lucide-react';
import { IconButton } from '@/shared/ui/icon-button';
import { LoadingState } from '@/shared/ui/loading-state';
import { SparkleBurst } from '@/shared/ui/sparkle-burst';

export function AnalyzeButton({
  disabled,
  disabledReason = null,
  loading = false,
  finished = null,
  onAnalyze,
}: {
  disabled: boolean;
  disabledReason?: string | null;
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
    // The burst lives beside the button, not inside it: a button that turns disabled (while a save
    // runs) is re-mounted by IconButton, and a burst inside it would play again for no reason.
    <span className="relative inline-flex">
      <IconButton
        icon={WandSparklesIcon}
        label={t.analyze}
        tooltip={loading ? t.aiPending : (disabledReason ?? t.analyzeHint)}
        variant="outline"
        className="border-amber-400 bg-amber-300 text-amber-950 hover:bg-amber-400 hover:text-amber-950 focus-visible:ring-amber-500 dark:border-amber-500 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300"
        disabled={disabled || loading || disabledReason !== null}
        aria-busy={loading}
        onClick={onAnalyze}
      >
        {loading ? <LoadingState label={t.aiPending} /> : t.analyze}
      </IconButton>
      {/* The wand's own tip: the icon sits at the button's start, and the sparks leave from there. */}
      {finished !== null && !loading && (
        <SparkleBurst key={finished} className="top-[10px] left-[24px]" />
      )}
    </span>
  );
}
