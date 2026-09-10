import type { HandoverPhotoView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { PhotoThumb } from '@/components/app/photo';
import type { ComponentProps } from 'react';
import { currentLocale } from '@/i18n';

/** Only persisted human work is supplied by the handover API; AI requests have no marker. */
export function InspectionPhoto({
  photo,
  ...props
}: Omit<ComponentProps<typeof PhotoThumb>, 'media' | 'label' | 'highlightDescription'> & {
  photo: HandoverPhotoView;
}) {
  const inspection = photo.inspection;
  const t = messages(currentLocale()).photoInspection;
  const unfinished = inspection?.status === 'UNREVIEWED';
  const label =
    (inspection?.annotationCount ?? 0) > 0
      ? t.marker.annotated
      : unfinished
        ? t.marker.draft
        : t.marker.reviewed;
  const description = inspection
    ? `${label}. ${unfinished ? t.marker.incomplete : t.statuses[inspection.status]}. ${t.marker.regions}: ${inspection.annotationCount}`
    : undefined;
  return (
    <PhotoThumb
      {...props}
      media={photo.media}
      label={photo.label}
      highlightDescription={description}
    />
  );
}
