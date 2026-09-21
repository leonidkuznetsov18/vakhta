/**
 * Перший адміністратор панелі. Створює користувача з роллю ADMIN на рівні підприємства,
 * якщо облікових записів ще немає. Запуск:
 *   pnpm --filter api auth:bootstrap -- --email admin@example.com --password 'довгий пароль' --name 'Адмін'
 */
import { parseArgs } from 'node:util';
import { createDatabase, authUser } from '@vakhta/db';
import { TenancyMode } from '@vakhta/domain';
import { RegistryTenantSource, SecretCipher, createRegistry } from '@vakhta/registry';
import { CreateWebUserCommand } from '@vakhta/contracts';
import { SYSTEM_ACTOR } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { loadEnv } from '../config/env.js';
import { createAuth, type AuthConfig } from '../auth/auth.config.js';
import { AuthService } from '../auth/auth.service.js';
import { RolesService } from '../auth/roles.service.js';

// pnpm передає роздільник `--` далі в команду; parseArgs вважав би все після нього позиційним.
const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: 'Администратор' },
    force: { type: 'boolean', default: false },
    /** Registry mode: which tenant database to bootstrap. */
    tenant: { type: 'string' },
  },
});

const env = loadEnv(process.env);
const databaseUrl = await resolveDatabaseUrl();
const { db, client } = createDatabase(databaseUrl, { max: 2 });

/** Env mode uses DATABASE_URL; registry mode needs --tenant and reads the tenant's own URL. */
async function resolveDatabaseUrl(): Promise<string> {
  if (env.TENANCY_MODE !== TenancyMode.REGISTRY) return env.DATABASE_URL;
  if (!values.tenant) throw new Error('--tenant <slug> is required in registry mode');
  if (!env.CONTROL_DATABASE_URL || !env.CONTROL_ENCRYPTION_KEY) {
    throw new Error(
      'CONTROL_DATABASE_URL and CONTROL_ENCRYPTION_KEY are required in registry mode',
    );
  }
  const registry = createRegistry(env.CONTROL_DATABASE_URL, { max: 1 });
  try {
    const source = new RegistryTenantSource(
      registry.db,
      new SecretCipher(env.CONTROL_ENCRYPTION_KEY),
    );
    await source.reload();
    const tenant = source.bySlug(values.tenant);
    if (!tenant) throw new Error(`Tenant "${values.tenant}" is not registered`);
    return tenant.databaseUrl;
  } finally {
    await registry.client.end({ timeout: 5 });
  }
}

try {
  const cmd = CreateWebUserCommand.parse({
    email: values.email,
    password: values.password,
    name: values.name,
    roles: [{ role: 'ADMIN', scopeType: 'ENTERPRISE' }],
  });

  const existing = await db.select({ id: authUser.id }).from(authUser).limit(1);
  if (existing.length > 0 && !values.force) {
    console.error('Користувачі вже є. Створюйте нових через панель або додайте --force.');
    process.exitCode = 1;
  } else {
    const config: AuthConfig = {
      db,
      secret: env.AUTH_SECRET,
      baseURL: env.PUBLIC_BASE_URL,
      trustedOrigins: env.CORS_ORIGINS,
    };
    const events = new EventStore();
    const audit = new AuditLog();
    const roles = new RolesService(db, events, audit);
    const service = new AuthService(createAuth(config), config, db, roles, events, audit);
    const user = await service.createUser(cmd, SYSTEM_ACTOR);
    console.log(
      JSON.stringify(
        { id: user.id, email: user.email, roles: user.roles.map((r) => r.role) },
        null,
        2,
      ),
    );
  }
} finally {
  await client.end({ timeout: 5 });
}
