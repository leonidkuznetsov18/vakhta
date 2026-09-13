import { useQuery } from '@tanstack/react-query';
import { retrospectiveApi } from '../api/retrospective-api';
import { scheduleKeys } from './ownership';

export function useRetrospective(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly orgUnitId: string;
  readonly month: string;
  readonly enabled: boolean;
}) {
  return useQuery({
    queryKey: [
      ...scheduleKeys.all(input.accessKey),
      'retrospective',
      input.siteId,
      input.orgUnitId,
      input.month,
    ],
    queryFn: ({ signal }) =>
      retrospectiveApi.view(
        { siteId: input.siteId, orgUnitId: input.orgUnitId, periodMonth: input.month },
        signal,
      ),
    enabled: input.enabled && !!input.siteId && !!input.orgUnitId,
  });
}
