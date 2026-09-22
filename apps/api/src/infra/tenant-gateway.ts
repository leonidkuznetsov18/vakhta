import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { TenantGateway } from '@vakhta/contracts';

/** No forwarding header becomes a tenant selector without gateway authentication. */
export function acceptGatewayHost(request: FastifyRequest, key: string | undefined): boolean {
  const host = request.headers[TenantGateway.HOST_HEADER];
  const supplied = request.headers[TenantGateway.KEY_HEADER];
  if (host === undefined && supplied === undefined) return true;
  delete request.headers[TenantGateway.KEY_HEADER];
  delete request.headers[TenantGateway.HOST_HEADER];
  if (!key || typeof host !== 'string' || typeof supplied !== 'string') return false;
  const expectedBytes = Buffer.from(key);
  const suppliedBytes = Buffer.from(supplied);
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  )
    return false;
  if (
    host.length > 253 ||
    !host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    return false;
  request.headers.host = host;
  request.headers['x-forwarded-proto'] = 'https';
  delete request.headers['x-forwarded-host'];
  delete request.headers['forwarded'];
  return true;
}
