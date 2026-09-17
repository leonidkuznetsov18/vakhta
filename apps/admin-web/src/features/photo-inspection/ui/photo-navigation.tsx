import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { IconButton } from '@/shared/ui/icon-button';

export interface PhotoNavigation {
  index: number;
  count: number;
  previous: () => void;
  next: () => void;
}

/** Arrows stay outside the zoom plane and visible while tall photos scroll. */
export function InspectionPhotoNavigation({ navigation }: { navigation: PhotoNavigation }) {
  const t = messages(currentLocale()).photoInspection;
  return (
    <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-center justify-between gap-2">
      <IconButton
        icon={ArrowLeftIcon}
        label={t.previous}
        tooltip={t.hints.previous}
        variant="outline"
        className="pointer-events-auto size-10 rounded-full bg-background p-0 shadow-sm"
        disabled={navigation.index <= 0}
        onClick={() => {
          if (navigation.index > 0) navigation.previous();
        }}
      >
        <span className="sr-only">{t.previous}</span>
      </IconButton>
      <IconButton
        icon={ArrowRightIcon}
        label={t.next}
        tooltip={t.hints.next}
        variant="outline"
        className="pointer-events-auto size-10 rounded-full bg-background p-0 shadow-sm"
        disabled={navigation.index >= navigation.count - 1}
        onClick={() => {
          if (navigation.index < navigation.count - 1) navigation.next();
        }}
      >
        <span className="sr-only">{t.next}</span>
      </IconButton>
    </div>
  );
}
