/**
 * Registers the Telegram webhooks with their secret headers (spec 12.2). Env mode: the worker bot
 * on /telegram/webhook and, when configured, the support bot. Registry mode: every serving tenant
 * with a bot token on /telegram/webhook/<tenantId> at its own API host.
 * Run: pnpm --filter api telegram:set-webhook
 */
import { Api } from 'grammy';
import { TenancyMode, TenantSurface } from '@vakhta/domain';
import {
  RegistryTenantSource,
  SecretCipher,
  createRegistry,
  primaryHost,
  type TenantRuntimeConfig,
} from '@vakhta/registry';
import { loadEnv } from '../config/env.js';

const env = loadEnv(process.env);

async function register(name: string, token: string, url: string, secret: string) {
  const api = new Api(token);
  await api.setWebhook(url, {
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  const info = await api.getWebhookInfo();
  console.log(JSON.stringify({ bot: name, url: info.url, pending: info.pending_update_count }));
}

async function registerEnvBots(): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required');
  }
  await register(
    'worker',
    env.TELEGRAM_BOT_TOKEN,
    new URL('/telegram/webhook', env.PUBLIC_BASE_URL).toString(),
    env.TELEGRAM_WEBHOOK_SECRET,
  );
}

async function registerTenantBot(tenant: TenantRuntimeConfig, scheme: string): Promise<void> {
  const host = primaryHost(tenant, TenantSurface.API);
  if (!tenant.botToken || !tenant.webhookSecret || !host) {
    console.log(
      JSON.stringify({ tenant: tenant.slug, skipped: 'no bot token, secret or API host' }),
    );
    return;
  }
  await register(
    tenant.slug,
    tenant.botToken,
    `${scheme}://${host}/telegram/webhook/${tenant.id}`,
    tenant.webhookSecret,
  );
}

async function registerTenantBots(): Promise<void> {
  if (!env.CONTROL_DATABASE_URL || !env.CONTROL_ENCRYPTION_KEY) {
    throw new Error(
      'CONTROL_DATABASE_URL and CONTROL_ENCRYPTION_KEY are required in registry mode',
    );
  }
  const { db, client } = createRegistry(env.CONTROL_DATABASE_URL, { max: 1 });
  try {
    const source = new RegistryTenantSource(db, new SecretCipher(env.CONTROL_ENCRYPTION_KEY));
    await source.reload();
    const scheme = env.PUBLIC_BASE_URL.startsWith('https://') ? 'https' : 'http';
    await Promise.all(source.active().map((tenant) => registerTenantBot(tenant, scheme)));
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (env.TENANCY_MODE === TenancyMode.REGISTRY) await registerTenantBots();
else await registerEnvBots();

if (env.TELEGRAM_SUPPORT_BOT_TOKEN && env.TELEGRAM_SUPPORT_WEBHOOK_SECRET) {
  await register(
    'support',
    env.TELEGRAM_SUPPORT_BOT_TOKEN,
    new URL('/telegram/support/webhook', env.PUBLIC_BASE_URL).toString(),
    env.TELEGRAM_SUPPORT_WEBHOOK_SECRET,
  );
}
