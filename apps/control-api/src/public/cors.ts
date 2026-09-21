import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import type { ControlEnv } from '../config/env.js';

/** Public endpoints use bearer invitations, never operator cookies. Auth origins remain restricted. */
export function configureControlCors(app: NestFastifyApplication, env: ControlEnv): void {
  app.enableCors({
    delegator: (request: FastifyRequest, callback) => {
      const isPublic = request.url.startsWith('/public/');
      callback(null, {
        origin: isPublic ? '*' : [...env.CONTROL_CORS_ORIGINS],
        credentials: !isPublic,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['content-type', 'authorization', 'x-locale'],
        maxAge: 600,
      });
    },
  });
}
