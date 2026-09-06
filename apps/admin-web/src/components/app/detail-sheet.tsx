import type { ReactNode } from 'react';
import { messages } from '@vakhta/i18n';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Wider panel for details with two columns (photos, intervals). */
  readonly wide?: boolean;
}

/**
 * Side panel for the details of one row: history, forms and actions live here instead of
 * expanding inside the table, so the list stays readable and the panel has room.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide = false,
}: Props) {
  const t = messages(currentLocale()).ui.common;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn('flex w-full min-w-0 flex-col gap-0 p-0 sm:max-w-xl', wide && 'sm:max-w-3xl')}
        aria-label={t.closePanel}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex min-w-0 max-w-full flex-col gap-4 px-6 py-4">{children}</div>
        </ScrollArea>
        {footer ? <SheetFooter className="border-t px-6 py-4">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
