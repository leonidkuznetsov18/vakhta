import type { QueryFeedbackState } from '@/components/app/query-feedback';

interface Source {
  query: QueryFeedbackState;
  errorMessage?: string;
}

/** One feedback surface for the directories and snapshot that compose the current workspace. */
export function workspaceFeedback(sources: readonly Source[]) {
  const failed = sources.find(({ query }) => query.isError);
  const paused = sources.some(({ query }) => query.fetchStatus === 'paused');
  const fetching = sources.some(({ query }) => query.isFetching);
  const query: QueryFeedbackState = {
    isPending: sources.some(({ query }) => query.isPending),
    isFetching: fetching,
    isError: !!failed,
    error: failed?.query.error ?? null,
    fetchStatus: paused ? 'paused' : fetching ? 'fetching' : 'idle',
    refetch: () => Promise.all(sources.map(({ query }) => query.refetch())),
  };
  return { query, errorMessage: failed?.errorMessage };
}
