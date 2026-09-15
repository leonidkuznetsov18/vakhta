import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { QueryFeedback, type QueryFeedbackState } from '@/components/app/query-feedback';
import type { Workspace } from '../model/use-workspace';

/** Two queries waiting in the same way share one loader or one connection notice. */
function sameWaiting(a: QueryFeedbackState, b: QueryFeedbackState) {
  if (a.isError || b.isError) return false;
  if (a.fetchStatus === 'paused' && b.fetchStatus === 'paused') return true;
  return a.isPending && a.isFetching && b.isPending && b.isFetching;
}

/**
 * Why a local plan evaluation is not ready: the staffing rules or the plan context are still
 * loading, waiting for a connection, or failed with a retry.
 */
export function RulesContextFeedback({ workspace: w }: { readonly workspace: Workspace }) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const staffing = w.staffingState.query;
  return (
    <>
      <QueryFeedback query={staffing} errorMessage={t.staffingUnavailable} />
      {!sameWaiting(staffing, w.contextQuery) && (
        <QueryFeedback query={w.contextQuery} errorMessage={t.contextUnavailable} />
      )}
    </>
  );
}
