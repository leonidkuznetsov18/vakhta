import { InfoIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

/**
 * Information tooltip next to a label or heading. Keyboard reachable: the trigger is a
 * button with an accessible name, so screen readers and Tab users get the same text.
 */
export function InfoTip({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}) {
  const label = messages(currentLocale()).ui.common.moreInfo;
  // Own provider so the tip works in isolation (pages are also rendered standalone in tests).
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted/80',
              className,
            )}
          >
            <InfoIcon className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-pretty">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
