import { queryOptions } from '@tanstack/react-query';
import type { ShiftTemplatesQuery } from '@vakhta/contracts';
import { readShiftTemplates } from '../api/shift-templates';

export const shiftTemplateKeys = {
  all: ['shift-templates'] as const,
  list: (query: ShiftTemplatesQuery) =>
    [
      'shift-templates',
      query.siteId,
      query.orgUnitId ?? null,
      query.includeRetired ?? false,
    ] as const,
};

/** Site defaults, plus the unit's shifts when a unit is given; retired versions on request. */
export function shiftTemplatesQuery(query: ShiftTemplatesQuery) {
  return queryOptions({
    queryKey: shiftTemplateKeys.list(query),
    queryFn: ({ signal }) => readShiftTemplates(query, signal),
    enabled: !!query.siteId,
  });
}
