import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * Доменна помилка з HTTP-статусом. Сервіси кидають її замість HttpException,
 * щоб не залежати від транспорту; DomainErrorFilter перетворює на відповідь.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    void reply
      .status(exception.status)
      .send({ statusCode: exception.status, code: exception.code, message: exception.message });
  }
}
