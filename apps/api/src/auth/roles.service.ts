import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from '@vakhta/db';
import { webUserRoles, type Database } from '@vakhta/db';
import type { RoleGrant } from '@vakhta/domain';
import type { GrantRoleCommand, RoleGrantView } from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';

type GrantRow = typeof webUserRoles.$inferSelect;

/** Ролі з областями (FR-AUTH-03, ADR-9). Кожна зміна пишеться в події й аудит. */
@Injectable()
export class RolesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
  ) {}

  async grantsOf(userId: string): Promise<RoleGrant[]> {
    const rows = await this.db.select().from(webUserRoles).where(eq(webUserRoles.userId, userId));
    return rows.map((r) => ({ role: r.role, scopeType: r.scopeType, scopeId: r.scopeId }));
  }

  async listByUser(userId: string): Promise<RoleGrantView[]> {
    const rows = await this.db
      .select()
      .from(webUserRoles)
      .where(eq(webUserRoles.userId, userId))
      .orderBy(asc(webUserRoles.grantedAt));
    return rows.map((r) => this.toView(r));
  }

  async listAll(): Promise<(RoleGrantView & { userId: string })[]> {
    const rows = await this.db.select().from(webUserRoles).orderBy(asc(webUserRoles.grantedAt));
    return rows.map((r) => ({ ...this.toView(r), userId: r.userId }));
  }

  async grant(userId: string, cmd: GrantRoleCommand, actor: Actor): Promise<RoleGrantView> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(webUserRoles)
          .values({
            userId,
            role: cmd.role,
            scopeType: cmd.scopeType,
            scopeId: cmd.scopeId ?? null,
            grantedBy: actor.id,
          })
          .returning();
        if (!row) throw new Error('web_user_roles: insert не повернув рядок');
        await this.events.append(tx, {
          type: 'WEB_ROLE_GRANTED',
          source: 'WEB',
          actor,
          payload: {
            userId,
            role: cmd.role,
            scopeType: cmd.scopeType,
            scopeId: cmd.scopeId ?? null,
          },
        });
        await this.audit.record(tx, {
          actor,
          action: 'web_user.role.grant',
          objectType: 'web_user',
          objectId: userId,
          after: { role: cmd.role, scopeType: cmd.scopeType, scopeId: cmd.scopeId ?? null },
        });
        return this.toView(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError(
          'ROLE_ALREADY_GRANTED',
          409,
          'Така роль у цій області вже призначена',
        );
      }
      throw error;
    }
  }

  async revoke(userId: string, grantId: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.delete(webUserRoles).where(eq(webUserRoles.id, grantId)).returning();
      if (!row || row.userId !== userId) {
        throw new DomainError('GRANT_NOT_FOUND', 404, 'Призначення ролі не знайдено');
      }
      await this.events.append(tx, {
        type: 'WEB_ROLE_REVOKED',
        source: 'WEB',
        actor,
        payload: { userId, role: row.role, scopeType: row.scopeType, scopeId: row.scopeId },
      });
      await this.audit.record(tx, {
        actor,
        action: 'web_user.role.revoke',
        objectType: 'web_user',
        objectId: userId,
        before: { role: row.role, scopeType: row.scopeType, scopeId: row.scopeId },
      });
    });
  }

  private toView(row: GrantRow): RoleGrantView {
    return {
      id: row.id,
      role: row.role,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      grantedAt: row.grantedAt.toISOString(),
    };
  }
}
