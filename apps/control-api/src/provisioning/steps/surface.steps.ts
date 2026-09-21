import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { TenantDomainStatus, TenantModule, TenantSurface, normalizeHost } from '@vakhta/domain';
import { and, eq, sql, tenantDomains, tenantModules, tenants } from '@vakhta/registry';
import { managedHosts } from '../../tenants/hosts.js';
import type { TelegramProvider } from '../telegram.provider.js';
import type { ProvisioningStep, StepContext } from './context.js';

async function resolvesTo(host: string, target: string): Promise<boolean> {
  try {
    const names = await dns.resolveCname(host);
    return names.map(normalizeHost).includes(normalizeHost(target));
  } catch {
    return false;
  }
}

/**
 * Verifies each pending managed host by its CNAME. Hosts that do not resolve yet are listed with
 * the exact record to create; the operator retries the step after DNS changes.
 */
export const registerDomainsStep: ProvisioningStep = {
  async isDone(ctx) {
    const pending = await ctx.db
      .select({ id: tenantDomains.id })
      .from(tenantDomains)
      .where(
        and(
          eq(tenantDomains.tenantId, ctx.tenant.id),
          eq(tenantDomains.status, TenantDomainStatus.PENDING),
        ),
      );
    return pending.length === 0;
  },
  async run(ctx) {
    const targets = new Map(
      managedHosts(ctx.env, ctx.tenant.slug).map((h) => [h.host, h.cnameTarget]),
    );
    const rows = await ctx.db
      .select()
      .from(tenantDomains)
      .where(eq(tenantDomains.tenantId, ctx.tenant.id));
    const pending = rows.filter(
      (row) => row.status !== TenantDomainStatus.VERIFIED && targets.has(row.host),
    );
    const checks = await Promise.all(
      pending.map(async (row) => {
        const target = targets.get(row.host) ?? '';
        return { row, target, resolved: await resolvesTo(row.host, target) };
      }),
    );
    await Promise.all(
      checks
        .filter((c) => c.resolved)
        .map((c) =>
          ctx.db
            .update(tenantDomains)
            .set({ status: TenantDomainStatus.VERIFIED, verifiedAt: new Date() })
            .where(eq(tenantDomains.id, c.row.id)),
        ),
    );
    const missing = checks
      .filter((c) => !c.resolved)
      .map((c) => ({ host: c.row.host, type: 'CNAME' as const, target: c.target }));
    await ctx.db
      .update(tenants)
      .set({ updatedAt: sql`now()` })
      .where(eq(tenants.id, ctx.tenant.id));
    if (missing.length === 0) return { kind: 'done', output: { verified: rows.length } };
    return { kind: 'manual', output: { instruction: 'CREATE_DNS_RECORDS', records: missing } };
  },
};

export function botWebhookStep(telegram: TelegramProvider): ProvisioningStep {
  return {
    async isDone() {
      return false;
    },
    async run(ctx: StepContext) {
      const token = await ctx.secret('BOT_TOKEN');
      if (!token) return { kind: 'skipped', output: { reason: 'NO_BOT_TOKEN' } };
      const identity = await telegram.verifyToken(token);
      let secret = await ctx.secret('BOT_WEBHOOK_SECRET');
      if (!secret) {
        secret = randomBytes(24).toString('hex');
        await ctx.storeSecret('BOT_WEBHOOK_SECRET', secret);
      }
      const apiHost = managedHosts(ctx.env, ctx.tenant.slug).find(
        (h) => h.surface === TenantSurface.API,
      )?.host;
      const url = `${ctx.env.PLATFORM_SCHEME}://${apiHost ?? 'api.invalid'}/telegram/webhook/${ctx.tenant.id}`;
      await telegram.setWebhook(token, url, secret);
      await ctx.db
        .update(tenantModules)
        .set({ config: { botUsername: identity.username } })
        .where(
          and(
            eq(tenantModules.tenantId, ctx.tenant.id),
            eq(tenantModules.module, TenantModule.WORKER_BOT),
          ),
        );
      await ctx.db
        .update(tenants)
        .set({ updatedAt: sql`now()` })
        .where(eq(tenants.id, ctx.tenant.id));
      return {
        kind: 'done',
        output: { botUsername: identity.username, webhookHost: apiHost ?? null },
      };
    },
  };
}

export function removeWebhookStep(telegram: TelegramProvider): ProvisioningStep {
  return {
    async isDone() {
      return false;
    },
    async run(ctx) {
      const token = await ctx.secret('BOT_TOKEN');
      if (!token) return { kind: 'skipped', output: { reason: 'NO_BOT_TOKEN' } };
      await telegram.deleteWebhook(token);
      return { kind: 'done' };
    },
  };
}

/** Bumping updated_at makes every API and worker process rebuild the tenant runtime on refresh. */
export const evictRuntimeStep: ProvisioningStep = {
  async isDone() {
    return false;
  },
  async run(ctx) {
    await ctx.db
      .update(tenants)
      .set({ updatedAt: sql`now()` })
      .where(eq(tenants.id, ctx.tenant.id));
    return { kind: 'done' };
  },
};
