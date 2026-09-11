import { describe, expect, it } from 'vitest';
import { format, messages } from '@vakhta/i18n';
import { analysisLimitsView } from './analysis-limits';

const t = messages('en').photoInspection;
const available = {
  windowHours: 8,
  perPhoto: { used: 2, limit: 7 },
  global: { used: 10, limit: 37 },
};
const ready = { data: available, isError: false, fetchStatus: 'idle' as const };

describe('analysis quota presentation', () => {
  it('shows effective server values rather than fixed defaults', () => {
    expect(analysisLimitsView(ready, t)).toEqual({
      status: 'ready',
      summary: format(t.analysisLimitsSummary, {
        photoUsed: 2,
        photoLimit: 7,
        totalUsed: 10,
        totalLimit: 37,
        hours: 8,
      }),
      disabledReason: null,
    });
  });
  it.each(['perPhoto', 'global'] as const)(
    'blocks the exact %s boundary and explains it',
    (key) => {
      const data = {
        ...available,
        [key]: { used: available[key].limit, limit: available[key].limit },
      };
      const view = analysisLimitsView({ ...ready, data }, t);
      expect(view.disabledReason).toBe(
        format(key === 'perPhoto' ? t.analysisPhotoLimitReached : t.analysisGlobalLimitReached, {
          limit: available[key].limit,
          hours: available.windowHours,
        }),
      );
      expect(analysisLimitsView(ready, t).disabledReason).toBeNull();
    },
  );
  it('explains both exhausted limits, including usage above a lowered limit', () => {
    const data = { ...available, perPhoto: { used: 9, limit: 7 }, global: { used: 40, limit: 37 } };
    const reason = analysisLimitsView({ ...ready, data }, t).disabledReason;
    expect(reason).toContain(format(t.analysisPhotoLimitReached, { limit: 7, hours: 8 }));
    expect(reason).toContain(format(t.analysisGlobalLimitReached, { limit: 37, hours: 8 }));
  });
  it('keeps cached usage visible but blocks requests after a refresh failure or while offline', () => {
    expect(analysisLimitsView({ ...ready, isError: true }, t)).toMatchObject({
      status: 'error',
      disabledReason: t.analysisLimitsUnavailable,
      summary: analysisLimitsView(ready, t).summary,
    });
    expect(analysisLimitsView({ ...ready, fetchStatus: 'paused' }, t)).toMatchObject({
      status: 'offline',
      disabledReason: t.analysisLimitsOffline,
    });
    expect(analysisLimitsView({ ...ready, data: undefined, fetchStatus: 'fetching' }, t)).toEqual({
      status: 'checking',
      disabledReason: t.analysisLimitsChecking,
      summary: null,
    });
  });
});
