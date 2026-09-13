import { useQuery } from '@tanstack/react-query';
import { staffingApi } from '../api/staffing-api';
import { scheduleKeys } from './ownership';

export const operationsKey = (
  access: string,
  siteId: string,
  orgUnitId: string,
  from: string,
  to: string,
) => [...scheduleKeys.all(access), 'operations', siteId, orgUnitId, from, to] as const;

/** Presence evidence and request context of the visible dates (#17); freshness is shown, not assumed. */
export function useOperations(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly orgUnitId: string;
  readonly dates: readonly string[];
  readonly enabled: boolean;
}) {
  const from = input.dates[0] ?? '';
  const to = input.dates.at(-1) ?? '';
  return useQuery({
    queryKey: operationsKey(input.accessKey, input.siteId, input.orgUnitId, from, to),
    queryFn: ({ signal }) =>
      staffingApi.operations(
        { siteId: input.siteId, orgUnitId: input.orgUnitId, from, to },
        signal,
      ),
    enabled: input.enabled && !!input.siteId && !!input.orgUnitId && !!from && !!to,
    staleTime: 30_000,
  });
}
