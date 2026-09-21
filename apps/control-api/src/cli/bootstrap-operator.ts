/**
 * The first platform operator. Creates a PLATFORM_ADMIN when no operator exists. TOTP is set up
 * on the first sign-in in the control panel; until then the guard refuses every control route.
 * Run: pnpm --filter control-api operator:bootstrap -- --email ops@vakhta.xyz --password '…' --name 'Name'
 */
import { parseArgs } from 'node:util';
import { controlAuthUser, createRegistry, eq } from '@vakhta/registry';
import { createControlAuth } from '../auth/auth.config.js';
import { loadControlEnv } from '../config/env.js';

const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string', default: 'Operator' },
    force: { type: 'boolean', default: false },
  },
});
if (!values.email || !values.password) throw new Error('--email and --password are required');

const env = loadControlEnv(process.env);
const { db, client } = createRegistry(env.CONTROL_DATABASE_URL, { max: 1 });
try {
  const existing = await db.select({ id: controlAuthUser.id }).from(controlAuthUser).limit(1);
  if (existing.length > 0 && !values.force) {
    console.error('Operators already exist. Create others from the control panel or pass --force.');
    process.exitCode = 1;
  } else {
    const auth = createControlAuth({
      db,
      secret: env.CONTROL_AUTH_SECRET,
      baseURL: env.CONTROL_PUBLIC_BASE_URL,
      trustedOrigins: env.CONTROL_CORS_ORIGINS,
      allowSignUp: true,
    });
    const created = await auth.api.signUpEmail({
      body: { email: values.email.toLowerCase(), password: values.password, name: values.name },
    });
    await db
      .update(controlAuthUser)
      .set({ role: 'PLATFORM_ADMIN' })
      .where(eq(controlAuthUser.id, created.user.id));
    console.log(
      JSON.stringify({ id: created.user.id, email: created.user.email, role: 'PLATFORM_ADMIN' }),
    );
  }
} finally {
  await client.end({ timeout: 5 });
}
