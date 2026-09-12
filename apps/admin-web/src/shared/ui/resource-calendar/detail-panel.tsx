import type { ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { IconButton } from '@/shared/ui/icon-button';

export function CalendarDetailPanel({
  open,
  title,
  description,
  onClose,
  onRestoreFocus,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly onRestoreFocus: () => void;
  readonly children: ReactNode;
}) {
  const closeLabel = messages(currentLocale()).ui.common.close;
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <SheetContent
        showCloseButton={false}
        overlayClassName="supports-backdrop-filter:backdrop-blur-none"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg gap-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <SheetHeader className="border-b p-6 pr-16">
          <SheetTitle className="text-lg [overflow-wrap:anywhere]">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <IconButton
          icon={XIcon}
          label={closeLabel}
          tooltip={closeLabel}
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4"
          onClick={onClose}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
