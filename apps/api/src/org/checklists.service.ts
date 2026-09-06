import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  checklistDefinitions,
  desc,
  eq,
  handoverRecords,
  inArray,
  positions,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { checklistItemKey, itemKind, type ChecklistItemDefinition } from '@vakhta/domain';
import type {
  ChecklistDefinitionView,
  SaveChecklistCommand,
  SetChecklistStatusCommand,
} from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { isForeignKeyViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { OrgService } from './org.service.js';

type DefinitionRow = typeof checklistDefinitions.$inferSelect;

/**
 * Checklists the admin builds for the zone handover (spec 5.6, FR-CLN-03): one per position and
 * zone type, versioned. Editing writes a new version and retires the previous one, so a submitted
 * report always points at the exact items it was answered against.
 */
@Injectable()
export class ChecklistsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly org: OrgService,
  ) {}

  /** The current (latest) version of every checklist, active or not, by name. */
  async list(): Promise<ChecklistDefinitionView[]> {
    const rows = await this.query(this.db).orderBy(desc(checklistDefinitions.version));
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latest.has(row.d.familyId)) latest.set(row.d.familyId, row);
    }
    return [...latest.values()]
      .map((row) => toView(row.d, row.positionName, row.handovers))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(cmd: SaveChecklistCommand, actor: Actor): Promise<ChecklistDefinitionView> {
    if (cmd.positionId) await this.org.requirePosition(cmd.positionId);
    const items = toItems(cmd);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(checklistDefinitions)
        .values({
          name: cmd.name,
          version: 1,
          positionId: cmd.positionId ?? null,
          zoneType: cmd.zoneType ?? null,
          items,
          isActive: true,
        })
        .returning();
      if (!row) throw new Error('checklist_definitions: insert returned no row');
      await this.events.append(tx, {
        type: 'CHECKLIST_CREATED',
        source: 'WEB',
        actor,
        checklistVersionId: row.id,
        payload: { checklistId: row.id, familyId: row.familyId, name: row.name },
      });
      await this.audit.record(tx, {
        actor,
        action: 'checklist.create',
        objectType: 'checklist',
        objectId: row.id,
        after: summary(row),
      });
      return this.view(tx, row.id);
    });
  }

  /** A new version in the same family; the previous version stops being offered. */
  async update(
    id: string,
    cmd: SaveChecklistCommand,
    actor: Actor,
  ): Promise<ChecklistDefinitionView> {
    const current = await this.requireLatest(id);
    if (cmd.positionId) await this.org.requirePosition(cmd.positionId);
    const items = toItems(cmd);
    return this.db.transaction(async (tx) => {
      await tx
        .update(checklistDefinitions)
        .set({ isActive: false })
        .where(eq(checklistDefinitions.familyId, current.familyId));
      const [row] = await tx
        .insert(checklistDefinitions)
        .values({
          familyId: current.familyId,
          name: cmd.name,
          version: current.version + 1,
          positionId: cmd.positionId ?? null,
          zoneType: cmd.zoneType ?? null,
          items,
          isActive: current.isActive,
        })
        .returning();
      if (!row) throw new Error('checklist_definitions: insert returned no row');
      await this.events.append(tx, {
        type: 'CHECKLIST_VERSION_CREATED',
        source: 'WEB',
        actor,
        checklistVersionId: row.id,
        payload: {
          checklistId: row.id,
          familyId: row.familyId,
          version: row.version,
          supersedes: current.id,
        },
      });
      await this.audit.record(tx, {
        actor,
        action: 'checklist.update',
        objectType: 'checklist',
        objectId: row.id,
        before: summary(current),
        after: summary(row),
      });
      return this.view(tx, row.id);
    });
  }

  async setStatus(
    id: string,
    cmd: SetChecklistStatusCommand,
    actor: Actor,
  ): Promise<ChecklistDefinitionView> {
    const current = await this.requireLatest(id);
    if (current.isActive === cmd.isActive) return this.view(this.db, current.id);
    return this.db.transaction(async (tx) => {
      await tx
        .update(checklistDefinitions)
        .set({ isActive: cmd.isActive })
        .where(eq(checklistDefinitions.id, current.id));
      await this.events.append(tx, {
        type: cmd.isActive ? 'CHECKLIST_ENABLED' : 'CHECKLIST_DISABLED',
        source: 'WEB',
        actor,
        comment: cmd.reason ?? null,
        checklistVersionId: current.id,
        payload: { checklistId: current.id, familyId: current.familyId },
      });
      await this.audit.record(tx, {
        actor,
        action: cmd.isActive ? 'checklist.enable' : 'checklist.disable',
        objectType: 'checklist',
        objectId: current.id,
        before: { isActive: current.isActive },
        after: { isActive: cmd.isActive },
        reason: cmd.reason ?? null,
      });
      return this.view(tx, current.id);
    });
  }

  /**
   * Hard delete of every version is allowed only while no handover report refers to any of them;
   * afterwards the checklist is history and the caller is told to disable it instead.
   */
  async delete(id: string, reason: string, actor: Actor): Promise<void> {
    const current = await this.requireLatest(id);
    try {
      await this.db.transaction(async (tx) => {
        await this.events.append(tx, {
          type: 'CHECKLIST_DELETED',
          source: 'WEB',
          actor,
          comment: reason,
          payload: { checklistId: current.id, familyId: current.familyId, name: current.name },
        });
        await this.audit.record(tx, {
          actor,
          action: 'checklist.delete',
          objectType: 'checklist',
          objectId: current.id,
          before: summary(current),
          reason,
        });
        await tx
          .delete(checklistDefinitions)
          .where(eq(checklistDefinitions.familyId, current.familyId));
      });
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        throw new DomainError(
          'CHECKLIST_IN_USE',
          409,
          `Checklist ${id} has handover reports; disable it instead of deleting`,
        );
      }
      throw e;
    }
  }

  private query(tx: DbOrTx) {
    return tx
      .select({
        d: checklistDefinitions,
        positionName: positions.name,
        handovers: sql<number>`(
          SELECT COUNT(*) FROM ${handoverRecords} hr
          JOIN ${checklistDefinitions} cd ON cd.id = hr.checklist_definition_id
          WHERE cd.family_id = ${checklistDefinitions.familyId}
        )`.mapWith(Number),
      })
      .from(checklistDefinitions)
      .leftJoin(positions, eq(checklistDefinitions.positionId, positions.id));
  }

  private async view(tx: DbOrTx, id: string): Promise<ChecklistDefinitionView> {
    const [row] = await this.query(tx).where(eq(checklistDefinitions.id, id)).limit(1);
    if (!row) throw new DomainError('CHECKLIST_NOT_FOUND', 404, `Checklist ${id} not found`);
    return toView(row.d, row.positionName, row.handovers);
  }

  /** The row itself must be the latest version of its family: older versions are read-only. */
  private async requireLatest(id: string): Promise<DefinitionRow> {
    const [row] = await this.db
      .select()
      .from(checklistDefinitions)
      .where(eq(checklistDefinitions.id, id))
      .limit(1);
    if (!row) throw new DomainError('CHECKLIST_NOT_FOUND', 404, `Checklist ${id} not found`);
    const [newer] = await this.db
      .select({ id: checklistDefinitions.id })
      .from(checklistDefinitions)
      .where(
        and(
          eq(checklistDefinitions.familyId, row.familyId),
          sql`${checklistDefinitions.version} > ${row.version}`,
        ),
      )
      .limit(1);
    if (newer) {
      throw new DomainError(
        'CHECKLIST_VERSION_STALE',
        409,
        `Checklist ${id} has a newer version; edit the current one`,
      );
    }
    return row;
  }

  /** Versions of one family, for tests and diagnostics. */
  async versions(familyId: string): Promise<DefinitionRow[]> {
    return this.db
      .select()
      .from(checklistDefinitions)
      .where(inArray(checklistDefinitions.familyId, [familyId]))
      .orderBy(asc(checklistDefinitions.version));
  }
}

function toItems(cmd: SaveChecklistCommand): ChecklistItemDefinition[] {
  return cmd.items.map((item, index) => ({
    key: checklistItemKey(index),
    label: item.label,
    kind: item.kind,
  }));
}

function summary(row: DefinitionRow): Record<string, unknown> {
  return {
    name: row.name,
    version: row.version,
    positionId: row.positionId,
    zoneType: row.zoneType,
    items: row.items.length,
    photos: row.items.filter((i) => itemKind(i) === 'PHOTO').length,
  };
}

function toView(
  row: DefinitionRow,
  positionName: string | null,
  handovers: number,
): ChecklistDefinitionView {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    version: row.version,
    positionId: row.positionId,
    positionName,
    zoneType: row.zoneType,
    items: row.items.map((i) => ({ key: i.key, label: i.label, kind: itemKind(i) })),
    isActive: row.isActive,
    validFrom: row.validFrom.toISOString(),
    createdAt: row.createdAt.toISOString(),
    handovers,
  };
}
