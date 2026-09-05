import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import {
  authAccount,
  authSession,
  authTwoFactor,
  authUser,
  authVerification,
  type Database,
} from '@vakhta/db';

export interface AuthConfig {
  readonly db: Database;
  readonly secret: string;
  readonly baseURL: string;
  readonly trustedOrigins: readonly string[];
  /** Лише для bootstrap першого користувача; у runtime самореєстрація вимкнена. */
  readonly allowSignUp?: boolean;
}

export const AUTH_BASE_PATH = '/auth';
export const APP_NAME = 'Вахта';

/**
 * better-auth: email + пароль + TOTP (ADR-9). Сесія 12 годин, як зміна; продовжується
 * при активності. OIDC-провайдер додається сюди ж, коли замовник назве IdP.
 */
export function createAuth(config: AuthConfig) {
  return betterAuth({
    appName: APP_NAME,
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [...config.trustedOrigins],
    database: drizzleAdapter(config.db, {
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
      disableSignUp: !config.allowSignUp,
      minPasswordLength: 12,
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 15,
    },
    advanced: {
      database: { generateId: 'uuid' },
    },
    plugins: [twoFactor({ issuer: APP_NAME })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
