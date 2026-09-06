import { useEffect, useState } from 'react';
import { InfoIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

const TRIGGER_CLASS =
  'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted/80';

/** True when the element got its focus from the keyboard (Tab), not from a script or a click. */
function isKeyboardFocus(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/** Touch screens have no hover: there the tip opens on tap and closes on tap outside. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(hover: none), (pointer: coarse)');
    const onChange = () => setCoarse(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return coarse;
}

/**
 * Information tip next to a label or heading. Keyboard reachable: the trigger is a button with
 * an accessible name, so screen readers and Tab users get the same text. On touch screens it is
 * a popover, because a tooltip never opens without a hover.
 */
export function InfoTip({
  text,
  className,
}: {
  readonly text: string;
  readonly className?: string;
}) {
  const label = messages(currentLocale()).ui.common.moreInfo;
  const coarse = useCoarsePointer();
  if (coarse) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-info-tip
            className={cn(TRIGGER_CLASS, className)}
          >
            <InfoIcon className="size-3.5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="max-w-xs text-sm text-pretty">
          {text}
        </PopoverContent>
      </Popover>
    );
  }
  // Own provider so the tip works in isolation (pages are also rendered standalone in tests).
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-info-tip
            className={cn(TRIGGER_CLASS, className)}
            onFocus={(event) => {
              // Radix opens the tip on any focus; a programmatic focus (dialog opening) must not.
              if (!isKeyboardFocus(event.currentTarget)) event.preventDefault();
            }}
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
