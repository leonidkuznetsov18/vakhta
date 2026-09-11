import { useIsFetching } from '@tanstack/react-query';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { LoadingState } from './loading-state';

/** Reserve one header slot so background reads never move the workspace. */
export function QueryActivity() {
  const refreshing = useIsFetching({
    type: 'active',
    predicate: (query) => query.state.status === 'success',
  });
  const label = messages(currentLocale()).ui.common.refreshing;
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center" title={label}>
      {refreshing > 0 && <LoadingState label={label} className="[&>span]:sr-only" />}
    </span>
  );
}
