import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ControlAuth } from './auth.config.js';
import { AUTH_BASE_PATH } from './auth.config.js';

/** IncomingHttpHeaders → Fetch Headers; arrays (set-cookie) are appended one by one. */
export function toWebHeaders(headers: FastifyRequest['headers']): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => out.append(key, v));
    else out.set(key, String(value));
  }
  return out;
}

/** Same bridge as the tenant API: forwards /auth/* to better-auth on the root Fastify instance. */
const SET_COOKIE = 'set-cookie';
const GET = 'GET';

export function registerControlAuthRoutes(fastify: FastifyInstance, auth: ControlAuth): void {
  fastify.route({
    method: ['GET', 'POST'],
    url: `${AUTH_BASE_PATH}/*`,
    async handler(request: FastifyRequest, reply: FastifyReply) {
      const url = new URL(
        request.url,
        `${request.protocol}://${request.headers.host ?? 'localhost'}`,
      );
      const headers = toWebHeaders(request.headers);
      const body = request.body;
      const init: RequestInit = { method: request.method, headers };
      if (body !== undefined && body !== null && request.method !== GET) {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
      const response = await auth.handler(new Request(url.toString(), init));
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === SET_COOKIE) return;
        reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header(SET_COOKIE, cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
