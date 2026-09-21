import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import {
  authAccount,
  authSession,
  authTwoFactor,
  authUser,
  authVerification,
  createDatabase,
  eq,
  webUserRoles,
  type Database,
} from '@vakhta/db';
import type { TenantsService } from '../../tenants/tenants.service.js';
import type { ProvisioningStep, StepContext } from './context.js';

/**
 * A minimal better-auth instance over the tenant database, used only to create the first
 * administrator with the same password hashing as the tenant API. The secret is irrelevant for
 * a sign-up (it signs cookies), so a random one is used and discarded.
 */
function tenantSignUp(db: Database) {
  return betterAuth({
    secret: randomBytes(32).toString('hex'),
    baseURL: 'http://control.invalid',
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
        twoFactor: authTwoFactor,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      minPasswordLength: 12,
      requireEmailVerification: false,
    },
    advanced: { database: { generateId: 'uuid' } },
  });
}

/**
 * Creates the first administrator (ADMIN on the whole tenant) with a random password the welcome
 * page replaces, and issues the onboarding link. The link is the only output; no password leaves.
 */
export function inviteAdminStep(tenants: TenantsService): ProvisioningStep {
  return {
    async isDone() {
      return false;
    },
    async run(ctx: StepContext) {
      const email =
        typeof ctx.payload['adminEmail'] === 'string'
          ? ctx.payload['adminEmail'].toLowerCase()
          : null;
      const name =
        typeof ctx.payload['adminName'] === 'string' ? ctx.payload['adminName'] : 'Administrator';
      if (!email) return { kind: 'skipped', output: { reason: 'NO_ADMIN_EMAIL' } };
      const url = await ctx.secret('DATABASE_URL');
      if (!url) throw new Error('DATABASE_URL secret is missing');
      const handle = createDatabase(url, { max: 1 });
      try {
        const [existing] = await handle.db
          .select({ id: authUser.id })
          .from(authUser)
          .where(eq(authUser.email, email))
          .limit(1);
        let userId = existing?.id;
        if (!userId) {
          const created = await tenantSignUp(handle.db).api.signUpEmail({
            body: { email, name, password: randomBytes(24).toString('base64url') },
          });
          userId = created.user.id;
        }
        await handle.db
          .insert(webUserRoles)
          .values({ userId, role: 'ADMIN', scopeType: 'ENTERPRISE', scopeId: null })
          .onConflictDoNothing();
      } finally {
        await handle.client.end({ timeout: 5 });
      }
      const invitation = await tenants.issueInvitation({
        tenantId: ctx.tenant.id,
        adminEmail: email,
        actor: null,
        tx: ctx.db,
      });
      return { kind: 'done', output: { adminEmail: email, onboardingUrl: invitation.url } };
    },
  };
}
