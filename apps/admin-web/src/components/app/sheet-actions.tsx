import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { IconButton } from '@/shared/ui/icon-button';

type Variant = NonNullable<ComponentProps<typeof Button>['variant']>;

export interface SheetAction {
  readonly key: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** What the action does, shown on hover; the label alone when it says enough. */
  readonly tooltip?: string;
  /** Why the action is unavailable; replaces the tooltip while disabled. */
  readonly disabledHint?: string;
  readonly variant?: Variant;
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly onSelect: () => void;
}

function tooltipOf(action: SheetAction): string {
  if (action.disabled && action.disabledHint) return action.disabledHint;
  return action.tooltip ?? action.label;
}

/**
 * The actions of a side panel's footer (owner rule, 2026-09-25): every action stays in view with
 * its icon and a tooltip; a wide screen also shows the label, a phone keeps the icons alone.
 */
export function SheetActions({ actions }: { readonly actions: readonly SheetAction[] }) {
  const mobile = useIsMobile();
  return actions.map((action) => (
    <IconButton
      key={action.key}
      icon={action.icon}
      label={action.label}
      tooltip={tooltipOf(action)}
      variant={action.variant ?? 'outline'}
      size={mobile ? 'icon' : undefined}
      disabled={action.disabled}
      pending={action.pending}
      onClick={action.onSelect}
    />
  ));
}
