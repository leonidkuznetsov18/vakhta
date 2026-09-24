import { z } from 'zod';
import { apiFetch } from '@/api';
import { SavePatternCommand, SchedulePatternView } from '@vakhta/contracts';

const root = '/admin/schedules/patterns';

/** Saved batch inputs of a site (SC-26). */
export const patternsApi = {
  async list(siteId: string, signal: AbortSignal) {
    const query = new URLSearchParams({ siteId });
    return z.array(SchedulePatternView).parse(await apiFetch(`${root}?${query}`, { signal }));
  },
  async save(input: SavePatternCommand) {
    return SchedulePatternView.parse(
      await apiFetch(root, {
        method: 'POST',
        body: JSON.stringify(SavePatternCommand.parse(input)),
      }),
    );
  },
};
