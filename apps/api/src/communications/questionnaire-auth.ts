import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '../common/domain-error.js';
const User = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
export function questionnaireIdentity(raw: string, token: string, now = Date.now()): number {
  const fail = () =>
    new DomainError('QUESTIONNAIRE_AUTH_EXPIRED', 401, 'Open the questionnaire from Telegram');
  if (!raw || raw.length > 16_384 || !token) throw fail();
  const params = new URLSearchParams(raw);
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw fail();
  const hash = params.get('hash') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw fail();
  const timestamp = params.get('auth_date') ?? '';
  if (!/^\d{1,12}$/.test(timestamp)) throw fail();
  const age = Math.floor(now / 1000) - Number(timestamp);
  if (age < -30 || age > 3600) throw fail();
  const canonical = entries
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(canonical).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw fail();
  try {
    return User.parse(JSON.parse(params.get('user') ?? '')).id;
  } catch {
    throw fail();
  }
}
