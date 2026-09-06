import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { IdentityError, type IdentityErrorCode } from './identity.errors.js';

const STATUS: Readonly<Record<IdentityErrorCode, HttpStatus>> = {
  EMPLOYEE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PERSONNEL_NUMBER_TAKEN: HttpStatus.CONFLICT,
  EMPLOYEE_NOT_ACTIVE: HttpStatus.CONFLICT,
  TELEGRAM_USER_TAKEN: HttpStatus.CONFLICT,
  SAME_TELEGRAM_USER: HttpStatus.CONFLICT,
  EMPLOYEE_HAS_HISTORY: HttpStatus.CONFLICT,
};

@Catch(IdentityError)
export class IdentityExceptionFilter implements ExceptionFilter<IdentityError> {
  catch(exception: IdentityError, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = STATUS[exception.code];
    void reply
      .status(status)
      .send({ statusCode: status, code: exception.code, message: exception.message });
  }
}
