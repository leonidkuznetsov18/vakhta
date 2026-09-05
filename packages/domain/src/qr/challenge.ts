/**
 * Ізоморфна частина QR challenge: валідація, строки дії, deep link.
 * Генерація токена і хешування живуть у `./crypto.ts` і експортуються лише через
 * `@vakhta/domain/node`, бо потребують node:crypto.
 */

/** 16 випадкових байтів → 22 символи base64url. Вміщається у ліміт FR-QR-02. */
export const CHALLENGE_BYTES = 16;

/** Deep-link start-параметр Telegram: не більше 64 base64url-символів (FR-QR-02). */
export const MAX_START_PARAM_LENGTH = 64;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function isValidStartParam(param: string): boolean {
  return param.length > 0 && param.length <= MAX_START_PARAM_LENGTH && BASE64URL_RE.test(param);
}

export function challengeExpiresAt(issuedAt: Date, ttlSeconds: number): Date {
  return new Date(issuedAt.getTime() + ttlSeconds * 1000);
}

export function isChallengeExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function buildDeepLink(botUsername: string, token: string): string {
  if (!isValidStartParam(token)) throw new RangeError('Токен не є коректним start-параметром');
  return `https://t.me/${botUsername}?start=${token}`;
}

/** Рекомендовані значення ТЗ 18, п. 8: ротація 30–60 с, TTL 60–120 с. */
export const QR_DEFAULTS = Object.freeze({
  rotationSeconds: 45,
  ttlSeconds: 90,
});
