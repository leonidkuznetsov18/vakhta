import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Slot } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** A labeled action with a decorative icon and keyboard-accessible help, even when disabled. */
export function IconButton({
  icon: Icon,
  label,
  tooltip,
  children,
  disabled,
  ...props
}: ComponentProps<typeof Button> & {
  icon: LucideIcon;
  label: string;
  tooltip: string;
}) {
  const control = (
    <Button type="button" disabled={disabled} {...props}>
      <Icon aria-hidden="true" />
      <Slot.Slottable>{children ?? label}</Slot.Slottable>
    </Button>
  );
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? (
            <span
              className="inline-flex min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              tabIndex={disabled ? 0 : undefined}
              aria-label={disabled ? label : undefined}
            >
              {control}
            </span>
          ) : (
            control
          )}
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
