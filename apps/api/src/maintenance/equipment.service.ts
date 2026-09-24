import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  domainEvents,
  eq,
  equipment,
  equipmentStopEpisodes,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  orgUnits,
  responsibilityZones,
  sites,
  sql,
  workOrders,
  type Database,
  type SQL,
  type Transaction,
} from '@vakhta/db';
import type {
  EquipmentDetail,
  EquipmentInput,
  EquipmentQuery,
  EquipmentRow,
  EquipmentUpdate,
  MechanicOption,
  NextMaintenanceView,
  WorkHistoryItem,
} from '@vakhta/contracts';
import {
  FINAL_WORK_STATUSES,
  WorkType,
  businessDateOf,
  isOverdue,
  type AccessScope,
  type ScopeTarget,
} from '@vakhta/domain';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { textOrNull } from '../common/text.js';
import { placeTarget, scopeCondition } from '../common/access-scope.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import {
  assertMechanics,
  linkedEmployees,
  maintenanceStaff,
  peopleById,
  person,
} from './lookups.js';
import { DocumentsService } from './documents.service.js';
import { PlansService } from './plans.service.js';

type EquipmentDb = typeof equipment.$inferSelect;
interface Located {
  readonly row: EquipmentDb;
  readonly unitName: string;
  readonly zoneName: string | null;
  readonly timezone: string;
}

const FINAL = [...FINAL_WORK_STATUSES];

function codeKey(code: string): string {
  return code.trim().toLowerCase();
}

function passport(input: EquipmentInput) {
  return {
    code: input.code.trim(),
    codeKey: codeKey(input.code),
    name: input.name,
    orgUnitId: input.orgUnitId,
    zoneId: input.zoneId ?? null,
    equipmentType: textOrNull(input.equipmentType),
    manufacturer: textOrNull(input.manufacturer),
    model: textOrNull(input.model),
    serialNumber: textOrNull(input.serialNumber),
    manufacturedYear: input.manufacturedYear ?? null,
    commissionedOn: input.commissionedOn ?? null,
    criticality: input.criticality,
    responsibleEmployeeId: input.responsibleEmployeeId,
    backupEmployeeId: input.backupEmployeeId ?? null,
    notes: textOrNull(input.notes),
  };
}

