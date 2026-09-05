export type IdentityErrorCode =
  | 'EMPLOYEE_NOT_FOUND'
  | 'PERSONNEL_NUMBER_TAKEN'
  | 'EMPLOYEE_NOT_ACTIVE'
  | 'TELEGRAM_USER_TAKEN'
  | 'SAME_TELEGRAM_USER';

/** Доменна помилка identity; у HTTP її перетворює IdentityExceptionFilter. */
export class IdentityError extends Error {
  constructor(
    readonly code: IdentityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'IdentityError';
  }
}
