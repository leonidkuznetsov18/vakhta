import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { ENV_TENANT_ID, tenants, type RegistryDbOrTx } from '@vakhta/registry';
import type { ProvisioningStep, StepContext } from './context.js';

interface Scope {
  prefix: string;
  excluded: readonly string[];
}

export async function deletionStorageScopes(ctx: {
  tenant: StepContext['tenant'];
  db: RegistryDbOrTx;
}): Promise<Scope[]> {
  const prefix = ctx.tenant.storagePrefix;
  const rows = await ctx.db
    .select({ id: tenants.id, prefix: tenants.storagePrefix, slug: tenants.slug })
    .from(tenants);
  const others = rows
    .filter((row) => row.id !== ctx.tenant.id)
    .flatMap((row) => [row.prefix, `tenants/${row.slug}/`])
    .filter(Boolean);
  const canonical = `tenants/${ctx.tenant.slug}/`;
  const targets = [...new Set([prefix, canonical].filter(Boolean))];
  if (
    targets.some(
      (target) =>
        !target.endsWith('/') ||
        others.some((other) => other.startsWith(target) || target.startsWith(other)),
    )
  )
    throw new Error('Tenant storage prefixes overlap');
  if (!prefix) {
    if (ctx.tenant.id !== ENV_TENANT_ID)
      throw new Error('Unscoped storage is reserved for the legacy tenant');
    return [
      { prefix: '', excluded: ['tenants/', ...others] },
      { prefix: canonical, excluded: [] },
    ];
  }
  return targets.map((value) => ({ prefix: value, excluded: [] }));
}

interface DeletePageInput {
  client: S3Client;
  bucket: string;
  scope: Scope;
  token?: string;
}

async function deletePage(input: DeletePageInput): Promise<void> {
  const page = await input.client.send(
    new ListObjectsV2Command({
      Bucket: input.bucket,
      Prefix: input.scope.prefix,
      MaxKeys: 1000,
      ...(input.token ? { ContinuationToken: input.token } : {}),
    }),
    { abortSignal: AbortSignal.timeout(15_000) },
  );
  const keys = (page.Contents ?? []).flatMap((object) => {
    if (
      !object.Key ||
      !object.Key.startsWith(input.scope.prefix) ||
      input.scope.excluded.some((prefix) => object.Key?.startsWith(prefix))
    )
      return [];
    return [{ Key: object.Key }];
  });
  if (keys.length) {
    const result = await input.client.send(
      new DeleteObjectsCommand({ Bucket: input.bucket, Delete: { Objects: keys, Quiet: true } }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    if (result.Errors?.length) throw new Error('Some tenant files could not be deleted');
  }
  if (!page.IsTruncated) return;
  if (!page.NextContinuationToken || page.NextContinuationToken === input.token)
    throw new Error('Storage pagination did not advance');
  await deletePage({ ...input, token: page.NextContinuationToken });
}

export const dropStorageStep: ProvisioningStep = {
  async isDone() {
    return false;
  },
  async run(ctx) {
    const { S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET } = ctx.env;
    if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET)
      throw new Error('Storage deletion is not configured');
    const targets = await deletionStorageScopes(ctx);
    const client = new S3Client({
      region: ctx.env.S3_REGION,
      forcePathStyle: true,
      ...(ctx.env.S3_ENDPOINT ? { endpoint: ctx.env.S3_ENDPOINT } : {}),
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
    });
    try {
      await Promise.all(targets.map((scope) => deletePage({ client, bucket: S3_BUCKET, scope })));
    } finally {
      client.destroy();
    }
    return { kind: 'done' };
  },
};
