import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateScheduleNoteCommand, ScheduleNoteView } from '@vakhta/contracts';
import { notesApi } from '../api/notes-api';
import { scheduleKeys } from './ownership';

export const notesKey = (access: string, siteId: string, orgUnitId: string, month: string) =>
  [...scheduleKeys.all(access), 'notes', siteId, orgUnitId, month] as const;

/** Notes of the unit month; every write refreshes the same list. */
export function useNotes(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly orgUnitId: string;
  readonly month: string;
  readonly enabled: boolean;
}) {
  const client = useQueryClient();
  const key = notesKey(input.accessKey, input.siteId, input.orgUnitId, input.month);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      notesApi.list(
        { siteId: input.siteId, orgUnitId: input.orgUnitId, periodMonth: input.month },
        signal,
      ),
    enabled: input.enabled && !!input.siteId && !!input.orgUnitId,
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: (command: CreateScheduleNoteCommand) => notesApi.create(command),
    retry: false,
    networkMode: 'always',
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => notesApi.remove(id),
    retry: false,
    networkMode: 'always',
    onSuccess: refresh,
  });
  const notes: readonly ScheduleNoteView[] = query.data ?? [];
  return { query, notes, create, remove, busy: create.isPending || remove.isPending };
}
export type Notes = ReturnType<typeof useNotes>;

/** Notes that apply to a date: unit-wide, the zone, or the person; month-wide notes come first. */
export function notesFor(
  notes: readonly ScheduleNoteView[],
  target: {
    readonly date: string;
    readonly zoneId?: string | null;
    readonly employeeId?: string | null;
  },
): ScheduleNoteView[] {
  return notes.filter(
    (note) =>
      (note.businessDate === null || note.businessDate === target.date) &&
      (note.zoneId === null || note.zoneId === target.zoneId) &&
      (note.employeeId === null || note.employeeId === target.employeeId),
  );
}
