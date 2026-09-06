import { Catch, HttpException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Sentry } from '../observability/sentry.js';
import { DomainError } from './domain-error.js';

/** Очікувані помилки: клієнтські 4xx і доменні. Їх у Sentry не шлемо, це не інциденти. */
export function isUnexpected(exception: unknown): boolean {
  if (exception instanceof DomainError) return false;
  if (exception instanceof HttpException) return exception.getStatus() >= 500;
  return true;
}

/**
 * Останній фільтр: усе, що не спіймали DomainErrorFilter і Nest, іде в Sentry,
 * а відповідь формує стандартний BaseExceptionFilter (500 без внутрішніх деталей).
 */
@Catch()
export class UnexpectedErrorFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (isUnexpected(exception)) {
      Sentry.captureException(exception);
    }
    super.catch(exception, host);
  }
}
