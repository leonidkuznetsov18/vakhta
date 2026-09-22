import { describe, expect, it, vi } from 'vitest';
import { TenantGateway } from '@vakhta/contracts';
import { gateway, type GatewayEnv } from './index.js';

const config = {
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
  modules: ['ADMIN_PANEL', 'QR_KIOSK'],
  status: 'ACTIVE',
};
function fixture(surface = 'PANEL') {
  const assets = vi.fn(async (req: Request) => new Response(new URL(req.url).pathname));
  const env: GatewayEnv = {
    PLATFORM_ZONE: 'vakhta.test',
    API_ORIGIN: 'https://origin.railway.test',
    CONTROL_ORIGIN: 'https://control.vakhta.test',
    TENANT_GATEWAY_KEY: 'secret'.repeat(10),
    ASSETS: { fetch: assets },
  };
  const upstream = vi.fn(async (req: Request) => {
    if (new URL(req.url).hostname === 'control.vakhta.test')
      return Response.json({ ...config, surface });
    if (new URL(req.url).pathname === TenantGateway.ORIGIN_PROBE_PATH)
      return Response.json({
        service: TenantGateway.SERVICE,
        host: req.headers.get(TenantGateway.HOST_HEADER),
      });
    return new Response(req.body, { headers: { 'set-cookie': 'session=value; HttpOnly' } });
  });
  return { env, assets, upstream };
}
describe('shared tenant gateway', () => {
  it('uses registered surface instead of guessing from the slug suffix', async () => {
    const f = fixture();
    const res = await gateway(
      new Request('https://alpha-api.vakhta.test/overview'),
      f.env,
      f.upstream,
    );
    expect(await res.text()).toBe('/panel/index.html');
    expect(f.upstream.mock.calls[0]?.[0].redirect).toBe('manual');
  });
  it('keeps kiosk assets separate and preserves missing asset responses', async () => {
    const f = fixture('KIOSK');
    f.assets.mockImplementationOnce(async () => new Response('missing', { status: 404 }));
    const res = await gateway(
      new Request('https://alpha-kiosk.vakhta.test/assets/missing.js'),
      f.env,
      f.upstream,
    );
    expect(res.status).toBe(404);
    expect(new URL(f.assets.mock.calls[0]?.[0].url ?? '').pathname).toBe(
      '/kiosk/assets/missing.js',
    );
  });
  it('replaces spoofed headers and streams API bodies without following redirects', async () => {
    const f = fixture('API');
    const req = new Request('https://alpha-api.vakhta.test/upload?part=1', {
      method: 'POST',
      body: 'payload',
      headers: {
        [TenantGateway.HOST_HEADER]: 'victim.vakhta.test',
        [TenantGateway.KEY_HEADER]: 'spoof',
        'x-forwarded-host': 'victim.vakhta.test',
        cookie: 'session=alpha',
        origin: 'https://alpha.vakhta.test',
      },
    });
    const res = await gateway(req, f.env, f.upstream);
    const forwarded = f.upstream.mock.calls.at(-1)?.[0];
    expect(forwarded?.url).toBe('https://origin.railway.test/upload?part=1');
    expect(forwarded?.headers.get(TenantGateway.HOST_HEADER)).toBe('alpha-api.vakhta.test');
    expect(forwarded?.headers.get(TenantGateway.KEY_HEADER)).toBe(f.env.TENANT_GATEWAY_KEY);
    expect(forwarded?.headers.get('x-forwarded-host')).toBeNull();
    expect(forwarded?.headers.get('cookie')).toBe('session=alpha');
    expect(forwarded?.redirect).toBe('manual');
    expect(await res.text()).toBe('payload');
    expect(res.headers.get('set-cookie')).toContain('session=value');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('preserves redirects, multiple cookies and cancellation of a live response stream', async () => {
    const f = fixture('API');
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: ready\n\n'));
      },
      cancel,
    });
    const headers = new Headers({
      'content-type': 'text/event-stream',
      location: 'https://alpha.vakhta.test/login',
    });
    headers.append('set-cookie', 'session=one; HttpOnly');
    headers.append('set-cookie', 'csrf=two; Secure');
    f.upstream
      .mockResolvedValueOnce(Response.json({ ...config, surface: 'API' }))
      .mockResolvedValueOnce(new Response(body, { headers }));
    const result = await gateway(
      new Request('https://alpha-api.vakhta.test/events'),
      f.env,
      f.upstream,
    );
    expect(result.headers.get('content-type')).toBe('text/event-stream');
    expect(result.headers.getSetCookie()).toHaveLength(2);
    expect(result.headers.get('location')).toBe('https://alpha.vakhta.test/login');
    const reader = result.body?.getReader();
    expect(new TextDecoder().decode((await reader?.read())?.value)).toBe('data: ready\n\n');
    await reader?.cancel();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('refuses unknown, suspended and disabled surfaces before serving assets', async () => {
    await Promise.all(
      [
        new Response(null, { status: 404 }),
        Response.json({ ...config, status: 'SUSPENDED' }),
        Response.json({ ...config, modules: [] }),
      ].map(async (response) => {
        const f = fixture();
        f.upstream.mockResolvedValueOnce(response);
        expect(
          (await gateway(new Request('https://alpha.vakhta.test/'), f.env, f.upstream)).status,
        ).toBeGreaterThanOrEqual(400);
        expect(f.assets).not.toHaveBeenCalled();
      }),
    );
  });
  it('probes the authenticated origin without requiring an already active tenant', async () => {
    const f = fixture();
    const res = await gateway(
      new Request(`https://new.vakhta.test${TenantGateway.PROBE_PATH}`),
      f.env,
      f.upstream,
    );
    expect(await res.json()).toEqual({ service: TenantGateway.SERVICE, host: 'new.vakhta.test' });
    expect(f.upstream.mock.calls[0]?.[0].url).toBe(
      `https://origin.railway.test${TenantGateway.ORIGIN_PROBE_PATH}`,
    );
  });
  it('rejects a healthy origin that does not confirm gateway support', async () => {
    const f = fixture();
    f.upstream.mockResolvedValueOnce(Response.json({ status: 'ok' }));
    expect(
      (
        await gateway(
          new Request(`https://new.vakhta.test${TenantGateway.PROBE_PATH}`),
          f.env,
          f.upstream,
        )
      ).status,
    ).toBe(503);
  });
  it('fails closed on origin outage and retains questionnaire embedding rules', async () => {
    const f = fixture();
    f.upstream.mockRejectedValueOnce(new Error('unavailable'));
    expect(
      (await gateway(new Request('https://alpha.vakhta.test/'), f.env, f.upstream)).status,
    ).toBe(503);
    const res = await gateway(
      new Request('https://alpha.vakhta.test/questionnaire'),
      f.env,
      f.upstream,
    );
    expect(res.headers.get('x-frame-options')).toBeNull();
    expect(res.headers.get('content-security-policy')).toContain('https://web.telegram.org');
  });
});
