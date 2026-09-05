import { createHash, randomBytes } from 'node:crypto';

/** Node-only: device token терміналу (FR-QR-01). Показується один раз, у базі лише хеш. */

export function generateDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
