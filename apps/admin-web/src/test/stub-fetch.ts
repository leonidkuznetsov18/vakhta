import { vi } from 'vitest';
import { fetchFixture } from './fetch-fixture';

export function stubFetch(handle: Parameters<typeof fetchFixture>[0]): void {
  vi.stubGlobal('fetch', vi.fn(fetchFixture(handle)));
}
