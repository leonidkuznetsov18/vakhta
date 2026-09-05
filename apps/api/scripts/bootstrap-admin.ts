/**
 * Перший адміністратор панелі. Створює користувача з роллю ADMIN на рівні підприємства,
 * якщо облікових записів ще немає. Запуск:
 *   pnpm --filter api auth:bootstrap -- --email admin@example.com --password 'довгий пароль' --name 'Адмін'
 */
import { parseArgs } from 'node:util';
import { createDatabase, authUser } from '@vakhta/db';
import { CreateWebUserCommand } from '@vakhta/contracts';
import { SYSTEM_ACTOR } from '../src/common/actor.js';
import { AuditLog } from '../src/events/audit-log.js';
import { EventStore } from '../src/events/event-store.js';
import { loadEnv } from '../src/config/env.js';
import { createAuth, type AuthConfig } from '../src/auth/auth.config.js';
import { AuthService } from '../src/auth/auth.service.js';
import { RolesService } from '../src/auth/roles.service.js';

// pnpm передає роздільник `--` далі в команду; parseArgs вважав би все після нього позиційним.
const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: 'Администратор' },
    force: { type: 'boolean', default: false },
  },
});

const env = loadEnv(process.env);
const { db, client } = createDatabase(env.DATABASE_URL, { max: 2 });

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
