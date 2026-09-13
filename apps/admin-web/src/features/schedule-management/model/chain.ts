import { createStore } from 'zustand/vanilla';

export type ChainedAction = { readonly action: 'PUBLISH'; readonly changeReason: string };
interface CommandChain {
  readonly next: Readonly<Record<string, ChainedAction>>;
  plan: (scope: string, action: ChainedAction) => void;
  take: (scope: string) => ChainedAction | null;
  clear: (scope: string) => void;
}

/**
 * A follow-up command that runs only after the previous command of the same scope succeeded,
 * so "publish a draft" can submit and publish without a second click. Nothing here is persisted:
 * an interrupted chain leaves an explicit intermediate state (for example, awaiting approval).
 */
export const scheduleChain = createStore<CommandChain>((set, get) => ({
  next: {},
  plan: (scope, action) => set((state) => ({ next: { ...state.next, [scope]: action } })),
  take: (scope) => {
    const action = get().next[scope] ?? null;
    if (action) get().clear(scope);
    return action;
  },
  clear: (scope) =>
    set((state) => {
      const next = { ...state.next };
      delete next[scope];
      return { next };
    }),
}));
