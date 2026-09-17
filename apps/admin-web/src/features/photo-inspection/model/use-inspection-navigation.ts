import type { HandoverPhotoView } from '@vakhta/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { usePreparedPhoto } from '@/shared/lib/use-prepared-photo';
import {
  cachedInspectionPhoto,
  inspectionKey,
  prepareInspectionPhoto,
} from '../api/inspection-api';

export function useInspectionNavigation({
  handoverId,
  sessionId,
  current,
  onChange,
}: {
  handoverId: string;
  sessionId: string;
  current: HandoverPhotoView;
  onChange?: ((photo: HandoverPhotoView) => void) | undefined;
}) {
  const client = useQueryClient();
  const identity = (photo: HandoverPhotoView) => ({
    handoverId,
    mediaId: photo.media.id,
    itemKey: photo.itemKey,
  });
  const change = (next: HandoverPhotoView) => {
    if (next.media.id === current.media.id && next.itemKey === current.itemKey) return;
    // Reuse pixels, but never initialize an editable review from an obsolete snapshot.
    client.removeQueries({ queryKey: inspectionKey(identity(next)), exact: true });
    onChange?.(next);
  };
  const preparation = usePreparedPhoto({
    current,
    isReady: (next) => Boolean(cachedInspectionPhoto(client, identity(next), sessionId)),
    prepare: (next) => prepareInspectionPhoto(client, identity(next), sessionId),
    onChange: change,
  });
  return { ...preparation, skip: change };
}
