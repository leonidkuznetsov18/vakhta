import { TenantGateway, TenantGatewayProbe } from '@vakhta/contracts';
import { TenantDomainStatus } from '@vakhta/domain';
import { and, eq, sql, tenantDomains, tenants } from '@vakhta/registry';
import { managedHosts } from '../../tenants/hosts.js';
import { RetryableProvisioningError } from '../retry.js';
import type { StepContext, StepOutcome } from './context.js';

async function probe(host: string): Promise<void> {
  try {
    const response = await fetch(`https://${host}${TenantGateway.PROBE_PATH}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('Gateway unavailable');
    const result = TenantGatewayProbe.parse(await response.json());
    if (result.host !== host) throw new Error('Gateway host mismatch');
  } catch {
    throw new RetryableProvisioningError('Managed hostname gateway is not ready');
  }
}

export async function registerGatewayDomains(ctx: StepContext): Promise<StepOutcome> {
  const zone = ctx.env.TENANT_GATEWAY_ZONE;
  if (!zone) throw new Error('Gateway zone missing');
  const hosts = managedHosts(ctx.env, ctx.tenant.slug);
  const matchesZone = (host: string) =>
    host.endsWith(`.${zone}`) && /^[a-z0-9-]+$/.test(host.slice(0, -(zone.length + 1)));
  const valid = hosts.every(({ host }) => matchesZone(host));
  if (!valid || ctx.env.PLATFORM_SCHEME !== 'https')
    throw new Error('Managed hosts are outside the gateway zone');
  await Promise.all(hosts.map(({ host }) => probe(host)));
  await ctx.db.transaction(async (tx) => {
    await Promise.all(
      hosts.map(({ host }) =>
        tx
          .update(tenantDomains)
          .set({ status: TenantDomainStatus.VERIFIED, verifiedAt: new Date() })
          .where(
            and(
              eq(tenantDomains.tenantId, ctx.tenant.id),
              eq(tenantDomains.host, host),
              eq(tenantDomains.isManaged, true),
            ),
          ),
      ),
    );
    await tx
      .update(tenants)
      .set({ updatedAt: sql`now()` })
      .where(eq(tenants.id, ctx.tenant.id));
  });
  return { kind: 'done', output: { verified: hosts.length, gateway: true } };
}
