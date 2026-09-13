import { z } from 'zod';
import { apiFetch } from '@/api';
import { CreateScheduleNoteCommand, ScheduleNoteView, ScheduleNotesQuery } from '@vakhta/contracts';

const root = '/admin/schedules/notes';

/** Notes of a unit month with an explicit audience (SC-39). */
export const notesApi = {
  async list(query: ScheduleNotesQuery, signal: AbortSignal) {
    const params = new URLSearchParams(ScheduleNotesQuery.parse(query));
    return z.array(ScheduleNoteView).parse(await apiFetch(`${root}?${params}`, { signal }));
  },
  async create(input: CreateScheduleNoteCommand) {
    return ScheduleNoteView.parse(
      await apiFetch(root, {
        method: 'POST',
        body: JSON.stringify(CreateScheduleNoteCommand.parse(input)),
      }),
    );
  },
  async remove(id: string) {
    await apiFetch(`${root}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
