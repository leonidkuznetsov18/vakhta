import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/** Same shape as the tenant API: a stable `code` the control panel localizes. */
export class ControlError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'ControlError';
  }
}

@Catch(ControlError)
export class ControlErrorFilter implements ExceptionFilter<ControlError> {
  catch(exception: ControlError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    void reply
      .status(exception.status)
      .send({ statusCode: exception.status, code: exception.code, message: exception.message });
  }
}
