import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Таблиці better-auth (ADR-9). Ключі властивостей збігаються з іменами полів better-auth
 * (camelCase), імена колонок у базі snake_case. Ідентифікатори генерує Postgres
 * (better-auth з `generateId: 'uuid'` покладається на DEFAULT колонки).
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const authUser = pgTable('auth_user', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSession = pgTable(
  'auth_session',
  {
    id: id(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('auth_session_user_idx').on(t.userId)],
);

export const authAccount = pgTable(
  'auth_account',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Хеш пароля для provider credential; better-auth хешує сам (scrypt). */
    password: text('password'),
    issuer: text('issuer'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('auth_account_user_idx').on(t.userId)],
);

export const authVerification = pgTable(
  'auth_verification',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('auth_verification_identifier_idx').on(t.identifier)],
);

/** Плагін twoFactor: секрет зашифровано ключем better-auth, резервні коди теж. */
export const authTwoFactor = pgTable(
  'auth_two_factor',
  {
    id: id(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (t) => [
    index('auth_two_factor_user_idx').on(t.userId),
    index('auth_two_factor_secret_idx').on(t.secret),
  ],
);

/** Ролі ТЗ 2. Працівники користуються ботом і веб-ролі не мають. */
export const webRole = pgEnum('web_role', [
  'PRODUCTION_HEAD',
  'PLANNER',
  'HR',
  'SHIFT_MASTER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'ADMIN',
  'AUDITOR',
]);

/** Область даних FR-AUTH-03: підприємство, майданчик, підрозділ, бригада, зона. */
export const scopeType = pgEnum('scope_type', ['ENTERPRISE', 'SITE', 'ORG_UNIT', 'TEAM', 'ZONE']);

export const webUserRoles = pgTable(
  'web_user_roles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    role: webRole('role').notNull(),
    scopeType: scopeType('scope_type').notNull().default('ENTERPRISE'),
    /** null лише для ENTERPRISE. */
    scopeId: uuid('scope_id'),
    grantedBy: uuid('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('web_user_roles_user_idx').on(t.userId),
    uniqueIndex('web_user_roles_enterprise_uq')
      .on(t.userId, t.role)
      .where(sql`${t.scopeType} = 'ENTERPRISE'`),
    uniqueIndex('web_user_roles_scoped_uq')
      .on(t.userId, t.role, t.scopeType, t.scopeId)
      .where(sql`${t.scopeId} IS NOT NULL`),
  ],
);
