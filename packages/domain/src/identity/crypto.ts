import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { ACTIVATION_CODE_ALPHABET, ACTIVATION_CODE_LENGTH } from './activation.js';

/** Node-only: генерація і хешування коду активації (ТЗ 2.2: секрет лише в хешованому вигляді). */

export function generateActivationCode(): string {
  let code = '';
  for (let i = 0; i < ACTIVATION_CODE_LENGTH; i += 1) {
    code += ACTIVATION_CODE_ALPHABET.charAt(randomInt(ACTIVATION_CODE_ALPHABET.length));
  }
  return code;
}

/**
 * HMAC із серверним pepper: 40-бітний код без pepper зламали б офлайн за секунди
 * після витоку бази. З pepper пошук за хешем лишається детермінованим.
 */
export function hashActivationCode(code: string, pepper: string): string {
  if (pepper.length < 16)
    throw new RangeError('ACTIVATION_PEPPER має бути не коротшим за 16 символів');
  return createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
}

export function activationHashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
