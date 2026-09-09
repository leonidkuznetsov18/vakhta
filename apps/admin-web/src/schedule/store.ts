import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GridState } from './grid.ts';

/**
 * Unsaved schedule edits, kept outside React and written to storage.
 *
 * The grid is a month of work: rows added for the people who worked without a schedule, shifts
 * filled in by hand or by a rotation. Holding it in component state alone meant a look at another
 * section — or a reload — threw it away, because leaving the page unmounts it and coming back
 * re-reads the version from the server, which never saw those edits.
 *
 * Keyed by version id, so two months in one session do not overwrite each other, and cleared the
 * moment the version is saved: what the server holds is no longer a draft.
 */
interface ScheduleDrafts {
  readonly drafts: Readonly<Record<string, GridState>>;
  readonly keep: (versionId: string, grid: GridState) => void;
  readonly drop: (versionId: string) => void;
}

export const useScheduleDrafts = create<ScheduleDrafts>()(
  persist(
    (set) => ({
      drafts: {},
      keep: (versionId, grid) => set((s) => ({ drafts: { ...s.drafts, [versionId]: grid } })),
      drop: (versionId) =>
        set((s) => {
          if (!(versionId in s.drafts)) return s;
          const { [versionId]: _dropped, ...rest } = s.drafts;
          return { drafts: rest };
        }),
    }),
    {
      name: 'vakhta.ui.schedule.drafts',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** The draft of a version, read outside React (during a load, before the state is set). */
export function draftOf(versionId: string): GridState | undefined {
  return useScheduleDrafts.getState().drafts[versionId];
}
