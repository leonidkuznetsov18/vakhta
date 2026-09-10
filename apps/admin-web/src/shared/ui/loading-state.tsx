import { cn } from 'cn';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Spinner } from '@/components/ui/spinner';

/** The panel's only loading presentation; optional text describes the operation. */
export function LoadingState({ label, className }: { label?: string; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center justify-center gap-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <Spinner aria-hidden="true" role={undefined} aria-label={undefined} className="shrink-0" />
      <span className={label ? undefined : 'sr-only'}>
        {label ?? messages(currentLocale()).ui.common.loading}
      </span>
    </span>
  );
}
