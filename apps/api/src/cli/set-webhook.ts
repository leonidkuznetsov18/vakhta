/**
 * Реєструє webhook у Telegram із секретним заголовком (ТЗ 12.2).
 * Запуск: pnpm --filter api telegram:set-webhook
 */
import { Api } from 'grammy';
import { loadEnv } from '../config/env.js';

const env = loadEnv(process.env);
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
  throw new Error('Потрібні TELEGRAM_BOT_TOKEN і TELEGRAM_WEBHOOK_SECRET у середовищі');
}

const api = new Api(env.TELEGRAM_BOT_TOKEN);
const url = new URL('/telegram/webhook', env.PUBLIC_BASE_URL).toString();

await api.setWebhook(url, {
  secret_token: env.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: false,
});

const info = await api.getWebhookInfo();
console.log(JSON.stringify({ url: info.url, pending: info.pending_update_count }, null, 2));
