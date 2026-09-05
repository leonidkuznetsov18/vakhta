import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from '@vakhta/db';
import {
  orgUnits,
  positions,
  qrTerminals,
  reasonCodes,
  responsibilityZones,
  sites,
  teams,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { IANAZone } from 'luxon';
import { generateDeviceToken, hashDeviceToken } from '@vakhta/domain/node';
import type {
  CreateOrgUnitCommand,
  CreatePositionCommand,
  CreateSiteCommand,
  CreateTeamCommand,
  CreateZoneCommand,
  OrgSnapshot,
  RegisterTerminalCommand,
  TerminalRegistered,
} from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';

/** Довідники: майданчики, підрозділи, бригади, посади, зони, термінали (ТЗ 2, 9.1). */
@Injectable()
export class OrgService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
  ) {}

  async createSite(cmd: CreateSiteCommand, actor: Actor) {
    if (!IANAZone.isValidZone(cmd.timezone)) {
      throw new DomainError(
        'INVALID_TIMEZONE',
        422,
        `Невідомий часовий пояс IANA: ${cmd.timezone}`,
      );
    }
    return this.insertWithAudit('site', 'ORG_SITE_CREATED', actor, cmd, async (tx) => {
      const [row] = await tx.insert(sites).values(cmd).returning();
      return row!;
    });
  }

  async createOrgUnit(cmd: CreateOrgUnitCommand, actor: Actor) {
    await this.requireSite(cmd.siteId);
    if (cmd.parentId) await this.requireOrgUnit(cmd.parentId, cmd.siteId);
    return this.insertWithAudit('org_unit', 'ORG_UNIT_CREATED', actor, cmd, async (tx) => {
      const [row] = await tx
        .insert(orgUnits)
        .values({ siteId: cmd.siteId, parentId: cmd.parentId ?? null, name: cmd.name })
        .returning();
      return row!;
    });
  }

  async createTeam(cmd: CreateTeamCommand, actor: Actor) {
    await this.requireOrgUnit(cmd.orgUnitId);
    return this.insertWithAudit('team', 'ORG_TEAM_CREATED', actor, cmd, async (tx) => {
      const [row] = await tx.insert(teams).values(cmd).returning();
      return row!;
    });
  }

  async createPosition(cmd: CreatePositionCommand, actor: Actor) {
    return this.insertWithAudit('position', 'ORG_POSITION_CREATED', actor, cmd, async (tx) => {
      const [row] = await tx.insert(positions).values(cmd).returning();
      return row!;
    });
  }

  async createZone(cmd: CreateZoneCommand, actor: Actor) {
    await this.requireOrgUnit(cmd.orgUnitId, cmd.siteId);
    return this.insertWithAudit('zone', 'ORG_ZONE_CREATED', actor, cmd, async (tx) => {
      const [existing] = await tx
        .select({ id: responsibilityZones.id })
        .from(responsibilityZones)
        .where(
          and(eq(responsibilityZones.siteId, cmd.siteId), eq(responsibilityZones.code, cmd.code)),
        )
        .limit(1);
      if (existing)
        throw new DomainError(
          'CODE_TAKEN',
          409,
          `Зона з кодом ${cmd.code} уже існує на майданчику`,
        );
      const [row] = await tx.insert(responsibilityZones).values(cmd).returning();
      return row!;
    });
  }

  /** FR-QR-01: термінал реєструється за майданчиком; токен повертається один раз. */
  async registerTerminal(cmd: RegisterTerminalCommand, actor: Actor): Promise<TerminalRegistered> {
    await this.requireSite(cmd.siteId);
    const deviceToken = generateDeviceToken();
    const row = await this.insertWithAudit(
      'qr_terminal',
      'QR_TERMINAL_REGISTERED',
      actor,
      cmd,
      async (tx) => {
        const [inserted] = await tx
          .insert(qrTerminals)
          .values({ ...cmd, deviceTokenHash: hashDeviceToken(deviceToken) })
          .returning();
        return inserted!;
      },
    );
    return {
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      checkpoint: row.checkpoint,
      deviceToken,
    };
  }

  async snapshot(): Promise<OrgSnapshot> {
    const [s, u, t, p, z, term, r] = await Promise.all([
      this.db.select().from(sites).orderBy(asc(sites.code)),
      this.db.select().from(orgUnits).orderBy(asc(orgUnits.name)),
      this.db.select().from(teams).orderBy(asc(teams.name)),
      this.db.select().from(positions).orderBy(asc(positions.code)),
      this.db.select().from(responsibilityZones).orderBy(asc(responsibilityZones.code)),
      this.db.select().from(qrTerminals).orderBy(asc(qrTerminals.name)),
      this.db.select().from(reasonCodes).orderBy(asc(reasonCodes.kind), asc(reasonCodes.code)),
    ]);
    return {
      sites: s.map(({ id, code, name, timezone }) => ({ id, code, name, timezone })),
      orgUnits: u.map(({ id, siteId, parentId, name }) => ({ id, siteId, parentId, name })),
      teams: t.map(({ id, orgUnitId, name }) => ({ id, orgUnitId, name })),
      positions: p.map(({ id, code, name }) => ({ id, code, name })),
      zones: z.map(({ id, siteId, orgUnitId, code, name, type, isShared, isActive }) => ({
        id,
        siteId,
        orgUnitId,
        code,
        name,
        type,
        isShared,
        isActive,
      })),
      terminals: term.map(({ id, siteId, name, checkpoint, status, lastSeenAt }) => ({
        id,
        siteId,
        name,
        checkpoint,
        status,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
      })),
      reasonCodes: r.map(
        ({
          kind,
          code,
          label,
          requiresComment,
          requiresPhoto,
          notifyMaster,
          severity,
          isActive,
        }) => ({
          kind,
          code,
          label,
          requiresComment,
          requiresPhoto,
          notifyMaster,
          severity,
          isActive,
        }),
      ),
    };
  }

  async requireSite(siteId: string, tx: DbOrTx = this.db) {
    const [row] = await tx.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!row) throw new DomainError('SITE_NOT_FOUND', 404, `Майданчик ${siteId} не знайдено`);
    return row;
  }

  async requireOrgUnit(orgUnitId: string, siteId?: string, tx: DbOrTx = this.db) {
    const [row] = await tx.select().from(orgUnits).where(eq(orgUnits.id, orgUnitId)).limit(1);
    if (!row)
      throw new DomainError('ORG_UNIT_NOT_FOUND', 404, `Підрозділ ${orgUnitId} не знайдено`);
    if (siteId && row.siteId !== siteId) {
      throw new DomainError('ORG_UNIT_SITE_MISMATCH', 422, 'Підрозділ належить іншому майданчику');
    }
    return row;
  }

  async requirePosition(positionId: string, tx: DbOrTx = this.db) {
    const [row] = await tx.select().from(positions).where(eq(positions.id, positionId)).limit(1);
    if (!row) throw new DomainError('POSITION_NOT_FOUND', 404, `Посаду ${positionId} не знайдено`);
    return row;
  }

  async requireTeam(teamId: string, orgUnitId: string, tx: DbOrTx = this.db) {
    const [row] = await tx.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!row) throw new DomainError('TEAM_NOT_FOUND', 404, `Бригаду ${teamId} не знайдено`);
    if (row.orgUnitId !== orgUnitId) {
      throw new DomainError('TEAM_ORG_UNIT_MISMATCH', 422, 'Бригада належить іншому підрозділу');
    }
    return row;
  }

  private async insertWithAudit<T extends { id: string }>(
    objectType: string,
    eventType: string,
    actor: Actor,
    payload: Record<string, unknown>,
    insert: (tx: DbOrTx) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.transaction(async (tx) => {
        const row = await insert(tx);
        await this.events.append(tx, {
          type: eventType,
          source: 'WEB',
          actor,
          payload: { ...payload, id: row.id },
        });
        await this.audit.record(tx, {
          actor,
          action: `${objectType}.create`,
          objectType,
          objectId: row.id,
          after: payload,
        });
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError('CODE_TAKEN', 409, `Запис ${objectType} з таким кодом уже існує`);
      }
      throw error;
    }
  }
}
