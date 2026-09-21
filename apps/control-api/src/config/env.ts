import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const commaList = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : v,
  z.array(z.string().min(1)),
);

/**
 * The control service holds what the tenant API must never see: the cluster admin URL and
 * provider tokens. Tenant secrets stay encrypted with CONTROL_ENCRYPTION_KEY.
 */
export const ControlEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  CONTROL_PORT: z.coerce.number().int().positive().default(3100),
  CONTROL_HOST: z.string().default('0.0.0.0'),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  CONTROL_DATABASE_URL: z.string().min(1),
  CONTROL_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
  /** Signs operator session cookies and encrypts operator TOTP secrets. */
  CONTROL_AUTH_SECRET: z.string().min(32),
  /** Where control-web runs; also the trusted origin of the operator session. */
  CONTROL_PUBLIC_BASE_URL: z.string().default('http://localhost:3100'),
  CONTROL_CORS_ORIGINS: commaList.default(['http://localhost:5175']),
  /** Cluster URL with CREATE DATABASE / CREATE ROLE rights; used only by provisioning. */
  PROVISION_DATABASE_ADMIN_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /**
   * Managed hostnames, one label under the platform zone so Universal SSL and a single Railway
   * wildcard cover them (research 2026-09-21): `{slug}` is replaced by the tenant slug.
   */
  PANEL_HOST_PATTERN: z.string().default('{slug}.vakhta.xyz'),
  KIOSK_HOST_PATTERN: z.string().default('{slug}-kiosk.vakhta.xyz'),
  API_HOST_PATTERN: z.string().default('{slug}-api.vakhta.xyz'),
  /** Scheme of tenant public URLs; https everywhere but local development. */
  PLATFORM_SCHEME: z.enum(['https', 'http']).default('https'),
  /** CNAME targets the manual DNS instruction names until provider automation exists. */
  PANEL_CNAME_TARGET: z.string().default('vakhta-panel.pages.dev'),
  KIOSK_CNAME_TARGET: z.string().default('vakhta-kiosk.pages.dev'),
  API_CNAME_TARGET: z.string().default('api.vakhta.xyz'),
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  PROVISIONING_POLL_MS: z.coerce.number().int().min(200).default(1000),
  AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'none']).default('lax'),
});

export type ControlEnv = z.infer<typeof ControlEnvSchema>;

const PLACEHOLDER = /change-me|example|^dev-/i;

export function loadControlEnv(source: Record<string, unknown>): ControlEnv {
  const parsed = ControlEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid control-api configuration: ${issues}`);
  }
  assertProductionReady(parsed.data);
  return parsed.data;
}

export function assertProductionReady(env: ControlEnv): void {
  if (env.NODE_ENV !== 'production') return;
  const problems: string[] = [];
  if (!env.CONTROL_PUBLIC_BASE_URL.startsWith('https://'))
    problems.push('CONTROL_PUBLIC_BASE_URL must be https');
  if (PLACEHOLDER.test(env.CONTROL_AUTH_SECRET))
    problems.push('CONTROL_AUTH_SECRET looks like a placeholder');
  if (env.PLATFORM_SCHEME !== 'https') problems.push('PLATFORM_SCHEME must be https');
  if (problems.length > 0)
    throw new Error(`control-api is not production ready: ${problems.join('; ')}`);
}
