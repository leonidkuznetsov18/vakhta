import type { ReactNode } from 'react';
import type { OrgSnapshot } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { UnitShiftsSection } from './unit-shifts-section';

const t = messages(currentLocale()).unitShifts;

/**
 * One unit's settings (spec 013): its shift master, provided by the page, and its own shifts.
 * Everyone reads it; only an administrator changes anything.
 */
export function UnitSheet({
  unit,
  siteName,
  parentName,
  editable,
  master,
  onClose,
}: {
  readonly unit: OrgSnapshot['orgUnits'][number];
  readonly siteName: string;
  readonly parentName: string | null;
  readonly editable: boolean;
  readonly master: ReactNode;
  readonly onClose: () => void;
}) {
  const place = parentName ? format(t.inParent, { parent: parentName }) : siteName;
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{unit.name}</SheetTitle>
          <SheetDescription>{editable ? place : `${place} · ${t.viewOnly}`}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-8">
          {master}
          <UnitShiftsSection key={unit.id} unit={unit} editable={editable} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
