import { photoImageQuery } from '@/shared/lib/photo-image';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cachedInspectionPhoto,
  inspectionQueries,
  type InspectionIdentity,
} from '../api/inspection-api';

/** Display existing pixels while the scoped link request records and checks this viewing. */
export function useInspectionImage(id: InspectionIdentity, sessionId: string) {
  const client = useQueryClient();
  const query = useQuery(inspectionQueries.link(id, sessionId));
  const [freshSource, setFreshSource] = useState<string | null>(null);
  const retrying = freshSource === id.mediaId;
  const cached = retrying ? undefined : cachedInspectionPhoto(client, id, sessionId);
  const url = cached?.url ?? query.data?.url;
  const pixels = useQuery({ ...photoImageQuery(url ?? ''), enabled: Boolean(url) });
  async function retry() {
    setFreshSource(id.mediaId);
    const result = await query.refetch();
    if (result.data)
      await client.prefetchQuery({ ...photoImageQuery(result.data.url), staleTime: 0 });
  }
  return {
    url,
    pixels,
    query,
    revision: retrying ? query.dataUpdatedAt : 0,
    retry: () => void retry(),
  };
}

export type InspectionImage = ReturnType<typeof useInspectionImage>;
