import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  authUser,
  desc,
  domainEvents,
  downtimeIncidents,
  downtimeReports,
  employees,
  eq,
  equipment,
  equipmentStopEpisodes,
  gte,
  inArray,
  lte,
  maintenancePlanMaterials,
  maintenancePlanOperations,
  maintenancePlanVersions,
  maintenancePlans,
  notInArray,
  or,
  reasonCodes,
  sites,
  sql,
  workOrderOperationResults,
  workOrderReviews,
  workOrders,
  type Database,
  type SQL,
} from '@vakhta/db';
import { WorkViewCode } from '@vakhta/contracts';
import type {
  CalendarForecast,
  CalendarItem,
  CalendarQuery,
  MaintenanceCalendarView,
  MaintenanceSummary,
  WorkDetail,
  WorkQuery,
  WorkRow,
} from '@vakhta/contracts';
import {
  FINAL_WORK_STATUSES,
  PlanState,
  WorkStatus,
  WorkType,
  businessDateOf,
  forecastDueDates,
  isOverdue,
  nextCycle,
  type AccessScope,
  type ScopeTarget,
} from '@vakhta/domain';
import { placeTarget, scopeCondition } from '../common/access-scope.js';
import { DomainError } from '../common/domain-error.js';
import { DATABASE } from '../infra/database.module.js';
import { peopleById, person } from './lookups.js';

type OrderRow = typeof workOrders.$inferSelect;
interface Located {
  readonly order: OrderRow;
  readonly code: string;
  readonly name: string;
  readonly timezone: string;
  readonly state: (typeof equipment.$inferSelect)['state'];
}

const FINAL = [...FINAL_WORK_STATUSES];
const QUEUE_LIMIT = 200;

/** Today in the machine's site time zone, as SQL over the joined `sites` row (spec A-5). */
function siteToday(now: Date): SQL {
  return sql`(${now.toISOString()}::timestamptz AT TIME ZONE ${sites.timezone})::date`;
}

/** Where the reported emergency or planned work sits on the calendar. */
function calendarDate(located: Located): string {
  const { order } = located;
  if (order.plannedOn) return order.plannedOn;
  return businessDateOf(order.reportedAt ?? order.createdAt, located.timezone);
}

