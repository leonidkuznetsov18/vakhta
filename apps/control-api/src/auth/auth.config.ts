import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import {
  controlAuthAccount,
  controlAuthSession,
  controlAuthTwoFactor,
  controlAuthUser,
  controlAuthVerification,
  type RegistryDatabase,
} from '@vakhta/registry';

export interface ControlAuthConfig {
  readonly db: RegistryDatabase;
  readonly secret: string;
  readonly baseURL: string;
  readonly trustedOrigins: readonly string[];
  readonly allowSignUp?: boolean;
  readonly cookieSameSite?: 'lax' | 'none';
}

export const AUTH_BASE_PATH = '/auth';
export const CONTROL_APP_NAME = 'Vakhta Control';

/** Operators: e-mail + password + TOTP; the guard refuses sessions without a verified second factor. */
export function createControlAuth(config: ControlAuthConfig) {
  const secure = config.baseURL.startsWith('https://');
  return betterAuth({
    appName: CONTROL_APP_NAME,
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [...config.trustedOrigins],
    database: drizzleAdapter(config.db, {
      provider: 'pg',
      schema: {
        user: controlAuthUser,
        session: controlAuthSession,
        account: controlAuthAccount,
        verification: controlAuthVerification,
        twoFactor: controlAuthTwoFactor,
      },
    }),
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'PLATFORM_VIEWER', input: false },
        status: { type: 'string', required: false, defaultValue: 'ACTIVE', input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.allowSignUp,
      minPasswordLength: 12,
      requireEmailVerification: false,
    },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 15 },
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: secure,
      defaultCookieAttributes: { sameSite: config.cookieSameSite ?? 'lax', secure },
    },
    plugins: [twoFactor({ issuer: CONTROL_APP_NAME })],
  });
}

export type ControlAuth = ReturnType<typeof createControlAuth>;