/** Machine register (spec 014, US1): the list, the card, and passport changes with audit. */
@Injectable()
export class EquipmentService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
    private readonly events: EventStore,
    private readonly documents: DocumentsService,
    private readonly plans: PlansService,
  ) {}

  /** Where a machine stands, for scope checks; null when it does not exist. */
  async place(id: string): Promise<ScopeTarget | null> {
    const [row] = await this.db
      .select({
        siteId: equipment.siteId,
        orgUnitId: equipment.orgUnitId,
        zoneId: equipment.zoneId,
      })
      .from(equipment)
      .where(eq(equipment.id, id));
    return row ? placeTarget(row) : null;
  }

  private located(where: SQL | undefined) {
    return this.db
      .select({
        row: equipment,
        unitName: orgUnits.name,
        zoneName: responsibilityZones.name,
        timezone: sites.timezone,
      })
      .from(equipment)
      .innerJoin(orgUnits, eq(orgUnits.id, equipment.orgUnitId))
      .innerJoin(sites, eq(sites.id, equipment.siteId))
      .leftJoin(responsibilityZones, eq(responsibilityZones.id, equipment.zoneId))
      .where(where)
      .orderBy(asc(equipment.code));
  }

  async list(query: EquipmentQuery, scope: AccessScope, now: Date): Promise<EquipmentRow[]> {
    const conditions = [
      scopeCondition(scope, {
        site: equipment.siteId,
        unit: equipment.orgUnitId,
        zone: equipment.zoneId,
      }),
      query.archived ? isNotNull(equipment.archivedAt) : isNull(equipment.archivedAt),
      query.unitId ? eq(equipment.orgUnitId, query.unitId) : undefined,
      query.state ? eq(equipment.state, query.state) : undefined,
      query.q ? this.search(query.q) : undefined,
    ];
    const rows = await this.located(and(...conditions));
    return this.rows(rows, now);
  }

  private search(q: string): SQL | undefined {
    const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const staff = sql`exists (select 1 from employees e where e.id in (${equipment.responsibleEmployeeId}, ${equipment.backupEmployeeId}) and e.full_name ilike ${pattern})`;
    return or(
      ilike(equipment.code, pattern),
      ilike(equipment.name, pattern),
      ilike(equipment.model, pattern),
      staff,
    );
  }

  private async rows(rows: readonly Located[], now: Date): Promise<EquipmentRow[]> {
    const ids = rows.map((r) => r.row.id);
    const [next, emergencies, people] = await Promise.all([
      this.nextMaintenance(ids),
      this.openEmergencies(ids),
      peopleById(
        this.db,
        rows.flatMap((r) => [r.row.responsibleEmployeeId, r.row.backupEmployeeId]),
      ),
    ]);
    return rows.map((located) => {
      const today = businessDateOf(now, located.timezone);
      const { row } = located;
      const upcoming = next.get(row.id);
      const nextMaintenance: NextMaintenanceView | null = upcoming
        ? { ...upcoming, overdue: isOverdue(upcoming.dueOn, today, upcoming.status) }
        : null;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        equipmentType: row.equipmentType,
        model: row.model,
        siteId: row.siteId,
        orgUnitId: row.orgUnitId,
        unitName: located.unitName,
        zoneId: row.zoneId,
        zoneName: located.zoneName,
        state: row.state,
        stateChangedAt: row.stateChangedAt.toISOString(),
        restriction: row.restriction,
        criticality: row.criticality,
        responsible: person(people, row.responsibleEmployeeId),
        backup: row.backupEmployeeId ? person(people, row.backupEmployeeId) : null,
        nextMaintenance,
        activeEmergency: emergencies.get(row.id) ?? null,
        archivedAt: row.archivedAt?.toISOString() ?? null,
        version: row.version,
      };
    });
  }

  /** The earliest open planned maintenance per machine, in one query. */
  private async nextMaintenance(ids: readonly string[]) {
    const result = new Map<
      string,
      Omit<NextMaintenanceView, 'overdue'> & { status: (typeof workOrders.$inferSelect)['status'] }
    >();
    if (!ids.length) return result;
    const rows = await this.db
      .selectDistinctOn([workOrders.equipmentId], {
        equipmentId: workOrders.equipmentId,
        workOrderId: workOrders.id,
        title: workOrders.title,
        dueOn: workOrders.dueOn,
        plannedOn: workOrders.plannedOn,
        readiness: workOrders.readiness,
        status: workOrders.status,
      })
      .from(workOrders)
      .where(
        and(
          inArray(workOrders.equipmentId, [...ids]),
          eq(workOrders.type, WorkType.PLANNED_MAINTENANCE),
          notInArray(workOrders.status, FINAL),
        ),
      )
      .orderBy(workOrders.equipmentId, asc(workOrders.plannedOn));
    for (const row of rows) {
      if (!row.dueOn || !row.plannedOn) continue;
      result.set(row.equipmentId, { ...row, dueOn: row.dueOn, plannedOn: row.plannedOn });
    }
    return result;
  }

  private async openEmergencies(ids: readonly string[]) {
    if (!ids.length) return new Map<string, { workOrderId: string; number: number }>();
    const rows = await this.db
      .select({
        equipmentId: workOrders.equipmentId,
        workOrderId: workOrders.id,
        number: workOrders.number,
      })
      .from(workOrders)
      .where(
        and(
          inArray(workOrders.equipmentId, [...ids]),
          eq(workOrders.type, WorkType.EMERGENCY_REPAIR),
          notInArray(workOrders.status, FINAL),
        ),
      );
    return new Map(rows.map((row) => [row.equipmentId, row]));
  }

  async detail(id: string, now: Date): Promise<EquipmentDetail> {
    const [located] = await this.located(eq(equipment.id, id));
    if (!located) throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
    const [row] = await this.rows([located], now);
    if (!row) throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
    const [documents, plans, stop, history] = await Promise.all([
      this.documents.forEquipment(id),
      this.plans.forEquipment(id),
      this.openStop(id),
      this.history(id),
    ]);
    const source = located.row;
    return {
      ...row,
      manufacturer: source.manufacturer,
      serialNumber: source.serialNumber,
      manufacturedYear: source.manufacturedYear,
      commissionedOn: source.commissionedOn,
      notes: source.notes,
      documents,
      plans,
      openStop: stop ? { startedAt: stop.startedAt.toISOString() } : null,
      history,
    };
  }

  private async openStop(id: string) {
    const [stop] = await this.db
      .select({ startedAt: equipmentStopEpisodes.startedAt })
      .from(equipmentStopEpisodes)
      .where(
        and(eq(equipmentStopEpisodes.equipmentId, id), isNull(equipmentStopEpisodes.releasedAt)),
      );
    return stop ?? null;
  }

  /** The machine's events, newest first; the payload carries the machine id. */
  private async history(id: string): Promise<WorkHistoryItem[]> {
    const rows = await this.db
      .select({
        at: domainEvents.occurredAt,
        type: domainEvents.type,
        actor: domainEvents.actorId,
        comment: domainEvents.comment,
      })
      .from(domainEvents)
      .where(sql`${domainEvents.payload}->>'equipmentId' = ${id}`)
      .orderBy(desc(domainEvents.occurredAt))
      .limit(50);
    return rows.map((row) => ({ ...row, at: row.at.toISOString() }));
  }

  async mechanics(): Promise<MechanicOption[]> {
    const staff = await maintenanceStaff(this.db);
    const linked = await linkedEmployees(
      this.db,
      staff.map((row) => row.id),
    );
    return staff
      .map((row) => ({ ...row, telegramLinked: linked.has(row.id) }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  private async assertPlace(tx: Transaction, input: EquipmentInput): Promise<string> {
    const [unit] = await tx
      .select({ siteId: orgUnits.siteId })
      .from(orgUnits)
      .where(eq(orgUnits.id, input.orgUnitId));
    if (!unit) throw new DomainError('UNIT_NOT_FOUND', 422, 'Unit not found');
    if (!input.zoneId) return unit.siteId;
    const [zone] = await tx
      .select({ orgUnitId: responsibilityZones.orgUnitId })
      .from(responsibilityZones)
      .where(eq(responsibilityZones.id, input.zoneId));
    if (zone?.orgUnitId !== input.orgUnitId)
      throw new DomainError('ZONE_NOT_IN_UNIT', 422, 'Zone does not belong to the unit');
    return unit.siteId;
  }

  private async assertCodeFree(tx: Transaction, code: string, exceptId?: string) {
    const [taken] = await tx
      .select({ id: equipment.id })
      .from(equipment)
      .where(eq(equipment.codeKey, codeKey(code)));
    if (taken && taken.id !== exceptId)
      throw new DomainError('EQUIPMENT_CODE_TAKEN', 409, 'Equipment code is already used');
  }

  async create(
    input: EquipmentInput,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const siteId = await this.assertPlace(tx, input);
      await this.assertCodeFree(tx, input.code);
      await assertMechanics(tx, [input.responsibleEmployeeId, input.backupEmployeeId]);
      const [row] = await tx
        .insert(equipment)
        .values({ ...passport(input), siteId, stateChangedAt: now, createdAt: now, updatedAt: now })
        .returning();
      if (!row) throw new Error('equipment: insert returned no row');
      await this.audit.record(tx, {
        actor,
        action: 'equipment.create',
        objectType: 'equipment',
        objectId: row.id,
        after: passport(input),
      });
      await this.events.append(tx, {
        type: 'EQUIPMENT_CREATED',
        source: 'WEB',
        actor,
        occurredAt: now,
        payload: { equipmentId: row.id, code: row.code },
      });
      return { id: row.id };
    });
  }

  private async lockOrFail(tx: Transaction, id: string): Promise<EquipmentDb> {
    const [row] = await tx.select().from(equipment).where(eq(equipment.id, id)).for('update');
    if (!row) throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
    return row;
  }

  async update(id: string, input: EquipmentUpdate, actor: Actor) {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const before = await this.lockOrFail(tx, id);
      if (before.version !== input.expectedVersion)
        throw new DomainError('EQUIPMENT_VERSION_CONFLICT', 409, 'Equipment has changed');
      const siteId = await this.assertPlace(tx, input);
      await this.assertCodeFree(tx, input.code, id);
      await assertMechanics(tx, [input.responsibleEmployeeId, input.backupEmployeeId]);
      await tx
        .update(equipment)
        .set({ ...passport(input), siteId, version: before.version + 1, updatedAt: now })
        .where(eq(equipment.id, id));
      const mechanicChanged = before.responsibleEmployeeId !== input.responsibleEmployeeId;
      if (mechanicChanged && input.reassignOpenWork)
        await this.plans.reassignOpenWorkWithin(tx, {
          equipmentId: id,
          employeeId: input.responsibleEmployeeId,
          actor,
          now,
        });
      await this.audit.record(tx, {
        actor,
        action: 'equipment.update',
        objectType: 'equipment',
        objectId: id,
        before: { ...before, stateChangedAt: before.stateChangedAt.toISOString() },
        after: passport(input),
      });
      return { id };
    });
  }

  async archive(id: string, reason: string, actor: Actor) {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const row = await this.lockOrFail(tx, id);
      const [open] = await tx
        .select({ id: workOrders.id })
        .from(workOrders)
        .where(and(eq(workOrders.equipmentId, id), notInArray(workOrders.status, FINAL)))
        .limit(1);
      const stop = await this.openStopWithin(tx, id);
      if (open || stop)
        throw new DomainError('EQUIPMENT_HAS_OPEN_WORK', 409, 'Equipment has open work or a stop');
      await tx
        .update(equipment)
        .set({ archivedAt: now, version: row.version + 1, updatedAt: now })
        .where(eq(equipment.id, id));
      await this.audit.record(tx, {
        actor,
        action: 'equipment.archive',
        objectType: 'equipment',
        objectId: id,
        reason,
      });
      return { id };
    });
  }

  private async openStopWithin(tx: Transaction, id: string) {
    const [stop] = await tx
      .select({ id: equipmentStopEpisodes.id })
      .from(equipmentStopEpisodes)
      .where(
        and(eq(equipmentStopEpisodes.equipmentId, id), isNull(equipmentStopEpisodes.releasedAt)),
      );
    return stop ?? null;
  }
}
