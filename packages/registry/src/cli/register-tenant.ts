/**
 * Registers a tenant whose database already exists and is migrated (the pilot cutover).
 * Run: pnpm --filter @vakhta/registry register-tenant -- --slug pilot --name "Пілот" \
 *   --database-url "$DATABASE_URL" --api-host api.vakhta.xyz --panel-host panel.vakhta.xyz \
 *   --kiosk-host kiosk.vakhta.xyz --bot-token "$TELEGRAM_BOT_TOKEN" --bot-username vakhta_worker_bot \
 *   --webhook-secret "$TELEGRAM_WEBHOOK_SECRET" --timezone Europe/Kyiv --locale ru --storage-prefix ""
 * Reads CONTROL_DATABASE_URL and CONTROL_ENCRYPTION_KEY. Secrets are never printed.
 */
import { parseArgs } from 'node:util';
import { LOCALES, type Locale } from '@vakhta/domain';
import { createRegistry } from '../client.js';
import { registerExistingTenant } from '../register.js';
import { SecretCipher } from '../secrets.js';

const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    slug: { type: 'string' },
    name: { type: 'string' },
    'display-name': { type: 'string' },
    'database-url': { type: 'string' },
    'database-name': { type: 'string' },
    'storage-prefix': { type: 'string' },
    'api-host': { type: 'string' },
    'panel-host': { type: 'string' },
    'kiosk-host': { type: 'string' },
    'bot-token': { type: 'string' },
    'bot-username': { type: 'string' },
    'webhook-secret': { type: 'string' },
    timezone: { type: 'string', default: 'Europe/Kyiv' },
    locale: { type: 'string', default: 'ru' },
    actor: { type: 'string' },
  },
});

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

const controlUrl = process.env['CONTROL_DATABASE_URL'];
const keyHex = process.env['CONTROL_ENCRYPTION_KEY'];
if (!controlUrl || !keyHex)
  throw new Error('CONTROL_DATABASE_URL and CONTROL_ENCRYPTION_KEY are required');
const locale = values.locale as Locale;
if (!LOCALES.includes(locale)) throw new Error(`--locale must be one of ${LOCALES.join(', ')}`);

const { db, client } = createRegistry(controlUrl, { max: 1 });
try {
  const tenant = await registerExistingTenant(db, new SecretCipher(keyHex), {
    slug: required('slug', values.slug),
    name: required('name', values.name),
    displayName: values['display-name'],
    databaseUrl: required('database-url', values['database-url']),
    databaseName: values['database-name'],
    storagePrefix: values['storage-prefix'],
    apiHost: required('api-host', values['api-host']),
    panelHost: values['panel-host'],
    kioskHost: values['kiosk-host'],
    botToken: values['bot-token'],
    botUsername: values['bot-username'],
    webhookSecret: values['webhook-secret'],
    timezone: values.timezone,
    defaultLocale: locale,
    actorEmail: values.actor,
  });
  console.log(JSON.stringify({ ok: true, tenantId: tenant.id, slug: tenant.slug }));
} finally {
  await client.end({ timeout: 5 });
}
