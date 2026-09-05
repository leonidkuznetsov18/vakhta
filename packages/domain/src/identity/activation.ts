/**
 * Активація працівника в боті (ТЗ 2.2, FR-AUTH-01, FR-AUTH-02): чисті правила.
 * Генерація коду і хешування живуть у `./crypto.ts` (node-only).
 */

/** Без I, O, 0, 1: код диктують голосом і читають з паперу в цеху. */
export const ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACTIVATION_CODE_LENGTH = 8;
/** Deep link виду https://t.me/<bot>?start=act-XXXXXXXX */
export const ACTIVATION_DEEP_LINK_PREFIX = 'act-';

const CODE_RE = new RegExp(`^[${ACTIVATION_CODE_ALPHABET}]{${ACTIVATION_CODE_LENGTH}}$`);
const DEEP_LINK_RE = new RegExp(
  `^${ACTIVATION_DEEP_LINK_PREFIX}[${ACTIVATION_CODE_ALPHABET.toLowerCase()}${ACTIVATION_CODE_ALPHABET}]{${ACTIVATION_CODE_LENGTH}}$`,
);

/** Прибирає пробіли й дефіси, підіймає регістр. Повертає null, якщо це не схоже на код. */
export function normalizeActivationCode(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase();
  return CODE_RE.test(cleaned) ? cleaned : null;
}

export function isActivationDeepLink(startParam: string): boolean {
  return DEEP_LINK_RE.test(startParam);
}

export function activationDeepLinkParam(code: string): string {
  return `${ACTIVATION_DEEP_LINK_PREFIX}${code}`;
}

export function codeFromDeepLink(startParam: string): string | null {
  if (!isActivationDeepLink(startParam)) return null;
  return normalizeActivationCode(startParam.slice(ACTIVATION_DEEP_LINK_PREFIX.length));
}

/** «Іванов Іван Іванович» → «Іванов І. І.»: працівник підтверджує картку, не бачачи зайвого (ТЗ 2.2). */
export function maskFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const [last, ...rest] = parts;
  if (!last) return '';
  const initials = rest.map((p) => `${p.charAt(0).toUpperCase()}.`).join(' ');
  return initials ? `${last} ${initials}` : last;
}

/** Останні два символи табельного номера видимі, решта зірочки. */
export function maskPersonnelNumber(personnelNumber: string): string {
  const s = personnelNumber.trim();
  if (s.length <= 2) return '*'.repeat(s.length);
  return `${'*'.repeat(s.length - 2)}${s.slice(-2)}`;
}

export type ActivationCodeVerdict = 'OK' | 'USED' | 'EXPIRED' | 'ATTEMPTS_EXCEEDED';

export interface ActivationCodeState {
  readonly usedAt: Date | null;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly maxAttempts: number;
}

/** Порядок перевірок: використаний код лишається використаним навіть після спливу строку. */
export function evaluateActivationCode(
  code: ActivationCodeState,
  now: Date,
): ActivationCodeVerdict {
  if (code.usedAt !== null) return 'USED';
  if (now.getTime() >= code.expiresAt.getTime()) return 'EXPIRED';
  if (code.attempts >= code.maxAttempts) return 'ATTEMPTS_EXCEEDED';
  return 'OK';
}

/** Причини відмови в активації; кожна має текст у @vakhta/i18n. */
export const ACTIVATION_FAILURES = [
  'INVALID_CODE',
  'CODE_USED',
  'CODE_EXPIRED',
  'ATTEMPTS_EXCEEDED',
  'EMPLOYEE_BLOCKED',
  'EMPLOYEE_TERMINATED',
  'TELEGRAM_ALREADY_LINKED',
  'EMPLOYEE_ALREADY_LINKED',
  'NO_PENDING',
] as const;
export type ActivationFailure = (typeof ACTIVATION_FAILURES)[number];

export type EmployeeStatus = 'ACTIVE' | 'BLOCKED' | 'TERMINATED';
export type EmployeeAccess = 'ALLOWED' | 'NOT_REGISTERED' | 'BLOCKED' | 'TERMINATED';

/** FR-AUTH-01: незареєстрований, заблокований чи звільнений не може діяти в боті. */
export function employeeAccess(status: EmployeeStatus | null | undefined): EmployeeAccess {
  switch (status) {
    case 'ACTIVE':
      return 'ALLOWED';
    case 'BLOCKED':
      return 'BLOCKED';
    case 'TERMINATED':
      return 'TERMINATED';
    default:
      return 'NOT_REGISTERED';
  }
}
