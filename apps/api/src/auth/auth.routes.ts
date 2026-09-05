import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from './auth.config.js';
import { AUTH_BASE_PATH } from './auth.config.js';

/** IncomingHttpHeaders → Fetch Headers; масиви (set-cookie) додаються по одному. */
export function toWebHeaders(headers: FastifyRequest['headers']): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => out.append(key, v));
    else out.set(key, String(value));
  }
  return out;
}

/**
 * Прокидає /auth/* у better-auth (інтеграція з Fastify за документацією).
 * Реєструється на кореневому інстансі після CORS і до listen().
 */
export function registerAuthRoutes(fastify: FastifyInstance, auth: Auth): void {
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
      if (body !== undefined && body !== null && request.method !== 'GET') {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
      const response = await auth.handler(new Request(url.toString(), init));
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') return;
        reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
