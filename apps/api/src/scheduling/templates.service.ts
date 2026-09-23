import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
  or,
  openSlots,
  scheduleVersions,
  schedulePatterns,
  shiftAssignments,
  shiftTemplates,
  sites,
  sql,
  zoneStaffingRequirements,
  type Database,
  type DbOrTx,
  type Transaction,
} from '@vakhta/db';
import {
  AssignmentStatusSchema,
  ScheduleStatusSchema,
  type CreateShiftTemplateCommand,
  type CreateUnitShiftCommand,
  type ShiftTemplateView,
  type ShiftTemplatesQuery,
  type UpdateUnitShiftCommand,
} from '@vakhta/contracts';
import {
  ShiftTemplateError,
  ShiftTemplateEvent,
  WebRole,
  businessDateOf,
  canActOn,
} from '@vakhta/domain';
import type { Actor } from '../common/actor.js';
import { webUserActor, type WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { OrgService } from '../org/org.service.js';

export type TemplateRecord = typeof shiftTemplates.$inferSelect;
type UnitShiftFields = Pick<CreateUnitShiftCommand, 'name' | 'period' | 'localStart' | 'localEnd'>;
interface TemplateChange {
  readonly type: ShiftTemplateEvent;
  readonly before: TemplateRecord | null;
  readonly after: TemplateRecord | null;
}

/**
 * Shift templates (spec 013): site defaults and unit shifts. Hours of a template that assignments
 * or open slots already use never change; an hours edit retires that version and inserts its
 * replacement, so planned shifts keep the hours they were planned with.
 */
@Injectable()
export class TemplatesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly org: OrgService,
  ) {}

  async list(query: ShiftTemplatesQuery): Promise<ShiftTemplateView[]> {
    const unitScope = query.orgUnitId
      ? or(isNull(shiftTemplates.orgUnitId), eq(shiftTemplates.orgUnitId, query.orgUnitId))
      : undefined;
    const retiredScope = query.includeRetired ? undefined : isNull(shiftTemplates.retiredAt);
    const rows = await this.db
      .select()
      .from(shiftTemplates)
      .where(and(eq(shiftTemplates.siteId, query.siteId), unitScope, retiredScope))
      .orderBy(asc(shiftTemplates.code));
    const used = await this.plannedCounts(rows.map((row) => row.id));
    return rows.map((row) => this.toView(row, used.get(row.id) ?? 0));
  }

  /** Every template of the site, current and retired, keyed by id. */
  async bySite(siteId: string, tx: DbOrTx = this.db): Promise<Map<string, TemplateRecord>> {
    const rows = await tx.select().from(shiftTemplates).where(eq(shiftTemplates.siteId, siteId));
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** A site default; unit shifts are created through {@link createForUnit}. */
  async create(cmd: CreateShiftTemplateCommand, actor: Actor): Promise<ShiftTemplateView> {
    await this.org.requireSite(cmd.siteId);
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(shiftTemplates).values(cmd).returning();
        if (!row) throw new Error('shift_templates: insert returned no row');
        await this.record(tx, actor, {
          type: ShiftTemplateEvent.CREATED,
          after: row,
          before: null,
        });
        return this.toView(row, 0);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError('CODE_TAKEN', 409, `Template ${cmd.code} already exists on the site`);
      }
      throw error;
    }
  }

  async createForUnit(
    orgUnitId: string,
    cmd: CreateUnitShiftCommand,
    user: WebUser,
  ): Promise<ShiftTemplateView> {
    return this.write(async (tx) => {
      const unit = await this.org.requireOrgUnit(orgUnitId, undefined, tx);
      this.assertScope(user, unit.siteId, unit.id);
      const row = await this.insertUnitShift(tx, { siteId: unit.siteId, orgUnitId: unit.id }, cmd);
      await this.record(tx, webUserActor(user), {
        type: ShiftTemplateEvent.CREATED,
        after: row,
        before: null,
      });
      return this.toView(row, 0);
    });
  }

  async update(id: string, cmd: UpdateUnitShiftCommand, user: WebUser): Promise<ShiftTemplateView> {
    return this.write(async (tx) => {
      const current = await this.lockUnitShift(tx, { id, revision: cmd.revision }, user);
      const hoursChanged =
        current.localStart !== cmd.localStart ||
        current.localEnd !== cmd.localEnd ||
        current.period !== cmd.period;
      const actor = webUserActor(user);
      if (hoursChanged && (await this.isReferenced(tx, id))) {
        const next = await this.replace(tx, current, cmd);
        await this.record(tx, actor, {
          type: ShiftTemplateEvent.REPLACED,
          after: next,
          before: current,
        });
        return this.toView(next, 0);
      }
      const [row] = await tx
        .update(shiftTemplates)
        .set({ ...fields(cmd), revision: current.revision + 1, updatedAt: new Date() })
        .where(eq(shiftTemplates.id, id))
        .returning();
      if (!row) throw new Error('shift_templates: update returned no row');
      await this.record(tx, actor, {
        type: ShiftTemplateEvent.RENAMED,
        after: row,
        before: current,
      });
      const used = await this.plannedCounts([id], tx);
      return this.toView(row, used.get(id) ?? 0);
    });
  }

  /** Deletes an unused shift; a used one is retired and stays readable in planned history. */
  async remove(id: string, revision: number, user: WebUser): Promise<void> {
    await this.write(async (tx) => {
      const current = await this.lockUnitShift(tx, { id, revision }, user);
      const actor = webUserActor(user);
      if (await this.isReferenced(tx, id)) {
        const [retired] = await tx
          .update(shiftTemplates)
          .set(retirement(current))
          .where(eq(shiftTemplates.id, id))
          .returning();
        if (!retired) throw new Error('shift_templates: retire returned no row');
        await this.endRequirements(tx, current);
        await this.record(tx, actor, {
          type: ShiftTemplateEvent.RETIRED,
          after: retired,
          before: current,
        });
        return;
      }
      await tx.delete(zoneStaffingRequirements).where(eq(zoneStaffingRequirements.templateId, id));
      await tx.delete(shiftTemplates).where(eq(shiftTemplates.id, id));
      await this.record(tx, actor, {
        type: ShiftTemplateEvent.DELETED,
        after: null,
        before: current,
      });
    });
  }

  toView(row: TemplateRecord, usedCount: number): ShiftTemplateView {
    return {
      id: row.id,
      siteId: row.siteId,
      orgUnitId: row.orgUnitId,
      code: row.code,
      name: row.name,
      localStart: row.localStart,
      localEnd: row.localEnd,
      period: row.period,
      isActive: row.isActive,
      revision: row.revision,
      retiredAt: row.retiredAt?.toISOString() ?? null,
      replacedById: row.replacedById,
      usedCount,
    };
  }

  private async write<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(work);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError(
          ShiftTemplateError.NAME_TAKEN,
          409,
          'The unit already has a current shift with this name',
        );
      }
      throw error;
    }
  }

  private assertScope(user: WebUser, siteId: string, orgUnitId: string): void {
    if (!canActOn(user.grants, [WebRole.ADMIN], { siteId, orgUnitId })) {
      throw new DomainError('OUT_OF_SCOPE', 403, 'Unit outside administrator scope');
    }
  }

  /** The current version of a unit shift, locked, at the revision the client edited. */
  private async lockUnitShift(
    tx: Transaction,
    target: { readonly id: string; readonly revision: number },
    user: WebUser,
  ): Promise<TemplateRecord & { orgUnitId: string }> {
    const { id, revision } = target;
    const [row] = await tx
      .select()
      .from(shiftTemplates)
      .where(eq(shiftTemplates.id, id))
      .for('update');
    if (!row) throw new DomainError(ShiftTemplateError.NOT_FOUND, 404, `Shift ${id} not found`);
    const { orgUnitId } = row;
    if (orgUnitId === null) {
      throw new DomainError(ShiftTemplateError.DEFAULT, 409, 'Site defaults are not unit shifts');
    }
    this.assertScope(user, row.siteId, orgUnitId);
    if (row.retiredAt) {
      throw new DomainError(ShiftTemplateError.RETIRED, 409, `Shift ${id} is retired`);
    }
    if (row.revision !== revision) {
      throw new DomainError(
        ShiftTemplateError.STALE,
        409,
        `Shift ${id} changed since revision ${revision}`,
      );
    }
    return { ...row, orgUnitId };
  }

  private async insertUnitShift(
    tx: Transaction,
    unit: { readonly siteId: string; readonly orgUnitId: string },
    cmd: UnitShiftFields,
  ): Promise<TemplateRecord> {
    const id = randomUUID();
    const { siteId, orgUnitId } = unit;
    const [row] = await tx
      .insert(shiftTemplates)
      .values({ id, siteId, orgUnitId, code: unitShiftCode(id), ...fields(cmd) })
      .returning();
    if (!row) throw new Error('shift_templates: insert returned no row');
    return row;
  }

  /** Retires the used version and inserts its successor; forward-looking settings follow. */
  private async replace(
    tx: Transaction,
    current: TemplateRecord & { orgUnitId: string },
    cmd: UnitShiftFields,
  ): Promise<TemplateRecord> {
    // Retire first: the unit's current names are unique, and the successor keeps the name.
    await tx
      .update(shiftTemplates)
      .set(retirement(current))
      .where(eq(shiftTemplates.id, current.id));
    const next = await this.insertUnitShift(tx, current, cmd);
    await tx
      .update(shiftTemplates)
      .set({ replacedById: next.id })
      .where(eq(shiftTemplates.id, current.id));
    await this.carryRequirements(tx, current, next.id);
    await tx
      .update(schedulePatterns)
      .set({
        definition: sql`jsonb_set(${schedulePatterns.definition}, '{templateId}', to_jsonb(${next.id}::text))`,
      })
      .where(
        and(
          eq(schedulePatterns.siteId, current.siteId),
          sql`${schedulePatterns.definition}->>'templateId' = ${current.id}`,
        ),
      );
    return next;
  }

  /**
   * Staffing demand is forward-looking: from today on it applies to the new version, while the
   * past keeps pointing at the version its assignments were planned with.
   */
  private async carryRequirements(
    tx: Transaction,
    current: TemplateRecord,
    nextId: string,
  ): Promise<void> {
    const today = await this.siteToday(tx, current.siteId);
    const ofTemplate = eq(zoneStaffingRequirements.templateId, current.id);
    const running = and(
      ofTemplate,
      sql`${zoneStaffingRequirements.effectiveFrom} < ${today}::date`,
      or(
        isNull(zoneStaffingRequirements.effectiveTo),
        sql`${zoneStaffingRequirements.effectiveTo} >= ${today}::date`,
      ),
    );
    const continued = await tx.select().from(zoneStaffingRequirements).where(running);
    if (continued.length > 0) {
      await tx
        .update(zoneStaffingRequirements)
        .set({ effectiveTo: sql`${today}::date - 1`, updatedAt: new Date() })
        .where(running);
      await tx.insert(zoneStaffingRequirements).values(
        continued.map((requirement) => ({
          zoneId: requirement.zoneId,
          templateId: nextId,
          requiredCount: requirement.requiredCount,
          qualificationId: requirement.qualificationId,
          effectiveFrom: today,
          effectiveTo: requirement.effectiveTo,
          note: requirement.note,
          createdBy: requirement.createdBy,
        })),
      );
    }
    await tx
      .update(zoneStaffingRequirements)
      .set({ templateId: nextId, updatedAt: new Date() })
      .where(and(ofTemplate, sql`${zoneStaffingRequirements.effectiveFrom} >= ${today}::date`));
  }

  /** A deleted shift is not staffed any more: demand ends today, future demand is dropped. */
  private async endRequirements(tx: Transaction, current: TemplateRecord): Promise<void> {
    const today = await this.siteToday(tx, current.siteId);
    const ofTemplate = eq(zoneStaffingRequirements.templateId, current.id);
    await tx
      .delete(zoneStaffingRequirements)
      .where(and(ofTemplate, sql`${zoneStaffingRequirements.effectiveFrom} > ${today}::date`));
    await tx
      .update(zoneStaffingRequirements)
      .set({ effectiveTo: today, updatedAt: new Date() })
      .where(
        and(
          ofTemplate,
          or(
            isNull(zoneStaffingRequirements.effectiveTo),
            gt(zoneStaffingRequirements.effectiveTo, today),
          ),
        ),
      );
  }

  private async siteToday(tx: Transaction, siteId: string): Promise<string> {
    const [site] = await tx
      .select({ timezone: sites.timezone })
      .from(sites)
      .where(eq(sites.id, siteId));
    if (!site) throw new DomainError('SITE_NOT_FOUND', 404, `Site ${siteId} not found`);
    return businessDateOf(new Date(), site.timezone);
  }

  /**
   * Whether any assignment or open slot was planned with this version, or it succeeded an earlier
   * version: a successor stays so the chain from planned history to the current shift holds.
   */
  private async isReferenced(tx: Transaction, id: string): Promise<boolean> {
    const [row] = await tx.execute<{ used: boolean }>(sql`
      select exists(select 1 from ${shiftAssignments} where ${shiftAssignments.templateId} = ${id})
          or exists(select 1 from ${openSlots} where ${openSlots.templateId} = ${id})
          or exists(select 1 from ${shiftTemplates} where ${shiftTemplates.replacedById} = ${id})
          as used`);
    return row?.used === true;
  }

  /** Planned person-days per template across current versions (a draft and its source count once). */
  private async plannedCounts(ids: readonly string[], tx: DbOrTx = this.db) {
    if (ids.length === 0) return new Map<string, number>();
    const rows = await tx
      .select({
        templateId: shiftAssignments.templateId,
        count: sql<number>`count(distinct (${shiftAssignments.employeeId}, ${shiftAssignments.businessDate}))::int`,
      })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
      .where(
        and(
          inArray(shiftAssignments.templateId, [...ids]),
          eq(shiftAssignments.status, AssignmentStatusSchema.enum.PLANNED),
          ne(scheduleVersions.status, ScheduleStatusSchema.enum.SUPERSEDED),
        ),
      )
      .groupBy(shiftAssignments.templateId);
    return new Map(rows.map((row) => [row.templateId, row.count]));
  }

  private async record(tx: Transaction, actor: Actor, change: TemplateChange): Promise<void> {
    const { type, before, after } = change;
    const subject = after ?? before;
    if (!subject) throw new Error('shift template event needs a subject');
    await this.events.append(tx, {
      type,
      source: 'WEB',
      actor,
      payload: { id: subject.id, before: snapshot(before), after: snapshot(after) },
    });
    await this.audit.record(tx, {
      actor,
      action: AUDIT_ACTIONS[type],
      objectType: 'shift_template',
      objectId: subject.id,
      before: snapshot(before),
      after: snapshot(after),
    });
  }
}

const AUDIT_ACTIONS: Record<ShiftTemplateEvent, string> = {
  [ShiftTemplateEvent.CREATED]: 'shift_template.create',
  [ShiftTemplateEvent.RENAMED]: 'shift_template.update',
  [ShiftTemplateEvent.REPLACED]: 'shift_template.replace',
  [ShiftTemplateEvent.RETIRED]: 'shift_template.retire',
  [ShiftTemplateEvent.DELETED]: 'shift_template.delete',
};

/** Internal identity of a unit shift; never shown. */
function unitShiftCode(id: string): string {
  return `U_${id.replaceAll('-', '').toUpperCase()}`;
}

function fields(cmd: UnitShiftFields) {
  return {
    name: cmd.name,
    period: cmd.period,
    localStart: cmd.localStart,
    localEnd: cmd.localEnd,
  };
}

function retirement(current: TemplateRecord) {
  const now = new Date();
  return { isActive: false, retiredAt: now, revision: current.revision + 1, updatedAt: now };
}

function snapshot(row: TemplateRecord | null) {
  if (!row) return null;
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    name: row.name,
    period: row.period,
    localStart: row.localStart,
    localEnd: row.localEnd,
    isActive: row.isActive,
    replacedById: row.replacedById,
  };
}
