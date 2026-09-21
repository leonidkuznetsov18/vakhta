import { describe, expect, it, vi } from 'vitest';
import { resolveTenant, type RuntimeOptions } from './index.js';

const alpha = {
  tenantId: 'a0000000-0000-4000-8000-000000000001',
  slug: 'alpha',
  surface: 'PANEL',
  apiUrl: 'https://alpha-api.vakhta.test',
  canonicalUrl: 'https://alpha.vakhta.test',
  panelUrl: 'https://alpha.vakhta.test',
  kioskUrl: 'https://alpha-kiosk.vakhta.test',
  displayName: 'Alpha',
  logoUrl: null,
  accentColor: null,
  defaultLocale: 'uk',
  modules: ['ADMIN_PANEL'],
  status: 'ACTIVE',
};
function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(alpha));
  const options: RuntimeOptions = {
    host: 'alpha.vakhta.test',
    controlUrl: 'https://control.vakhta.test',
    surface: 'PANEL',
    storage,
    fetcher,
    now: () => 1000,
  };
  return { options, fetcher, values };
}
describe('tenant runtime bootstrap', () => {
  it('fetches configuration by host without operator cookies and returns the tenant API', async () => {
    const { options, fetcher } = setup();
    expect(await resolveTenant(options)).toEqual(alpha);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'https://control.vakhta.test/public/tenant-config?host=alpha.vakhta.test',
    );
    expect(init?.credentials).toBe('omit');
  });
  it('reuses a recent cache on an outage but never for another host or after expiry', async () => {
    const { options, fetcher } = setup();
    await resolveTenant(options);
    fetcher.mockRejectedValue(new TypeError('offline'));
    expect(await resolveTenant(options)).toEqual(alpha);
    await expect(resolveTenant({ ...options, host: 'bravo.vakhta.test' })).rejects.toThrow();
    await expect(resolveTenant({ ...options, now: () => 1000 + 25 * 3600_000 })).rejects.toThrow();
  });
  it.each([403, 404])('invalidates a cached tenant after HTTP %s', async (status) => {
    const { options, fetcher, values } = setup();
    await resolveTenant(options);
    fetcher.mockResolvedValue(new Response(null, { status }));
    await expect(resolveTenant(options)).rejects.toThrow();
    expect(values.size).toBe(0);
    fetcher.mockRejectedValue(new TypeError('offline'));
    await expect(resolveTenant(options)).rejects.toThrow();
  });
  it.each([
    { status: 'SUSPENDED' },
    { surface: 'KIOSK' },
    { modules: [] },
    { apiUrl: 'http://alpha-api.vakhta.test' },
    { apiUrl: 'https://user:password@alpha-api.vakhta.test' },
    { canonicalUrl: 'javascript:alert(1)' },
    { logoUrl: 'javascript:alert(1)' },
    { logoUrl: 'http://logos.example.test/logo.webp' },
    { tenantId: 'invalid' },
  ])('fails closed for invalid or inaccessible configuration %j', async (change) => {
    const { options, fetcher, values } = setup();
    await resolveTenant(options);
    fetcher.mockResolvedValue(Response.json({ ...alpha, ...change }));
    await expect(resolveTenant(options)).rejects.toThrow();
    expect(values.size).toBe(0);
  });
  it('works when browser storage is blocked', async () => {
    const { options } = setup();
    const blocked = () => {
      throw new Error('storage blocked');
    };
    expect(
      await resolveTenant({
        ...options,
        storage: { getItem: blocked, setItem: blocked, removeItem: blocked },
      }),
    ).toEqual(alpha);
  });
});
