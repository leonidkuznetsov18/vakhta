import type { HandoverPhotoView } from '@vakhta/contracts';
import { QueryFeedback, type QueryFeedbackState } from '@/components/app/query-feedback';
import { InspectionPhotoNavigation, type PhotoNavigation } from './photo-navigation';

export const inspectionLayoutClass =
  'grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto lg:overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)] lg:grid-rows-[minmax(0,1fr)]';
export const inspectionViewportClass =
  'relative h-[min(55dvh,36rem)] w-full shrink-0 overflow-auto rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring data-[panning=true]:cursor-grabbing lg:h-auto lg:min-h-0 lg:flex-1 lg:aspect-auto! lg:[container-type:size]';

export function InspectionLoading({
  photo,
  query,
  navigation,
  errorMessage,
}: {
  errorMessage?: string;
  photo: HandoverPhotoView;
  query: QueryFeedbackState;
  navigation?: PhotoNavigation;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="h-11 shrink-0" />
      <div className={inspectionLayoutClass}>
        <div className="relative flex min-w-0 flex-col gap-2 lg:min-h-0">
          <div
            data-testid="inspection-image-viewport"
            className={inspectionViewportClass}
            style={{ aspectRatio: `${photo.media.width ?? 4} / ${photo.media.height ?? 3}` }}
          >
            <div className="absolute inset-0 flex items-center justify-center p-3">
              <QueryFeedback query={query} errorMessage={errorMessage} />
            </div>
          </div>
          {navigation && <InspectionPhotoNavigation navigation={navigation} />}
        </div>
      </div>
      <div className="h-20 shrink-0 border-t sm:h-14" />
    </div>
  );
}
