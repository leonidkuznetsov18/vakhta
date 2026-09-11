import type { PhotoAnalysisLimits } from '@vakhta/contracts';
import { format, type messages } from '@vakhta/i18n';

type Labels = ReturnType<typeof messages>['photoInspection'];
export interface AnalysisLimitsView {
  status: 'checking' | 'error' | 'offline' | 'ready';
  summary: string | null;
  disabledReason: string | null;
}

export function analysisLimitsView(
  query: {
    data: PhotoAnalysisLimits | undefined;
    isError: boolean;
    fetchStatus: 'fetching' | 'paused' | 'idle';
  },
  t: Labels,
): AnalysisLimitsView {
  const limits = query.data;
  const summary = limits
    ? format(t.analysisLimitsSummary, {
        photoUsed: limits.perPhoto.used,
        photoLimit: limits.perPhoto.limit,
        totalUsed: limits.global.used,
        totalLimit: limits.global.limit,
        hours: limits.windowHours,
      })
    : null;
  if (query.fetchStatus === 'paused')
    return { status: 'offline', summary, disabledReason: t.analysisLimitsOffline };
  if (query.isError)
    return { status: 'error', summary, disabledReason: t.analysisLimitsUnavailable };
  if (!limits) return { status: 'checking', summary, disabledReason: t.analysisLimitsChecking };
  const photoReached = limits.perPhoto.used >= limits.perPhoto.limit;
  const totalReached = limits.global.used >= limits.global.limit;
  const reasons = [
    photoReached
      ? format(t.analysisPhotoLimitReached, {
          limit: limits.perPhoto.limit,
          hours: limits.windowHours,
        })
      : null,
    totalReached
      ? format(t.analysisGlobalLimitReached, {
          limit: limits.global.limit,
          hours: limits.windowHours,
        })
      : null,
  ].filter((reason) => reason !== null);
  return { status: 'ready', summary, disabledReason: reasons.length ? reasons.join(' ') : null };
}
