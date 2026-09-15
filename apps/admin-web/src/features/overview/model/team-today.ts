import { useQueries } from '@tanstack/react-query';
import {
  ScheduleAttentionView,
  type AbsenceEventView,
  type ReplacementNeedView,
} from '@vakhta/contracts';
import { apiFetch } from '@/api';

/** Today's people facts per site from the schedule slice's attention endpoint (read-only). */
export function useTeamToday(siteIds: readonly string[], enabled: boolean) {
  const results = useQueries({
    queries: siteIds.map((siteId) => ({
      // Under the overview prefix: every live event that refreshes the overview refreshes this too.
      queryKey: ['overview', 'team-today', siteId] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        ScheduleAttentionView.parse(
          await apiFetch(`/admin/schedules/staffing/attention?${new URLSearchParams({ siteId })}`, {
            signal,
          }),
        ),
      enabled: enabled && !!siteId,
      staleTime: 60_000,
      refetchInterval: 5 * 60_000,
    })),
  });
  const views = results.flatMap((r) => (r.data ? [r.data] : []));
  return {
    team: views.length > 0 ? buildTeamToday(views) : null,
    loading: results.some((r) => r.isPending && r.isFetching),
    /** A site read that failed or waits for the network while nothing else could be shown. */
    failed:
      results.some((r) => r.isError || (r.isPending && r.fetchStatus === 'paused')) &&
      views.length < results.length,
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}

export interface ReplacementDay {
  readonly date: string;
  readonly shifts: readonly ReplacementNeedView[];
}

export interface TeamToday {
  readonly holiday: string | null;
  readonly sick: readonly AbsenceEventView[];
  readonly replacements: readonly ReplacementDay[];
  readonly replacementCount: number;
  readonly birthdays: readonly string[];
}

const ANSWER_RANK = { WORSE: 0, SAME: 1, GOOD: 2 } as const;

/**
 * One picture across the selected sites: people on sick leave with the worst-feeling and
 * unanswered first, unfilled shifts grouped by date, and today's birthdays without duplicates.
 */
export function buildTeamToday(views: readonly ScheduleAttentionView[]): TeamToday {
  const sick = [
    ...new Map(views.flatMap((v) => v.onSickLeave).map((a) => [a.employeeId, a])).values(),
  ].sort(
    (a, b) =>
      (a.lastCheckin ? ANSWER_RANK[a.lastCheckin.answer] : -1) -
        (b.lastCheckin ? ANSWER_RANK[b.lastCheckin.answer] : -1) || a.to.localeCompare(b.to),
  );
  const shifts = [
    ...new Map(views.flatMap((v) => v.replacements).map((r) => [r.assignmentId, r])).values(),
  ];
  const byDate = new Map<string, ReplacementNeedView[]>();
  for (const shift of shifts)
    byDate.set(shift.businessDate, [...(byDate.get(shift.businessDate) ?? []), shift]);
  return {
    holiday: views.find((v) => v.holiday)?.holiday ?? null,
    sick,
    replacements: [...byDate]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({ date, shifts: list })),
    replacementCount: shifts.length,
    birthdays: [...new Set(views.flatMap((v) => v.birthdaysToday))],
  };
}
