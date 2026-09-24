import { queryOptions, useQuery } from '@tanstack/react-query';
import type { MeView } from '@vakhta/contracts';
import { overviewApi } from '@/api';
import { keys } from '@/lib/query';
import { usePersistentState } from '@/lib/ui-store';
import type { OverviewSelection } from './destination';

/** Remembered per browser; the server narrows it to the reader's grants and rejects the rest. */
export function useOverviewSelection(): [OverviewSelection, (next: OverviewSelection) => void] {
  const [selection, setSelection] = usePersistentState<OverviewSelection>('overview.selection', {
    siteId: null,
    orgUnitId: null,
  });
  return [selection, setSelection];
}

/** The current-shift snapshot (spec 004 US2–US6); keyed by selection, polled as a fallback. */
export function useOverviewSnapshot(me: MeView, selection: OverviewSelection, intervalMs = 60_000) {
  const q = {
    ...(selection.siteId ? { siteId: selection.siteId } : {}),
    ...(selection.orgUnitId ? { orgUnitId: selection.orgUnitId } : {}),
  };
  return useQuery({
    queryKey: keys.overview(q),
    queryFn: () => overviewApi.snapshot(q),
    enabled: me.id !== '' && me.roles.length > 0,
    refetchInterval: intervalMs,
    placeholderData: (previous) => previous,
  });
}

/**
 * The same snapshot read by another screen for its staffing. No placeholder: after a scope change
 * the previous scope's people must not stand in for the new one.
 */
export function useOverviewStaffing(selection: OverviewSelection, intervalMs = 60_000) {
  const q = {
    ...(selection.siteId ? { siteId: selection.siteId } : {}),
    ...(selection.orgUnitId ? { orgUnitId: selection.orgUnitId } : {}),
  };
  return useQuery(
    queryOptions({
      queryKey: keys.overview(q),
      queryFn: () => overviewApi.snapshot(q),
      refetchInterval: intervalMs,
    }),
  );
}

/** Recent operational events for the feed (spec 004 US8). */
export function useOverviewEvents(me: MeView, selection: OverviewSelection, enabled: boolean) {
  const q = {
    ...(selection.siteId ? { siteId: selection.siteId } : {}),
    ...(selection.orgUnitId ? { orgUnitId: selection.orgUnitId } : {}),
    limit: 30,
  };
  return useQuery({
    queryKey: keys.overviewEvents(q),
    queryFn: () => overviewApi.events(q),
    enabled: enabled && me.id !== '',
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
}
