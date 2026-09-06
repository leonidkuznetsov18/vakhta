import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from '@vakhta/db';
import {
  orgUnits,
  positions,
  qrTerminals,
  reasonCodes,
  terminalPairingCodes,
  responsibilityZones,
  sites,
  teams,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { IANAZone } from 'luxon';
import {
  formatPairingCode,
  generatePairingCode,
  hashPairingCode,
  pairingCodeExpiresAt,
} from '@vakhta/domain/node';
import type {
  CreateOrgUnitCommand,
  CreatePositionCommand,
  CreateSiteCommand,
  CreateTeamCommand,
  CreateZoneCommand,
  OrgSnapshot,
  RegisterTerminalCommand,
  SetTerminalStatusCommand,
  UpdateOrgUnitCommand,
  UpdatePositionCommand,
  UpdateSiteCommand,
  UpdateTeamCommand,
  UpdateTerminalCommand,
  UpdateZoneCommand,
  TerminalPairingIssued,
  TerminalRegistered,
} from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/pg-errors.js';
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

  /* ------------------------------------------------------------------ */
  /* Directory edits: same audit shape as creation, delete refused when referenced */
  /* ------------------------------------------------------------------ */

  async updateSite(id: string, cmd: UpdateSiteCommand, actor: Actor) {
    if (cmd.timezone && !IANAZone.isValidZone(cmd.timezone)) {
      throw new DomainError('INVALID_TIMEZONE', 422, `Unknown IANA time zone: ${cmd.timezone}`);
    }
    return this.updateWithAudit('site', 'ORG_SITE_UPDATED', actor, id, cmd, async (tx) => {
      const [row] = await tx.update(sites).set(cmd).where(eq(sites.id, id)).returning();
      return row ?? null;
    });
  }

  async updateOrgUnit(id: string, cmd: UpdateOrgUnitCommand, actor: Actor) {
    const unit = await this.requireOrgUnit(id);
    if (cmd.parentId) {
      if (cmd.parentId === id)
        throw new DomainError('ORG_UNIT_CYCLE', 422, 'A unit cannot be its own parent');
      await this.requireOrgUnit(cmd.parentId, unit.siteId);
    }
    return this.updateWithAudit('org_unit', 'ORG_UNIT_UPDATED', actor, id, cmd, async (tx) => {
      const [row] = await tx.update(orgUnits).set(cmd).where(eq(orgUnits.id, id)).returning();
      return row ?? null;
    });
  }

  async updateTeam(id: string, cmd: UpdateTeamCommand, actor: Actor) {
    if (cmd.orgUnitId) await this.requireOrgUnit(cmd.orgUnitId);
    return this.updateWithAudit('team', 'ORG_TEAM_UPDATED', actor, id, cmd, async (tx) => {
      const [row] = await tx.update(teams).set(cmd).where(eq(teams.id, id)).returning();
      return row ?? null;
    });
  }

  async updatePosition(id: string, cmd: UpdatePositionCommand, actor: Actor) {
    return this.updateWithAudit('position', 'ORG_POSITION_UPDATED', actor, id, cmd, async (tx) => {
      const [row] = await tx.update(positions).set(cmd).where(eq(positions.id, id)).returning();
      return row ?? null;
    });
  }

  async updateZone(id: string, cmd: UpdateZoneCommand, actor: Actor) {
    return this.updateWithAudit('zone', 'ORG_ZONE_UPDATED', actor, id, cmd, async (tx) => {
      const [row] = await tx
        .update(responsibilityZones)
        .set(cmd)
        .where(eq(responsibilityZones.id, id))
        .returning();
      return row ?? null;
    });
  }

  async deleteDirectoryRow(
    kind: 'site' | 'org_unit' | 'team' | 'position' | 'zone',
    id: string,
    reason: string,
    actor: Actor,
  ): Promise<void> {
    const table = {
      site: sites,
      org_unit: orgUnits,
      team: teams,
      position: positions,
      zone: responsibilityZones,
    }[kind];
    try {
      await this.db.transaction(async (tx) => {
        const [deleted] = await tx.delete(table).where(eq(table.id, id)).returning();
        if (!deleted) throw new DomainError('NOT_FOUND', 404, `${kind} ${id} not found`);
        await this.events.append(tx, {
          type: `ORG_${kind.toUpperCase()}_DELETED`,
          source: 'WEB',
          actor,
          comment: reason,
          payload: { id },
        });
        await this.audit.record(tx, {
          actor,
          action: `${kind}.delete`,
          objectType: kind,
          objectId: id,
          before: deleted as unknown as Record<string, unknown>,
          reason,
        });
      });
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        throw new DomainError(
          'DIRECTORY_ROW_IN_USE',
          409,
          `${kind} ${id} is referenced by other records; deactivate or reassign first`,
        );
      }
      throw e;
    }
  }

  private async updateWithAudit<T extends { id: string }>(
    objectType: string,
    eventType: string,
    actor: Actor,
    id: string,
    patch: Record<string, unknown>,
    update: (tx: DbOrTx) => Promise<T | null>,
  ): Promise<T> {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) {
      throw new DomainError('EMPTY_UPDATE', 422, 'Nothing to update');
    }
    try {
      return await this.db.transaction(async (tx) => {
        const row = await update(tx);
        if (!row) throw new DomainError('NOT_FOUND', 404, `${objectType} ${id} not found`);
        await this.events.append(tx, {
          type: eventType,
          source: 'WEB',
          actor,
          payload: { id, ...clean },
        });
        await this.audit.record(tx, {
          actor,
          action: `${objectType}.update`,
          objectType,
          objectId: id,
          after: clean,
        });
        return row;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new DomainError('DUPLICATE_CODE', 409, `${objectType}: a row with this code exists`);
      }
      throw e;
    }
  }

  /** FR-QR-01: a terminal belongs to a site; it gets its device token later, through pairing. */
  async registerTerminal(cmd: RegisterTerminalCommand, actor: Actor): Promise<TerminalRegistered> {
    await this.requireSite(cmd.siteId);
    const row = await this.insertWithAudit(
      'qr_terminal',
      'QR_TERMINAL_REGISTERED',
      actor,
      cmd,
      async (tx) => {
        const [inserted] = await tx.insert(qrTerminals).values(cmd).returning();
        return inserted!;
      },
    );
    return { id: row.id, siteId: row.siteId, name: row.name, checkpoint: row.checkpoint };
  }

  /**
   * A short one-time code the administrator reads from the panel and someone types on the
   * tablet. Issuing a new code voids the previous unused ones for the terminal.
   */
  async issuePairingCode(terminalId: string, actor: Actor): Promise<TerminalPairingIssued> {
    const terminal = await this.requireTerminal(terminalId);
    const code = generatePairingCode();
    const issuedAt = new Date();
    const expiresAt = pairingCodeExpiresAt(issuedAt);
    await this.db.transaction(async (tx) => {
      await tx
        .update(terminalPairingCodes)
        .set({ usedAt: issuedAt })
        .where(
          and(
            eq(terminalPairingCodes.terminalId, terminal.id),
            isNull(terminalPairingCodes.usedAt),
          ),
        );
      await tx.insert(terminalPairingCodes).values({
        terminalId: terminal.id,
        codeHash: hashPairingCode(code),
        expiresAt,
        createdBy: actor.id,
      });
      await this.events.append(tx, {
        type: 'QR_TERMINAL_PAIRING_ISSUED',
        source: 'WEB',
        actor,
        payload: { terminalId: terminal.id, expiresAt: expiresAt.toISOString() },
      });
      await this.audit.record(tx, {
        actor,
        action: 'qr_terminal.pairing.issue',
        objectType: 'qr_terminal',
        objectId: terminal.id,
        after: { expiresAt: expiresAt.toISOString() },
      });
    });
    return {
      terminalId: terminal.id,
      code: formatPairingCode(code),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Disabling stops QR issuance without losing the pairing; enabling restores it. */
  async setTerminalStatus(terminalId: string, cmd: SetTerminalStatusCommand, actor: Actor) {
    const terminal = await this.requireTerminal(terminalId);
    if (terminal.status === cmd.status) return terminal;
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(qrTerminals)
        .set({ status: cmd.status })
        .where(eq(qrTerminals.id, terminal.id))
        .returning();
      await this.events.append(tx, {
        type: cmd.status === 'ACTIVE' ? 'QR_TERMINAL_ENABLED' : 'QR_TERMINAL_DISABLED',
        source: 'WEB',
        actor,
        comment: cmd.reason,
        payload: { terminalId: terminal.id },
      });
      await this.audit.record(tx, {
        actor,
        action: `qr_terminal.${cmd.status.toLowerCase()}`,
        objectType: 'qr_terminal',
        objectId: terminal.id,
        before: { status: terminal.status },
        after: { status: cmd.status },
        reason: cmd.reason,
      });
      return updated!;
    });
  }

  async updateTerminal(terminalId: string, cmd: UpdateTerminalCommand, actor: Actor) {
    const terminal = await this.requireTerminal(terminalId);
    if (cmd.siteId) await this.requireSite(cmd.siteId);
    const patch = {
      ...(cmd.siteId ? { siteId: cmd.siteId } : {}),
      ...(cmd.name ? { name: cmd.name } : {}),
      ...(cmd.checkpoint ? { checkpoint: cmd.checkpoint } : {}),
    };
    if (Object.keys(patch).length === 0) return terminal;
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(qrTerminals)
        .set(patch)
        .where(eq(qrTerminals.id, terminal.id))
        .returning();
      await this.events.append(tx, {
        type: 'QR_TERMINAL_UPDATED',
        source: 'WEB',
        actor,
        payload: { terminalId: terminal.id, ...patch },
      });
      await this.audit.record(tx, {
        actor,
        action: 'qr_terminal.update',
        objectType: 'qr_terminal',
        objectId: terminal.id,
        before: { siteId: terminal.siteId, name: terminal.name, checkpoint: terminal.checkpoint },
        after: patch,
      });
      return updated!;
    });
  }

  /**
   * Hard delete is allowed only while nothing refers to the terminal; once check-ins exist the
   * row is history and the caller is told to disable it instead.
   */
  async deleteTerminal(terminalId: string, reason: string, actor: Actor): Promise<void> {
    const terminal = await this.requireTerminal(terminalId);
    try {
      await this.db.transaction(async (tx) => {
        await this.events.append(tx, {
          type: 'QR_TERMINAL_DELETED',
          source: 'WEB',
          actor,
          comment: reason,
          payload: { terminalId: terminal.id, name: terminal.name },
        });
        await this.audit.record(tx, {
          actor,
          action: 'qr_terminal.delete',
          objectType: 'qr_terminal',
          objectId: terminal.id,
          before: { siteId: terminal.siteId, name: terminal.name, checkpoint: terminal.checkpoint },
          reason,
        });
        await tx.delete(qrTerminals).where(eq(qrTerminals.id, terminal.id));
      });
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        throw new DomainError(
          'TERMINAL_HAS_HISTORY',
          409,
          `Terminal ${terminalId} has check-in history; disable it instead of deleting`,
        );
      }
      throw e;
    }
  }

  private async requireTerminal(id: string) {
    const [row] = await this.db.select().from(qrTerminals).where(eq(qrTerminals.id, id)).limit(1);
    if (!row) throw new DomainError('TERMINAL_NOT_FOUND', 404, `Terminal ${id} not found`);
    return row;
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
      terminals: term.map(
        ({ id, siteId, name, checkpoint, status, deviceTokenHash, lastSeenAt }) => ({
          id,
          siteId,
          name,
          checkpoint,
          status,
          paired: deviceTokenHash !== null,
          lastSeenAt: lastSeenAt?.toISOString() ?? null,
        }),
      ),
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
