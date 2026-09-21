import { useState, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Information remains available on touch screens as well as hover and keyboard focus. */
export function InfoTooltip({
  label,
  text,
  children,
}: {
  label: string;
  text: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={(event) => {
              event.preventDefault();
              setOpen(!open);
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-accent active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:size-11"
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[min(22rem,calc(100vw-2rem))] text-sm leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
