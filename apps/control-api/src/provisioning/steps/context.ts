import type { Logger } from 'pino';
import type { RegistryDatabase, SecretCipher } from '@vakhta/registry';
import type { tenants } from '@vakhta/registry';
import type { ControlEnv } from '../../config/env.js';

export type TenantRow = typeof tenants.$inferSelect;

/** What a step may read; secrets are fetched through `secret()` and never stored on the context. */
export interface StepContext {
  readonly tenant: TenantRow;
  readonly payload: Record<string, unknown>;
  readonly modules: readonly string[];
  readonly env: ControlEnv;
  readonly db: RegistryDatabase;
  readonly cipher: SecretCipher;
  readonly log: Logger;
  secret(kind: 'DATABASE_URL' | 'BOT_TOKEN' | 'BOT_WEBHOOK_SECRET'): Promise<string | null>;
  storeSecret(
    kind: 'DATABASE_URL' | 'BOT_TOKEN' | 'BOT_WEBHOOK_SECRET',
    value: string,
  ): Promise<void>;
}

export type StepOutcome =
  | { readonly kind: 'done'; readonly output?: Record<string, unknown> }
  | { readonly kind: 'skipped'; readonly output?: Record<string, unknown> }
  | { readonly kind: 'manual'; readonly output: Record<string, unknown> };

export interface ProvisioningStep {
  /** True when the effect already exists, so a resumed job skips the work (idempotency). */
  isDone(ctx: StepContext): Promise<boolean>;
  run(ctx: StepContext): Promise<StepOutcome>;
}
