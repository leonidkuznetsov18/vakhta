import { useQueries } from '@tanstack/react-query';
import type { ScheduleVersionView, AssignmentView } from '@vakhta/contracts';
import { useNavigation } from '@/navigation';
import { scheduleApi } from '../api/schedule-api';
import { scheduleKeys } from './ownership';
import { EMPTY_GRID, workingVersion } from './planning';
import { gridFromDetail, gridFromItems, gridToItems, type GridState } from './grid';

export interface AdjacentPlan {
  /** Months other than the loaded one that the visible period touches. */
  readonly months: readonly string[];
  /** Their working plans merged for display; never a write payload. */
  readonly grid: GridState;
  readonly published: GridState;
  readonly recorded: readonly AssignmentView[];
  readonly versions: readonly { readonly month: string; readonly version: ScheduleVersionView }[];
  readonly loading: boolean;
  readonly failed: boolean;
}

/**
 * A week that crosses a month boundary reads the neighbouring month with the same role rule as
 * the loaded month. Reads only: writes stay owned by the loaded month's version (D-05).
 */
export function useAdjacentPlan(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly orgUnitId: string;
  readonly month: string;
  readonly rights: { readonly edit: boolean; readonly publish: boolean };
  readonly dates: readonly string[];
}): AdjacentPlan {
  const { actorId } = useNavigation();
  const months = [...new Set(input.dates.map((date) => date.slice(0, 7)))].filter(
    (month) => month !== input.month,
  );
  const enabled = !!actorId && !!input.siteId && !!input.orgUnitId;
  const lists = useQueries({
    queries: months.map((month) => {
      const listInput = { siteId: input.siteId, orgUnitId: input.orgUnitId, periodMonth: month };
      return {
        queryKey: scheduleKeys.list(input.accessKey, listInput),
        queryFn: ({ signal }: { signal: AbortSignal }) => scheduleApi.list(listInput, signal),
        enabled,
      };
    }),
  });
  const versions = lists.flatMap((query, index) => {
    const month = months[index];
    const version = query.data ? workingVersion(query.data, input.rights) : null;
    return month && version ? [{ month, version }] : [];
  });
  const publishedIds = lists.flatMap(
    (query) => query.data?.filter((v) => v.status === 'PUBLISHED').map((v) => v.id) ?? [],
  );
  const ids = [...new Set([...versions.map((v) => v.version.id), ...publishedIds])];
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: scheduleKeys.detail(input.accessKey, id),
      queryFn: ({ signal }: { signal: AbortSignal }) => scheduleApi.detail(id, signal),
      enabled,
    })),
  });
  const detailOf = (id: string) => details[ids.indexOf(id)]?.data;
  const workingItems = versions.flatMap((entry) => {
    const detail = detailOf(entry.version.id);
    return detail ? gridToItems(gridFromDetail(detail)) : [];
  });
  const publishedItems = publishedIds.flatMap((id) => {
    const detail = detailOf(id);
    return detail ? gridToItems(gridFromDetail(detail)) : [];
  });
  const recorded = versions.flatMap((entry) => detailOf(entry.version.id)?.assignments ?? []);
  const queries = [...lists, ...details];
  return {
    months,
    grid: workingItems.length ? gridFromItems(workingItems) : EMPTY_GRID,
    published: publishedItems.length ? gridFromItems(publishedItems) : EMPTY_GRID,
    recorded,
    versions,
    loading: queries.some((query) => query.isPending && query.fetchStatus !== 'idle'),
    failed: queries.some((query) => query.isError),
  };
}
