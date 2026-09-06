import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from '@vakhta/db';
import { authUser, type Database } from '@vakhta/db';
import type {
  CreateWebUserCommand,
  UpdateMeCommand,
  UpdateWebUserCommand,
  WebUserView,
} from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { createAuth, type Auth, type AuthConfig } from './auth.config.js';
import { RolesService } from './roles.service.js';

export const AUTH = Symbol('AUTH');
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly twoFactorEnabled: boolean;
}

/** Обгортка над better-auth для решти застосунку: сесія, створення користувачів, перегляди. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(DATABASE) private readonly db: Database,
    private readonly roles: RolesService,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
  ) {}

  /** null, якщо cookie немає, сесія прострочена або очікує другий фактор. */
  async sessionUser(headers: Headers): Promise<SessionUser | null> {
    const result = await this.auth.api.getSession({ headers });
    if (!result) return null;
    const u = result.user as SessionUser & { twoFactorEnabled?: boolean | null };
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      twoFactorEnabled: u.twoFactorEnabled === true,
    };
  }

  /**
   * Створення користувача адміністратором або bootstrap-скриптом. Самореєстрація вимкнена,
   * тому тут піднімається окремий екземпляр better-auth із дозволеним signUp: пароль
   * хешується тим самим кодом, що й при вході.
   */
  async createUser(cmd: CreateWebUserCommand, actor: Actor): Promise<WebUserView> {
    const [existing] = await this.db
      .select({ id: authUser.id })
      .from(authUser)
      .where(eq(authUser.email, cmd.email.toLowerCase()))
      .limit(1);
    if (existing) throw new DomainError('EMAIL_TAKEN', 409, `Користувач ${cmd.email} уже існує`);

    const signUpAuth = createAuth({ ...this.config, allowSignUp: true });
    const created = await signUpAuth.api.signUpEmail({
      body: { email: cmd.email.toLowerCase(), password: cmd.password, name: cmd.name },
    });
    const userId = created.user.id;

    await this.db.transaction(async (tx) => {
      await this.events.append(tx, {
        type: 'WEB_USER_CREATED',
        source: 'WEB',
        actor,
        payload: { userId, email: cmd.email.toLowerCase() },
      });
      await this.audit.record(tx, {
        actor,
        action: 'web_user.create',
        objectType: 'web_user',
        objectId: userId,
        after: { email: cmd.email.toLowerCase(), name: cmd.name },
      });
    });
    for (const grant of cmd.roles) await this.roles.grant(userId, grant, actor);
    return this.requireView(userId);
  }

  /** Own profile: name and avatar. The avatar change is audited as a fact, not by content. */
  async updateMe(userId: string, cmd: UpdateMeCommand, actor: Actor): Promise<WebUserView> {
    const [before] = await this.db.select().from(authUser).where(eq(authUser.id, userId)).limit(1);
    if (!before) throw new DomainError('WEB_USER_NOT_FOUND', 404, `User ${userId} not found`);
    const set: Partial<typeof authUser.$inferInsert> = { updatedAt: new Date() };
    if (cmd.name !== undefined && cmd.name !== before.name) set.name = cmd.name;
    if (cmd.image !== undefined && cmd.image !== (before.image ?? null)) set.image = cmd.image;
    if (Object.keys(set).length > 1) {
      await this.db.transaction(async (tx) => {
        await tx.update(authUser).set(set).where(eq(authUser.id, userId));
        await this.audit.record(tx, {
          actor,
          action: 'web_user.update',
          objectType: 'web_user',
          objectId: userId,
          before: { name: before.name, avatar: Boolean(before.image) },
          after: { name: set.name ?? before.name, avatar: Boolean(set.image ?? before.image) },
        });
      });
    }
    return this.requireView(userId);
  }

  /** The display name; the e-mail is the login and stays. */
  async updateUser(userId: string, cmd: UpdateWebUserCommand, actor: Actor): Promise<WebUserView> {
    const [before] = await this.db.select().from(authUser).where(eq(authUser.id, userId)).limit(1);
    if (!before) throw new DomainError('WEB_USER_NOT_FOUND', 404, `User ${userId} not found`);
    if (before.name !== cmd.name) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(authUser)
          .set({ name: cmd.name, updatedAt: new Date() })
          .where(eq(authUser.id, userId));
        await this.audit.record(tx, {
          actor,
          action: 'web_user.update',
          objectType: 'web_user',
          objectId: userId,
          before: { name: before.name },
          after: { name: cmd.name },
        });
      });
    }
    return this.requireView(userId);
  }

  /**
   * Removes the panel account with its sessions, second factor and roles (the database cascades).
   * Nobody deletes themselves, and the last administrator stays, so the panel cannot lock itself out.
   */
  async deleteUser(userId: string, actor: Actor, currentUserId: string): Promise<void> {
    if (userId === currentUserId) {
      throw new DomainError('SELF_DELETE', 409, 'You cannot delete your own account');
    }
    const [user] = await this.db.select().from(authUser).where(eq(authUser.id, userId)).limit(1);
    if (!user) throw new DomainError('WEB_USER_NOT_FOUND', 404, `User ${userId} not found`);
    const grants = await this.roles.listAll();
    const admins = new Set(grants.filter((g) => g.role === 'ADMIN').map((g) => g.userId));
    if (admins.has(userId) && admins.size <= 1) {
      throw new DomainError('LAST_ADMIN', 409, 'The last administrator cannot be deleted');
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(authUser).where(eq(authUser.id, userId));
      await this.events.append(tx, {
        type: 'WEB_USER_DELETED',
        source: 'WEB',
        actor,
        payload: { userId, email: user.email },
      });
      await this.audit.record(tx, {
        actor,
        action: 'web_user.delete',
        objectType: 'web_user',
        objectId: userId,
        before: {
          email: user.email,
          name: user.name,
          roles: grants.filter((g) => g.userId === userId).map((g) => g.role),
        },
      });
    });
  }

  async listUsers(): Promise<WebUserView[]> {
    const users = await this.db.select().from(authUser).orderBy(asc(authUser.email));
    const grants = await this.roles.listAll();
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      twoFactorEnabled: u.twoFactorEnabled,
      image: u.image ?? null,
      roles: grants.filter((g) => g.userId === u.id).map(({ userId: _u, ...g }) => g),
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async requireView(userId: string): Promise<WebUserView> {
    const [u] = await this.db.select().from(authUser).where(eq(authUser.id, userId)).limit(1);
    if (!u) throw new DomainError('WEB_USER_NOT_FOUND', 404, `Користувача ${userId} не знайдено`);
    const roles = await this.roles.listByUser(userId);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      twoFactorEnabled: u.twoFactorEnabled,
      image: u.image ?? null,
      roles,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
