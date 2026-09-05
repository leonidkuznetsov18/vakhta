import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { CHALLENGE_BYTES } from './challenge.js';

/** Node-only: генерація і хешування токена challenge (ADR-4). */

export function generateChallengeToken(): string {
  return randomBytes(CHALLENGE_BYTES).toString('base64url');
}

/** У базі зберігається лише хеш; сам токен живе тільки на екрані терміналу і в deep link. */
export function hashChallengeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Порівняння хешів без витоку часу. */
export function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
