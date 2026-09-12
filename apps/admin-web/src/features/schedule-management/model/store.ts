import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { z } from 'zod';
import { AssignmentInput } from '@vakhta/contracts';
import { countChanges, type GridState } from './grid';

const HISTORY_LIMIT = 20;
const gridSchema = z.object({
  rows: z.array(
    z.object({
      employeeId: z.string(),
      zoneId: z.string(),
      cells: z.record(z.string(), z.string()),
      details: z.record(z.string(), AssignmentInput).optional(),
    }),
  ),
});
const storedSchema = z.object({
  drafts: z.record(z.string(), gridSchema),
  baselines: z.record(z.string(), gridSchema).default({}),
});
interface ScheduleDrafts {
  drafts: Readonly<Record<string, GridState>>;
  baselines: Readonly<Record<string, GridState>>;
  past: Readonly<Record<string, readonly GridState[]>>;
  future: Readonly<Record<string, readonly GridState[]>>;
  recoveryError: boolean;
  restore: (id: string, draft: GridState, baseline: GridState) => void;
  keep: (id: string, next: GridState, baseline: GridState) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  drop: (id: string) => void;
}
export const useScheduleDrafts = create<ScheduleDrafts>()(
  persist(
    (set) => ({
      drafts: {},
      baselines: {},
      past: {},
      future: {},
      recoveryError: false,
      restore: (id, draft, baseline) =>
        set((state) => ({
          drafts: { ...state.drafts, [id]: draft },
          baselines: { ...state.baselines, [id]: baseline },
          past: { ...state.past, [id]: [] },
          future: { ...state.future, [id]: [] },
        })),
      keep: (id, next, baseline) =>
        set((state) => {
          const previous = state.drafts[id] ?? baseline;
          if (countChanges(previous, next) === 0 && previous.rows.length === next.rows.length)
            return state;
          return {
            drafts: { ...state.drafts, [id]: next },
            baselines: { ...state.baselines, [id]: state.baselines[id] ?? baseline },
            past: {
              ...state.past,
              [id]: [...(state.past[id] ?? []), previous].slice(-HISTORY_LIMIT),
            },
            future: { ...state.future, [id]: [] },
          };
        }),
      undo: (id) =>
        set((state) => {
          const past = state.past[id] ?? [];
          const previous = past.at(-1);
          const current = state.drafts[id];
          if (!previous || !current) return state;
          return {
            drafts: { ...state.drafts, [id]: previous },
            past: { ...state.past, [id]: past.slice(0, -1) },
            future: { ...state.future, [id]: [...(state.future[id] ?? []), current] },
          };
        }),
      redo: (id) =>
        set((state) => {
          const future = state.future[id] ?? [];
          const next = future.at(-1);
          const current = state.drafts[id];
          if (!next || !current) return state;
          return {
            drafts: { ...state.drafts, [id]: next },
            future: { ...state.future, [id]: future.slice(0, -1) },
            past: { ...state.past, [id]: [...(state.past[id] ?? []), current] },
          };
        }),
      drop: (id) =>
        set((state) => {
          const drafts = { ...state.drafts };
          const baselines = { ...state.baselines };
          const past = { ...state.past };
          const future = { ...state.future };
          delete drafts[id];
          delete baselines[id];
          delete past[id];
          delete future[id];
          return { drafts, baselines, past, future };
        }),
    }),
    {
      name: 'vakhta.ui.schedule.drafts',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ drafts, baselines }) => ({ drafts, baselines }),
      merge: (persisted, current) => {
        const parsed = storedSchema.safeParse(persisted);
        return parsed.success
          ? { ...current, ...parsed.data }
          : { ...current, recoveryError: true };
      },
    },
  ),
);
