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
import { autoFocusFirstField } from '@/shared/lib/focus';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Status pills of the record, shown in the header under the description. */
  readonly meta?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Wider panels hold details with two columns (photos, intervals, tables). */
  readonly size?: DetailSheetSize;
}

type DetailSheetSize = 'default' | 'medium' | 'wide';

// The base sheet caps its width through a side variant; only that variant overrides it.
const SIZE_CLASS: Readonly<Record<DetailSheetSize, string>> = {
  default: 'sm:max-w-xl',
  medium: 'data-[side=right]:w-full data-[side=right]:sm:max-w-2xl',
  wide: 'data-[side=right]:w-full data-[side=right]:sm:max-w-3xl',
};

/**
 * Side panel for the details of one row: history, forms and actions live here instead of
 * expanding inside the table, so the list stays readable and the panel has room.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  meta,
  children,
  footer,
  size = 'default',
}: Props) {
  const t = messages(currentLocale()).ui.common;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn('flex w-full min-w-0 flex-col gap-0 p-0', SIZE_CLASS[size])}
        aria-label={t.closePanel}
        onOpenAutoFocus={autoFocusFirstField}
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
          {meta ? <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div> : null}
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex min-w-0 max-w-full flex-col gap-4 px-6 py-4">{children}</div>
        </ScrollArea>
        {footer ? <SheetFooter className="border-t px-6 py-4">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
