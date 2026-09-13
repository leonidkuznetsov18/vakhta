import { useQuery } from '@tanstack/react-query';
import { staffingApi } from '../api/staffing-api';
import { scheduleKeys } from './ownership';

/** Holidays, birthdays, absences and replacement needs for the visible dates. */
export function useCalendarEvents(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly orgUnitId: string;
  readonly dates: readonly string[];
  readonly enabled: boolean;
}) {
  const from = input.dates[0] ?? '';
  const to = input.dates.at(-1) ?? '';
  return useQuery({
    queryKey: [
      ...scheduleKeys.all(input.accessKey),
      'events',
      input.siteId,
      input.orgUnitId,
      from,
      to,
    ],
    queryFn: ({ signal }) =>
      staffingApi.events({ siteId: input.siteId, orgUnitId: input.orgUnitId, from, to }, signal),
    enabled: input.enabled && !!input.siteId && !!input.orgUnitId && !!from && !!to,
    staleTime: 60_000,
  });
}

/** Today's holiday, birthdays, sick leaves and the week's replacement needs (Overview card). */
export function useScheduleAttention(input: {
  readonly accessKey: string;
  readonly siteId: string;
}) {
  return useQuery({
    queryKey: [...scheduleKeys.all(input.accessKey), 'attention', input.siteId],
    queryFn: ({ signal }) => staffingApi.attention({ siteId: input.siteId }, signal),
    enabled: !!input.siteId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
