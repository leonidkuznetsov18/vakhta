import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { XIcon } from 'lucide-react';
import type { Button } from '@/components/ui/button';
import { IconButton } from '@/shared/ui/icon-button';

type Variant = NonNullable<ComponentProps<typeof Button>['variant']>;

export interface DialogAction {
  readonly label: string;
  /** What the action does, shown on hover. */
  readonly tooltip: string;
  readonly icon: LucideIcon;
  readonly variant?: Variant;
  readonly pending?: boolean;
  readonly disabled?: boolean;
  /** Submits the enclosing form unless the dialog handles the click itself. */
  readonly onClick?: () => void;
}

/**
 * The two actions at the foot of a dialog (owner rule, 2026-09-25): every action is an icon button
 * with a tooltip, cancel on the left and the one that changes something on the right.
 */
export function DialogActions({
  cancel,
  action,
}: {
  readonly cancel: {
    readonly label: string;
    readonly tooltip: string;
    readonly onSelect: () => void;
  };
  readonly action: DialogAction;
}) {
  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      <IconButton
        icon={XIcon}
        label={cancel.label}
        tooltip={cancel.tooltip}
        type="button"
        variant="outline"
        onClick={cancel.onSelect}
      />
      <IconButton
        icon={action.icon}
        label={action.label}
        tooltip={action.tooltip}
        type={action.onClick ? 'button' : 'submit'}
        variant={action.variant ?? 'default'}
        pending={action.pending ?? false}
        disabled={action.disabled ?? false}
        onClick={action.onClick}
      />
    </div>
  );
}