/** Read side of maintenance work (spec 014, US4, US6, US7): queue, card, calendar and counts. */
@Injectable()
export class WorkQueriesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async place(workOrderId: string): Promise<ScopeTarget | null> {
    const [row] = await this.db
      .select({
        siteId: equipment.siteId,
        orgUnitId: equipment.orgUnitId,
        zoneId: equipment.zoneId,
      })
      .from(workOrders)
      .innerJoin(equipment, eq(equipment.id, workOrders.equipmentId))
      .where(eq(workOrders.id, workOrderId));
    return row ? placeTarget(row) : null;
  }

  private scoped(scope: AccessScope): SQL | undefined {
    return scopeCondition(scope, {
      site: equipment.siteId,
      unit: equipment.orgUnitId,
      zone: equipment.zoneId,
    });
  }

  private located(where: SQL | undefined) {
    return this.db
      .select({
        order: workOrders,
        code: equipment.code,
        name: equipment.name,
        timezone: sites.timezone,
        state: equipment.state,
      })
      .from(workOrders)
      .innerJoin(equipment, eq(equipment.id, workOrders.equipmentId))
      .innerJoin(sites, eq(sites.id, equipment.siteId))
      .where(where);
  }

  private async rows(located: readonly Located[], now: Date): Promise<WorkRow[]> {
    const people = await peopleById(
      this.db,
      located.map((row) => row.order.assigneeEmployeeId),
    );
    return located.map((row) => this.row(row, { people, now }));
  }

  private row(
    located: Located,
    context: { people: Awaited<ReturnType<typeof peopleById>>; now: Date },
  ): WorkRow {
    const { order } = located;
    const today = businessDateOf(context.now, located.timezone);
    return {
      id: order.id,
      number: order.number,
      type: order.type,
      priority: order.priority,
      status: order.status,
      title: order.title,
      equipment: { id: order.equipmentId, code: located.code, name: located.name },
      assignee: person(context.people, order.assigneeEmployeeId),
      dueOn: order.dueOn,
      plannedOn: order.plannedOn,
      overdue: order.dueOn ? isOverdue(order.dueOn, today, order.status) : false,
      readiness: order.readiness,
      reportedAt: order.reportedAt?.toISOString() ?? null,
      ackDueAt: order.ackDueAt?.toISOString() ?? null,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
    };
  }

  private viewCondition(query: WorkQuery, today: SQL): SQL | undefined {
    const open = notInArray(workOrders.status, FINAL);
    const emergency = eq(workOrders.type, WorkType.EMERGENCY_REPAIR);
    switch (query.view) {
      case WorkViewCode.URGENT:
        return and(open, or(emergency, sql`${workOrders.dueOn} < ${today}`));
      case WorkViewCode.TODAY:
        return and(open, or(emergency, sql`${workOrders.plannedOn} <= ${today}`));
      case WorkViewCode.REVIEW:
        return eq(workOrders.status, WorkStatus.IN_REVIEW);
      case WorkViewCode.ALL:
        return undefined;
    }
  }

  /** The queue: emergencies first, then overdue, then by date (FR-031). */
  async list(query: WorkQuery, scope: AccessScope, now: Date): Promise<WorkRow[]> {
    const today = siteToday(now);
    const rows = await this.located(
      and(
        this.scoped(scope),
        this.viewCondition(query, today),
        query.equipmentId ? eq(workOrders.equipmentId, query.equipmentId) : undefined,
        query.mechanicId ? eq(workOrders.assigneeEmployeeId, query.mechanicId) : undefined,
      ),
    )
      .orderBy(
        sql`${workOrders.status} IN ('COMPLETED', 'CANCELLED')`,
        sql`${workOrders.type} = 'EMERGENCY_REPAIR' DESC`,
        asc(workOrders.plannedOn),
        desc(workOrders.number),
      )
      .limit(QUEUE_LIMIT);
    return this.rows(rows, now);
  }

  async summary(scope: AccessScope, now: Date): Promise<MaintenanceSummary> {
    const today = siteToday(now);
    const [row] = await this.db
      .select({
        openEmergencies: sql<number>`count(*) filter (where ${workOrders.type} = ${WorkType.EMERGENCY_REPAIR})::int`,
        overdue: sql<number>`count(*) filter (where ${workOrders.dueOn} < ${today})::int`,
        inReview: sql<number>`count(*) filter (where ${workOrders.status} = ${WorkStatus.IN_REVIEW})::int`,
      })
      .from(workOrders)
      .innerJoin(equipment, eq(equipment.id, workOrders.equipmentId))
      .innerJoin(sites, eq(sites.id, equipment.siteId))
      .where(and(this.scoped(scope), notInArray(workOrders.status, FINAL)));
    return row ?? { openEmergencies: 0, overdue: 0, inReview: 0 };
  }

  async detail(id: string, now: Date): Promise<WorkDetail> {
    const [located] = await this.located(eq(workOrders.id, id));
    if (!located) throw new DomainError('WORK_NOT_FOUND', 404, 'Work order not found');
    const { order } = located;
    const people = await peopleById(this.db, [
      order.assigneeEmployeeId,
      order.leadEmployeeId,
      order.performedByEmployeeId,
    ]);
    const [version, operations, materials, reviews, incident, stop, history] = await Promise.all([
      this.version(order.planVersionId),
      this.operations(order),
      this.materials(order.planVersionId),
      this.reviews(id),
      this.incident(order.incidentId),
      this.stop(id),
      this.history(id),
    ]);
    return {
      ...this.row(located, { people, now }),
      description: order.description,
      lead: order.leadEmployeeId ? person(people, order.leadEmployeeId) : null,
      planId: order.planId,
      ...planFacts(version),
      operations,
      materials,
      readinessNote: order.readinessNote,
      ...timeline(order),
      cancelReason: order.cancelReason,
      summary: order.summary,
      cause: order.cause,
      partsUsed: order.partsUsed,
      performedBy: order.performedByEmployeeId ? person(people, order.performedByEmployeeId) : null,
      reviews,
      incident,
      stop,
      equipmentState: located.state,
      history,
      nextDueOnAfterAccept: this.nextAfterAccept(order, version, located.timezone),
      version: order.version,
    };
  }

  private nextAfterAccept(order: OrderRow, version: VersionFacts, timezone: string): string | null {
    if (order.status !== WorkStatus.IN_REVIEW || !version || !order.dueOn) return null;
    const performedOn = businessDateOf(
      order.performedAt ?? order.submittedAt ?? new Date(),
      timezone,
    );
    return nextCycle(version, order.dueOn, performedOn).nextDueOn;
  }

  private async version(versionId: string | null) {
    if (!versionId) return null;
    const [row] = await this.db
      .select({
        revision: maintenancePlanVersions.revision,
        estimatedMinutes: maintenancePlanVersions.estimatedMinutes,
        requiresStop: maintenancePlanVersions.requiresStop,
        intervalUnit: maintenancePlanVersions.intervalUnit,
        intervalCount: maintenancePlanVersions.intervalCount,
        anchorMode: maintenancePlanVersions.anchorMode,
        sourceLabel: sql<
          string | null
        >`coalesce((select d.title from equipment_documents d where d.id = ${maintenancePlanVersions.sourceDocumentId}) || coalesce(', ' || ${maintenancePlanVersions.sourceReference}, ''), ${maintenancePlanVersions.sourceNote})`,
      })
      .from(maintenancePlanVersions)
      .where(eq(maintenancePlanVersions.id, versionId));
    return row ?? null;
  }

  private async operations(order: OrderRow): Promise<WorkDetail['operations']> {
    if (!order.planVersionId) return [];
    const rows = await this.db
      .select({
        op: maintenancePlanOperations,
        answer: workOrderOperationResults,
        answeredBy: employees.fullName,
      })
      .from(maintenancePlanOperations)
      .leftJoin(
        workOrderOperationResults,
        and(
          eq(workOrderOperationResults.operationId, maintenancePlanOperations.id),
          eq(workOrderOperationResults.workOrderId, order.id),
        ),
      )
      .leftJoin(employees, eq(employees.id, workOrderOperationResults.answeredBy))
      .where(eq(maintenancePlanOperations.versionId, order.planVersionId))
      .orderBy(asc(maintenancePlanOperations.ordinal));
    return rows.map(({ op, answer, answeredBy }) => ({
      id: op.id,
      ordinal: op.ordinal,
      text: op.text,
      place: op.place,
      photoRequired: op.photoRequired,
      answer: answer
        ? {
            result: answer.result,
            reason: answer.reason,
            mediaObjectId: answer.mediaObjectId,
            answeredAt: answer.answeredAt.toISOString(),
            answeredBy: answeredBy ?? '—',
          }
        : null,
    }));
  }

  private async materials(versionId: string | null): Promise<WorkDetail['materials']> {
    if (!versionId) return [];
    const rows = await this.db
      .select()
      .from(maintenancePlanMaterials)
      .where(eq(maintenancePlanMaterials.versionId, versionId))
      .orderBy(asc(maintenancePlanMaterials.ordinal));
    return rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      name: m.name,
      article: m.article ?? undefined,
      quantity: Number(m.quantity),
      unit: m.unit,
      mode: m.mode,
    }));
  }

  private async reviews(id: string): Promise<WorkDetail['reviews']> {
    const rows = await this.db
      .select({
        iteration: workOrderReviews.iteration,
        decision: workOrderReviews.decision,
        comment: workOrderReviews.comment,
        reviewer: sql<string>`coalesce(${authUser.name}, ${workOrderReviews.reviewer})`,
        reviewedAt: workOrderReviews.reviewedAt,
      })
      .from(workOrderReviews)
      .leftJoin(authUser, sql`${authUser.id}::text = ${workOrderReviews.reviewer}`)
      .where(eq(workOrderReviews.workOrderId, id))
      .orderBy(asc(workOrderReviews.iteration));
    return rows.map((row) => ({ ...row, reviewedAt: row.reviewedAt.toISOString() }));
  }

  private async incident(incidentId: string | null): Promise<WorkDetail['incident']> {
    if (!incidentId) return null;
    const [row] = await this.db
      .select({
        id: downtimeIncidents.id,
        reasonLabel: sql<string>`coalesce(${reasonCodes.label}, ${downtimeIncidents.reasonCode})`,
        comment: downtimeIncidents.lastComment,
        reportedBy: sql<
          string | null
        >`(select e.full_name from ${downtimeReports} r join ${employees} e on e.id = r.employee_id where r.incident_id = ${downtimeIncidents.id} order by r.reported_at limit 1)`,
      })
      .from(downtimeIncidents)
      .leftJoin(
        reasonCodes,
        and(eq(reasonCodes.kind, 'DOWNTIME'), eq(reasonCodes.code, downtimeIncidents.reasonCode)),
      )
      .where(eq(downtimeIncidents.id, incidentId));
    return row ?? null;
  }

  private async stop(workOrderId: string): Promise<WorkDetail['stop']> {
    const [row] = await this.db
      .select({
        startedAt: equipmentStopEpisodes.startedAt,
        releasedAt: equipmentStopEpisodes.releasedAt,
      })
      .from(equipmentStopEpisodes)
      .where(eq(equipmentStopEpisodes.workOrderId, workOrderId))
      .orderBy(desc(equipmentStopEpisodes.startedAt))
      .limit(1);
    return row
      ? {
          startedAt: row.startedAt.toISOString(),
          releasedAt: row.releasedAt?.toISOString() ?? null,
        }
      : null;
  }

  private async history(workOrderId: string): Promise<WorkDetail['history']> {
    const actor = sql<
      string | null
    >`coalesce((select e.full_name from employees e where e.id = ${domainEvents.actorId}), (select u.name from auth_user u where u.id = ${domainEvents.actorId}))`;
    const rows = await this.db
      .select({
        at: domainEvents.occurredAt,
        type: domainEvents.type,
        actor,
        comment: domainEvents.comment,
      })
      .from(domainEvents)
      .where(sql`${domainEvents.payload}->>'workOrderId' = ${workOrderId}`)
      .orderBy(asc(domainEvents.occurredAt));
    return rows.map((row) => ({ ...row, at: row.at.toISOString() }));
  }

  /** Month calendar: work on its date, overdue pinned, forecasts after open cycles (FR-031, FR-032). */
  async calendar(
    query: CalendarQuery,
    scope: AccessScope,
    now: Date,
  ): Promise<MaintenanceCalendarView> {
    const filters = and(
      this.scoped(scope),
      query.unitId ? eq(equipment.orgUnitId, query.unitId) : undefined,
      query.mechanicId ? eq(workOrders.assigneeEmployeeId, query.mechanicId) : undefined,
      query.equipmentId ? eq(workOrders.equipmentId, query.equipmentId) : undefined,
    );
    const inRange = or(
      and(gte(workOrders.plannedOn, query.from), lte(workOrders.plannedOn, query.to)),
      and(
        eq(workOrders.type, WorkType.EMERGENCY_REPAIR),
        sql`${workOrders.reportedAt}::date between ${query.from}::date - 1 and ${query.to}::date + 1`,
      ),
    );
    const [rows, overdueRows] = await Promise.all([
      this.located(and(filters, inRange)),
      this.located(
        and(
          filters,
          notInArray(workOrders.status, FINAL),
          sql`${workOrders.dueOn} < ${siteToday(now)}`,
        ),
      ),
    ]);
    const people = await peopleById(
      this.db,
      [...rows, ...overdueRows].map((row) => row.order.assigneeEmployeeId),
    );
    const item = (row: Located) => this.calendarItem(row, { people, now });
    const items = rows
      .map(item)
      .filter((entry) => entry.date >= query.from && entry.date <= query.to);
    const overdue = overdueRows.map(item).filter((entry) => entry.overdue);
    return {
      today: businessDateOf(now, rows[0]?.timezone ?? 'Europe/Kyiv'),
      items,
      overdue,
      forecast: await this.forecast(query, filters),
    };
  }

  private calendarItem(
    located: Located,
    context: { people: Awaited<ReturnType<typeof peopleById>>; now: Date },
  ): CalendarItem {
    const row = this.row(located, context);
    return {
      workOrderId: row.id,
      number: row.number,
      type: row.type,
      date: calendarDate(located),
      dueOn: row.dueOn,
      equipmentCode: row.equipment.code,
      equipmentName: row.equipment.name,
      title: row.title,
      assignee: row.assignee.fullName,
      status: row.status,
      overdue: row.overdue,
      readiness: row.readiness,
    };
  }

  private async forecast(
    query: CalendarQuery,
    filters: SQL | undefined,
  ): Promise<CalendarForecast[]> {
    const open = await this.db
      .select({
        planId: maintenancePlans.id,
        title: maintenancePlans.title,
        code: equipment.code,
        dueOn: workOrders.dueOn,
        intervalUnit: maintenancePlanVersions.intervalUnit,
        intervalCount: maintenancePlanVersions.intervalCount,
        anchorMode: maintenancePlanVersions.anchorMode,
      })
      .from(workOrders)
      .innerJoin(maintenancePlans, eq(maintenancePlans.id, workOrders.planId))
      .innerJoin(
        maintenancePlanVersions,
        eq(maintenancePlanVersions.id, maintenancePlans.activeVersionId),
      )
      .innerJoin(equipment, eq(equipment.id, workOrders.equipmentId))
      .where(
        and(
          filters,
          notInArray(workOrders.status, FINAL),
          eq(maintenancePlans.state, PlanState.ACTIVE),
          inArray(workOrders.type, [WorkType.PLANNED_MAINTENANCE]),
        ),
      );
    return open.flatMap((plan) =>
      plan.dueOn
        ? forecastDueDates(plan, plan.dueOn, query).map((date) => ({
            planId: plan.planId,
            date,
            equipmentCode: plan.code,
            title: plan.title,
          }))
        : [],
    );
  }
}

type VersionFacts = Awaited<ReturnType<WorkQueriesService['version']>>;

function planFacts(version: VersionFacts) {
  if (!version)
    return { planRevision: null, estimatedMinutes: null, requiresStop: null, sourceLabel: null };
  return {
    planRevision: version.revision,
    estimatedMinutes: version.estimatedMinutes,
    requiresStop: version.requiresStop,
    sourceLabel: version.sourceLabel,
  };
}

function isoOrNull(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString();
}

function timeline(order: OrderRow) {
  return {
    startedAt: isoOrNull(order.startedAt),
    submittedAt: isoOrNull(order.submittedAt),
    performedAt: isoOrNull(order.performedAt),
    completedAt: isoOrNull(order.completedAt),
  };
}
