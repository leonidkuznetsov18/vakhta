import { createHash, randomInt } from 'node:crypto';
import { ACTIVATION_CODE_ALPHABET } from '../identity/activation.js';

/**
 * Node-only: terminal pairing codes (FR-QR-01). An administrator issues a short code in the panel,
 * someone types it once on the tablet, and the kiosk exchanges it for a device token that never
 * leaves the device. The code is stored hashed; the alphabet has no I, O, 0 or 1.
 */

export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_TTL_MINUTES = 15;

export function generatePairingCode(): string {
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i += 1) {
    code += ACTIVATION_CODE_ALPHABET.charAt(randomInt(ACTIVATION_CODE_ALPHABET.length));
  }
  return code;
}

/** People type codes with spaces, dashes and in lower case; hashing must not care. */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isPairingCodeShape(input: string): boolean {
  const code = normalizePairingCode(input);
  return (
    code.length === PAIRING_CODE_LENGTH &&
    [...code].every((ch) => ACTIVATION_CODE_ALPHABET.includes(ch))
  );
}

/** 40 bits of entropy make offline guessing impractical, so a plain SHA-256 is enough here. */
export function hashPairingCode(input: string): string {
  return createHash('sha256').update(normalizePairingCode(input), 'utf8').digest('hex');
}

export function pairingCodeExpiresAt(issuedAt: Date, ttlMinutes = PAIRING_CODE_TTL_MINUTES): Date {
  return new Date(issuedAt.getTime() + ttlMinutes * 60_000);
}

/** "ABCD-2345" reads easier on a tablet than eight glued characters. */
export function formatPairingCode(code: string): string {
  const normalized = normalizePairingCode(code);
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}
