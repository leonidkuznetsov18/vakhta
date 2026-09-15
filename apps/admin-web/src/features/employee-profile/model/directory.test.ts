import { afterEach, expect, it, vi } from 'vitest';
import { profileDirectory } from './directory';
import { stubFetch } from '@/test/stub-fetch';
const a = 'a0000000-0000-4000-8000-000000000001';
const b = 'a0000000-0000-4000-8000-000000000002';
afterEach(() => vi.unstubAllGlobals());
it('rejects a multi-page cursor cycle instead of reading forever', async () => {
  const fetch = vi.fn();
  for (const nextCursor of [a, b, a])
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ items: [], total: 0, nextCursor })));
  stubFetch(fetch);
  await expect(profileDirectory()).rejects.toThrow('Employee cursor did not advance');
  expect(fetch).toHaveBeenCalledTimes(3);
});
