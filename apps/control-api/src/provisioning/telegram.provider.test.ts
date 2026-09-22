import { afterEach, expect, it, vi } from 'vitest';
import { Api, GrammyError } from 'grammy';
import { TelegramProvider } from './telegram.provider.js';

afterEach(() => vi.restoreAllMocks());

it.each([401, 404])(
  'treats revoked bot credentials (%s) as inaccessible during removal',
  async (code) => {
    vi.spyOn(Api.prototype, 'deleteWebhook').mockRejectedValue(
      new GrammyError(
        'Rejected',
        { ok: false, error_code: code, description: 'Invalid token' },
        'deleteWebhook',
        {},
      ),
    );
    await expect(new TelegramProvider().deleteWebhook('123456:invalid')).resolves.toBeUndefined();
  },
);
it('keeps transient webhook removal failures retryable', async () => {
  vi.spyOn(Api.prototype, 'deleteWebhook').mockRejectedValue(new Error('Unavailable'));
  await expect(new TelegramProvider().deleteWebhook('123456:invalid')).rejects.toThrow(
    'Unavailable',
  );
});
