import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * A server-sent event stream that invalidates what it touches (spec 9.2). The subscription is a
 * real effect — it synchronises with something outside React and cleans itself up — but it is the
 * only one a live screen needs: the data itself is read by TanStack Query, and the event only says
 * "this is stale now".
 *
 * The returned flag drives the "live / no connection" badge.
 */
export function useLiveUpdates(
  url: string,
  event: string,
  invalidate: readonly unknown[],
): boolean {
  const client = useQueryClient();
  const [live, setLive] = useState(false);
  const key = JSON.stringify(invalidate);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(url, { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener(event, () => {
      void client.invalidateQueries({ queryKey: JSON.parse(key) as unknown[] });
    });
    return () => source.close();
  }, [url, event, key, client]);
  return live;
}
