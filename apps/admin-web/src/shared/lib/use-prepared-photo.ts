import { useMutation } from '@tanstack/react-query';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/shared/config';
import { localActivity } from '@/shared/api/activity';

/** Keep visible evidence until the latest requested photo is ready or needs local recovery. */
export function usePreparedPhoto<T>({
  current,
  prepare,
  onChange,
}: {
  current: T;
  prepare: (next: T) => Promise<unknown>;
  onChange: (next: T) => void;
}) {
  const request = useMutation({ mutationFn: prepare, meta: localActivity, retry: false });
  const t = messages(currentLocale()).ui.common;
  let loading: string | undefined;
  if (request.isPending) loading = request.isPaused ? t.waitingConnection : t.loading;
  return {
    selected: request.isPending ? request.variables : current,
    loading,
    select: (next: T) => request.mutate(next, { onSettled: () => onChange(next) }),
  };
}
