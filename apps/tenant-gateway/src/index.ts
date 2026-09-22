import { TenantGateway, TenantGatewayProbe, TenantPublicConfig } from '@vakhta/contracts';
import { RESERVED_TENANT_SLUGS, TenantModule, TenantStatus, TenantSurface } from '@vakhta/domain';

export interface GatewayEnv {
  readonly PLATFORM_ZONE: string;
  readonly API_ORIGIN: string;
  readonly CONTROL_ORIGIN: string;
  readonly TENANT_GATEWAY_KEY: string;
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}
type Transport = (request: Request) => Promise<Response>;
const HttpMethod = { GET: 'GET', HEAD: 'HEAD' } as const;
const TIMEOUT_MS = 8_000;
const RESERVED_HOSTS = new Set<string>(RESERVED_TENANT_SLUGS);

function unavailable(status: number): Response {
  return Response.json(
    { code: 'TENANT_UNAVAILABLE' },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}
function managedHost(host: string, zone: string): boolean {
  if (!host.endsWith(`.${zone}`)) return false;
  const label = host.slice(0, -(zone.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) && !RESERVED_HOSTS.has(label);
}
function originUrl(origin: string, path: string): URL {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/')
    throw new Error('Invalid gateway origin');
  // Assigning the path cannot replace the fixed upstream host with a user-supplied authority.
  const incoming = new URL(path, 'https://request.invalid');
  base.pathname = incoming.pathname;
  base.search = incoming.search;
  return base;
}
function forwardedRequest(request: Request, env: GatewayEnv, path: string): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith('x-forwarded-') || name.startsWith('x-vakhta-') || name === 'forwarded')
      headers.delete(name);
  }
  headers.delete('host');
  headers.set(TenantGateway.HOST_HEADER, new URL(request.url).hostname);
  headers.set(TenantGateway.KEY_HEADER, env.TENANT_GATEWAY_KEY);
  const upstream = new Request(originUrl(env.API_ORIGIN, path), request);
  return new Request(upstream, { headers, redirect: 'manual' });
}
async function probe(request: Request, env: GatewayEnv, transport: Transport): Promise<Response> {
  const health = forwardedRequest(new Request(request.url), env, TenantGateway.ORIGIN_PROBE_PATH);
  const response = await transport(
    new Request(health, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
  );
  if (!response.ok) return unavailable(503);
  const confirmation = TenantGatewayProbe.parse(await response.json());
  if (confirmation.host !== new URL(request.url).hostname) return unavailable(503);
  return Response.json(
    { service: TenantGateway.SERVICE, host: new URL(request.url).hostname },
    {
      headers: { 'cache-control': 'no-store' },
    },
  );
}
async function configuration(host: string, env: GatewayEnv, transport: Transport) {
  const url = originUrl(env.CONTROL_ORIGIN, '/public/tenant-config');
  url.searchParams.set('host', host);
  const response = await transport(
    new Request(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' }),
  );
  if (!response.ok) return null;
  return TenantPublicConfig.parse(await response.json());
}
async function apiResponse(
  request: Request,
  env: GatewayEnv,
  transport: Transport,
): Promise<Response> {
  const url = new URL(request.url);
  const response = await transport(forwardedRequest(request, env, `${url.pathname}${url.search}`));
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.delete(TenantGateway.KEY_HEADER);
  headers.delete(TenantGateway.HOST_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
async function staticResponse(
  request: Request,
  env: GatewayEnv,
  surface: TenantSurface,
): Promise<Response> {
  if (request.method !== HttpMethod.GET && request.method !== HttpMethod.HEAD)
    return unavailable(405);
  const url = new URL(request.url);
  const originalPath = url.pathname;
  const folder = surface === TenantSurface.KIOSK ? 'kiosk' : 'panel';
  const isDocument = !originalPath.split('/').at(-1)?.includes('.');
  url.pathname = `/${folder}${isDocument ? '/index.html' : originalPath}`;
  const response = await env.ASSETS.fetch(new Request(url, request));
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  if (surface === TenantSurface.PANEL && originalPath === '/questionnaire') {
    headers.delete('x-frame-options');
    headers.set('content-security-policy', 'frame-ancestors https://web.telegram.org');
  }
  if (isDocument) headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}
async function serve(request: Request, env: GatewayEnv, transport: Transport): Promise<Response> {
  const url = new URL(request.url);
  if (!managedHost(url.hostname, env.PLATFORM_ZONE)) return unavailable(404);
  if (!env.TENANT_GATEWAY_KEY || env.TENANT_GATEWAY_KEY.length < 32) return unavailable(503);
  if (url.pathname === TenantGateway.PROBE_PATH) return probe(request, env, transport);
  const config = await configuration(url.hostname, env, transport);
  if (!config) return unavailable(404);
  if (config.status !== TenantStatus.ACTIVE) return unavailable(403);
  if (config.surface === TenantSurface.API) return apiResponse(request, env, transport);
  const module =
    config.surface === TenantSurface.PANEL ? TenantModule.ADMIN_PANEL : TenantModule.QR_KIOSK;
  if (!config.modules.includes(module)) return unavailable(403);
  return staticResponse(request, env, config.surface);
}
export async function gateway(
  request: Request,
  env: GatewayEnv,
  transport: Transport = fetch,
): Promise<Response> {
  try {
    return await serve(request, env, transport);
  } catch (error) {
    console.error('Tenant gateway request failed', {
      kind: error instanceof Error ? error.name : 'UnknownError',
    });
    return unavailable(503);
  }
}
export default {
  fetch(request: Request, env: GatewayEnv): Promise<Response> {
    return gateway(request, env);
  },
};
