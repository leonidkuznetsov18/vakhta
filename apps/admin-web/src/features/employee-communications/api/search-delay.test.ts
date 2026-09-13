import { afterEach, expect, it, vi } from 'vitest';
import { waitForAudienceSearch } from './search-delay';
afterEach(() => vi.useRealTimers());
it('debounces suggestions and aborts superseded work before it can fetch', async () => {
  vi.useFakeTimers();
  const previous = new AbortController();
  const canceled = waitForAudienceSearch(previous.signal);
  const rejected = expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
  previous.abort();
  await rejected;
  const ready = vi.fn();
  const current = waitForAudienceSearch(new AbortController().signal).then(ready);
  await vi.advanceTimersByTimeAsync(249);
  expect(ready).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await current;
  expect(ready).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
