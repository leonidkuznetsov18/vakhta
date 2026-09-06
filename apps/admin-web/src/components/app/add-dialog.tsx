import type { ReactNode } from 'react';
import { PlusIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { autoFocusFirstField } from '@/components/app/focus';
import { InfoTip } from '@/components/app/info-tip';
import { currentLocale } from '@/i18n';

interface Props {
  readonly title: string;
  readonly hint?: string;
  readonly description?: string;
  /** Trigger label; defaults to "Add". */
  readonly trigger?: string;
  readonly triggerVariant?: 'default' | 'secondary' | 'outline';
  /** No trigger: the dialog is opened by a row action or another control. */
  readonly hideTrigger?: boolean;
  /** Wider dialog for forms with a preview column. */
  readonly wide?: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}

/**
 * "Add" button that opens a dialog with a creation form. Keeps tables first on the page and
 * gives every create form the same width and rhythm.
 */
export function AddDialog({
  title,
  hint,
  description,
  trigger,
  triggerVariant = 'default',
  hideTrigger = false,
  wide = false,
  open,
  onOpenChange,
  children,
}: Props) {
  const t = messages(currentLocale()).ui.common;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button type="button" variant={triggerVariant}>
            <PlusIcon aria-hidden="true" />
            {trigger ?? t.add}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className={wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'}
        onOpenAutoFocus={autoFocusFirstField}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1">
            {title}
            {hint ? <InfoTip text={hint} /> : null}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
