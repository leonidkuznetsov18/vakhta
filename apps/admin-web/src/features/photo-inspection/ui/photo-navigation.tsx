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

/** Desktop arrows stay outside the zoom plane; phone navigation follows the image in reading order. */
export function InspectionPhotoNavigation({ navigation }: { navigation: PhotoNavigation }) {
  const t = messages(currentLocale()).photoInspection;
  return (
    <div className="flex items-center justify-between gap-2 lg:pointer-events-none lg:absolute lg:inset-x-3 lg:top-1/2 lg:-translate-y-1/2">
      <IconButton
        icon={ArrowLeftIcon}
        label={t.previous}
        tooltip={t.hints.previous}
        variant="outline"
        className="bg-background max-[359px]:size-10 max-[359px]:p-0 lg:pointer-events-auto lg:size-10 lg:rounded-full lg:p-0 lg:shadow-sm"
        disabled={navigation.index <= 0}
        onClick={() => {
          if (navigation.index > 0) navigation.previous();
        }}
      >
        <span className="max-[359px]:sr-only lg:sr-only">{t.previous}</span>
      </IconButton>
      <IconButton
        icon={ArrowRightIcon}
        label={t.next}
        tooltip={t.hints.next}
        variant="outline"
        className="bg-background max-[359px]:size-10 max-[359px]:p-0 lg:pointer-events-auto lg:size-10 lg:rounded-full lg:p-0 lg:shadow-sm"
        disabled={navigation.index >= navigation.count - 1}
        onClick={() => {
          if (navigation.index < navigation.count - 1) navigation.next();
        }}
      >
        <span className="max-[359px]:sr-only lg:sr-only">{t.next}</span>
      </IconButton>
    </div>
  );
}
