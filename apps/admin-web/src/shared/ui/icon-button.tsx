import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Slot } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Icon sizes omit the default visible label; names and keyboard help remain, even when disabled. */
export function IconButton({
  icon: Icon,
  label,
  tooltip,
  children,
  disabled,
  size,
  ...props
}: ComponentProps<typeof Button> & {
  icon: LucideIcon;
  label: string;
  tooltip: string;
}) {
  const iconOnly = size?.startsWith('icon') ?? false;
  const control = (
    <Button
      type="button"
      disabled={disabled}
      size={size}
      aria-label={iconOnly ? label : undefined}
      {...props}
    >
      <Icon aria-hidden="true" />
      <Slot.Slottable>{children ?? (iconOnly ? null : label)}</Slot.Slottable>
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
        <TooltipContent>
          {iconOnly && !tooltip.startsWith(label) && <div className="font-medium">{label}</div>}
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
