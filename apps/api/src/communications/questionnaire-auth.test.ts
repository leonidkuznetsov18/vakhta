import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { questionnaireIdentity } from './questionnaire-auth.js';
const token = 'test-bot-token';
const now = 1800000000000;
function signed(values: Record<string, string>, bot = token) {
  const params = new URLSearchParams(values);
  const canonical = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(bot).digest();
  params.set('hash', createHmac('sha256', secret).update(canonical).digest('hex'));
  return params.toString();
}
const payload = {
  auth_date: String(now / 1000),
  query_id: 'test',
  user: JSON.stringify({ id: 1234, first_name: 'Synthetic' }),
};
describe('Telegram Mini App authentication', () => {
  it('verifies canonical signed data including optional signature fields', () => {
    expect(
      questionnaireIdentity(signed({ ...payload, signature: 'extra-signed-field' }), token, now),
    ).toBe(1234);
  });
  it('rejects tampering, other bots and duplicate decoded keys', () => {
    const valid = signed(payload);
    for (const value of [
      valid.replace('test', 'changed'),
      signed(payload, 'another-bot'),
      `${valid}&%75ser=${encodeURIComponent(payload.user)}`,
    ])
      expect(() => questionnaireIdentity(value, token, now)).toThrow();
  });
  it('rejects expired and future launch data and unsafe user ids', () => {
    for (const values of [
      { ...payload, auth_date: String(now / 1000 - 3601) },
      { ...payload, auth_date: String(now / 1000 + 31) },
      { ...payload, user: JSON.stringify({ id: Number.MAX_SAFE_INTEGER + 1 }) },
    ])
      expect(() => questionnaireIdentity(signed(values), token, now)).toThrow();
  });
});
