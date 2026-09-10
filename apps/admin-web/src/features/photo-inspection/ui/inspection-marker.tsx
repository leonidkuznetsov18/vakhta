import type { HandoverPhotoView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { CheckCheckIcon, PencilLineIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';

/** Only persisted human work is supplied by the handover API; AI requests have no marker. */
export function InspectionMarker({ inspection }: { inspection: HandoverPhotoView['inspection'] }) {
  if (!inspection) return null;
  const t = messages(currentLocale()).photoInspection;
  const unfinished = inspection.status === 'UNREVIEWED';
  const Icon = unfinished ? PencilLineIcon : CheckCheckIcon;
  const label =
    inspection.annotationCount > 0
      ? t.marker.annotated
      : unfinished
        ? t.marker.draft
        : t.marker.reviewed;
  return (
    <div
      className="flex min-w-0 items-start gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
      data-testid="inspection-marker"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
      <span className="min-w-0 break-words">
        <strong>{label}</strong>
        <span className="block text-muted-foreground">
          {unfinished ? t.marker.incomplete : t.statuses[inspection.status]} · {t.marker.regions}:{' '}
          {inspection.annotationCount}
        </span>
      </span>
    </div>
  );
}
