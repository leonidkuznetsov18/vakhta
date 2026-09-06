import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { resolveLocale, type Locale } from '@vakhta/domain';

/** Panel language for this request: explicit `x-locale` header first, then Accept-Language. */
export function localeOf(request: Pick<FastifyRequest, 'headers'>): Locale {
  const explicit = request.headers['x-locale'];
  const accept = request.headers['accept-language'];
  return resolveLocale(
    (Array.isArray(explicit) ? explicit[0] : explicit) ??
      (Array.isArray(accept) ? accept[0] : accept),
  );
}

export const RequestLocale = createParamDecorator((_data: unknown, ctx: ExecutionContext): Locale =>
  localeOf(ctx.switchToHttp().getRequest<FastifyRequest>()),
);
