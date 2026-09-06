/**
 * Registers the Telegram webhooks with their secret headers (spec 12.2): the worker bot and,
 * when configured, the support bot. Run: pnpm --filter api telegram:set-webhook
 */
import { Api } from 'grammy';
import { loadEnv } from '../config/env.js';

const env = loadEnv(process.env);
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
  throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required');
}

async function register(name: string, token: string, path: string, secret: string) {
  const api = new Api(token);
  const url = new URL(path, env.PUBLIC_BASE_URL).toString();
  await api.setWebhook(url, {
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  const info = await api.getWebhookInfo();
  console.log(JSON.stringify({ bot: name, url: info.url, pending: info.pending_update_count }));
}

await register('worker', env.TELEGRAM_BOT_TOKEN, '/telegram/webhook', env.TELEGRAM_WEBHOOK_SECRET);
if (env.TELEGRAM_SUPPORT_BOT_TOKEN && env.TELEGRAM_SUPPORT_WEBHOOK_SECRET) {
  await register(
    'support',
    env.TELEGRAM_SUPPORT_BOT_TOKEN,
    '/telegram/support/webhook',
    env.TELEGRAM_SUPPORT_WEBHOOK_SECRET,
  );
}
