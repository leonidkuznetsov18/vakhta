import { Inject, Injectable } from '@nestjs/common';
import {
  activityIntervals,
  and,
  asc,
  assignmentSegments,
  downtimeIncidents,
  employeePositions,
  employees,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  orgUnits,
  presenceSessions,
  qrTerminals,
  reasonCodes,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
  sql,
  teams,
  telegramAccounts,
  type Database,
  type SQL,
  type Transaction,
} from '@vakhta/db';
import type {
  OverviewEvent,
  OverviewEventKind,
  OverviewEventsQuery,
  OverviewDowntime,
  OverviewHandover,
  OverviewPerson,
  OverviewPlannedPerson,
  OverviewQuery,
  OverviewScopeOptions,
  OverviewSiteContext,
  OverviewSnapshot,
  OverviewStaffing,
  OverviewTerminal,
  OverviewTimeToAction,
  OverviewZone,
  ShiftWindowView,
} from '@vakhta/contracts';
import {
  TERMINAL_STATES,
  accessScope,
  downtimeSnapshot,
  handoverAcceptance,
  offlineTerminalIsCritical,
  scopeCovers,
  scopeIsEmpty,
  shiftContext,
  sortZones,
  staffingSnapshot,
  terminalConnectivity,
  timeToAction,
  zoneStatus,
  type AccessScope,
  type DowntimeInterval,
  type IncidentReaction,
  type HandoverOutcome,
  type RoleGrant,
  type ShiftWindow,
  type StaffingSnapshot,
  type WebRole,
} from '@vakhta/domain';
import { DateTime } from 'luxon';
import { assertFiltersInScope, scopeCondition } from '../common/access-scope.js';
import { DATABASE } from '../infra/database.module.js';

export interface OverviewOptions {
  /** Late grace after the planned start before a planned person counts as not arrived. */
  readonly lateGraceMinutes: number;
  /** Post-shift grace for the checklist and exit QR (owner decision 2026-09-10). */
  readonly closingGraceMinutes: number;
  readonly downtimeEscalationMinutes: number;
  readonly rotationSeconds: number;
  readonly defaultTimezone: string;
}

export const OVERVIEW_OPTIONS = Symbol('OVERVIEW_OPTIONS');

const OPS: readonly WebRole[] = ['ADMIN', 'PRODUCTION_HEAD', 'SHIFT_MASTER'];
const ALL_ROLES: readonly WebRole[] = [
  'ADMIN',
  'PRODUCTION_HEAD',
  'SHIFT_MASTER',
  'HR',
  'PLANNER',
  'CLEANLINESS_CONTROLLER',
  'ACCOUNTANT',
  'AUDITOR',
];
/** Each section reads a source; its roles mirror that source's endpoint (spec 004 D-09). */
export const SECTION_ROLES = {
  staffing: [...OPS, 'PLANNER', 'HR'],
  incidents: ALL_ROLES,
  handover: [...OPS, 'HR', 'CLEANLINESS_CONTROLLER', 'AUDITOR'],
  zones: [...OPS, 'HR', 'PLANNER', 'CLEANLINESS_CONTROLLER', 'AUDITOR'],
  terminals: OPS,
  setup: [...OPS, 'HR', 'PLANNER'],
} as const satisfies Record<string, readonly WebRole[]>;

/** Handover reports into a shift: the previous shift's sessions ending around its start. */
const HANDOVER_BOUNDARY_MS = 2 * 3_600_000;

type Db = Database | Transaction;

interface SiteRow {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
}

interface Selection {
  readonly siteId: string | null;
  readonly orgUnitId: string | null;
}

/**
 * Overview command center (spec 004): one read-only snapshot of the current shift in the
 * reader's scope. Every section applies role and scope of its own source; a section the reader
 * may not read is null. Metrics come from pure domain functions over recorded facts.
 */
@Injectable()
export class OverviewService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OVERVIEW_OPTIONS) private readonly options: OverviewOptions,
  ) {}

  async snapshot(
    grants: readonly RoleGrant[],
    query: OverviewQuery,
    now: Date = new Date(),
  ): Promise<OverviewSnapshot> {
    const reader = accessScope(grants, ALL_ROLES);
    await assertFiltersInScope(this.db, reader, query);
    return this.db.transaction(
      async (tx) => {
        const options = await this.options_(tx, reader);
        const unit = query.orgUnitId
          ? (options.orgUnits.find((u) => u.id === query.orgUnitId) ?? null)
          : null;
        const selection: Selection = {
          siteId: unit?.siteId ?? query.siteId ?? null,
          orgUnitId: unit?.id ?? null,
        };
        const siteIds = selection.siteId ? [selection.siteId] : options.sites.map((s) => s.id);
        const siteRows = siteIds.length
          ? await tx
              .select({ id: sites.id, name: sites.name, timezone: sites.timezone })
              .from(sites)
              .where(inArray(sites.id, siteIds))
              .orderBy(asc(sites.name))
          : [];
        const templates = siteIds.length
          ? await tx
              .select()
              .from(shiftTemplates)
              .where(
                and(
                  inArray(shiftTemplates.siteId, siteIds),
                  eq(shiftTemplates.isActive, true),
                  // The site's shift rhythm comes from its defaults; unit shifts vary per unit.
                  isNull(shiftTemplates.orgUnitId),
                ),
              )
          : [];
        const contexts = siteRows.map((site) => {
          const ctx = shiftContext(
            templates.filter((t) => t.siteId === site.id),
            site.timezone || this.options.defaultTimezone,
            now,
            this.options.closingGraceMinutes,
          );
          return { site, ctx };
        });
        const section = (roles: readonly WebRole[]): AccessScope | null => {
          const scope = accessScope(grants, roles);
          return scopeIsEmpty(scope) ? null : scope;
        };

        const staffingScope = section(SECTION_ROLES.staffing);
        const incidentScope = section(SECTION_ROLES.incidents);
        const handoverScope = section(SECTION_ROLES.handover);
        const zoneScope = section(SECTION_ROLES.zones);
        const terminalScope = section(SECTION_ROLES.terminals);
        const setupScope = section(SECTION_ROLES.setup);

        const staffingBySite = new Map<string, StaffingSnapshot>();
        const plannedPeople = new Map<string, OverviewPlannedPerson>();
        const arrivedPeople = new Map<string, OverviewPerson>();
        const planned: PlannedRow[] = [];
        for (const { site, ctx } of contexts) {
          if (!staffingScope || !ctx.current) continue;
          const rows = await this.planned(tx, site.id, ctx.current, staffingScope, selection);
          planned.push(...rows);
          const arrivals = await this.arrivals(
            tx,
            site.id,
            rows,
            ctx.current,
            staffingScope,
            selection,
          );
          for (const r of rows)
            plannedPeople.set(r.employeeId, {
              employeeId: r.employeeId,
              fullName: r.fullName,
              personnelNumber: r.personnelNumber,
              orgUnitName: r.orgUnitName,
              planStartAt: r.planStartAt.toISOString(),
              planEndAt: r.planEndAt.toISOString(),
              zoneName: r.zoneName,
            });
          for (const a of arrivals)
            if (!arrivedPeople.has(a.employeeId))
              arrivedPeople.set(a.employeeId, {
                employeeId: a.employeeId,
                fullName: a.fullName,
                planStartAt: null,
                zoneName: a.zoneName,
              });
          staffingBySite.set(
            site.id,
            staffingSnapshot(
              rows.map((r) => ({
                assignmentId: r.assignmentId,
                employeeId: r.employeeId,
                planStartAt: r.planStartAt,
                planEndAt: r.planEndAt,
              })),
              arrivals,
              now,
              this.options.lateGraceMinutes,
            ),
          );
        }

        const staffing: OverviewStaffing | null = staffingScope
          ? this.sumStaffing(contexts, staffingBySite, {
              planned: plannedPeople,
              arrived: arrivedPeople,
            })
          : null;

        const downtime = incidentScope
          ? await this.downtime(tx, contexts, incidentScope, selection, now)
          : null;
        const reactions = incidentScope
          ? await this.reactions(tx, contexts, incidentScope, selection, now)
          : null;
        const handover = handoverScope
          ? await this.handover(tx, contexts, handoverScope, selection)
          : null;
        const zones = zoneScope ? await this.zones(tx, contexts, zoneScope, selection, now) : null;
        const terminals = terminalScope
          ? await this.terminals(tx, contexts, staffingBySite, now)
          : null;
        const setup = setupScope ? await this.setup(tx, siteIds, setupScope, selection) : null;

        return {
          generatedAt: now.toISOString(),
          lateGraceMinutes: this.options.lateGraceMinutes,
          downtimeEscalationMinutes: this.options.downtimeEscalationMinutes,
          options,
          selection,
          contexts: await Promise.all(
            contexts.map(({ site, ctx }) =>
              this.contextView(tx, site, ctx, reader, selection, now),
            ),
          ),
          staffing,
          downtime,
          timeToAction: reactions,
          handover,
          terminals,
          zones,
          setup,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /**
   * Recent operational events (spec 004 US8, D-10): an allowlist of incident, downtime, handover and
   * master-closure events from the append-only log, each limited by the scope of its own source.
   * Only codes and names leave the server; comments, payload text and request events never do.
   */
  async events(
    grants: readonly RoleGrant[],
    query: OverviewEventsQuery,
    now: Date = new Date(),
  ): Promise<OverviewEvent[]> {
    const reader = accessScope(grants, ALL_ROLES);
    await assertFiltersInScope(this.db, reader, query);
    const place = {
      site: sql`coalesce(z.site_id, i.site_id, u.site_id)`,
      unit: sql`coalesce(z.org_unit_id, i.org_unit_id, u.id)`,
      team: sql`a.team_id`,
      zone: sql`coalesce(e.zone_id, i.zone_id, s.zone_id)`,
    };
    const groups: SQL[] = [];
    const incidentScope = accessScope(grants, SECTION_ROLES.incidents);
    const handoverScope = accessScope(grants, SECTION_ROLES.handover);
    const shiftScope = accessScope(grants, SECTION_ROLES.zones);
    const allow = (scope: AccessScope, kinds: SQL) => {
      if (scopeIsEmpty(scope)) return;
      const condition = scopeCondition(scope, place);
      groups.push(condition ? sql`(${kinds} and ${condition})` : sql`(${kinds})`);
    };
    allow(
      incidentScope,
      sql`e.type in ('INCIDENT_REPORTED', 'INCIDENT_ESCALATED', 'INCIDENT_SLA_BREACHED', 'INCIDENT_STATUS_CHANGED')`,
    );
    allow(
      handoverScope,
      sql`e.type in ('HANDOVER_SUBMITTED', 'HANDOVER_DISPUTED', 'HANDOVER_ACCEPTED', 'HANDOVER_RESOLVED')`,
    );
    allow(shiftScope, sql`e.type in ('DOWNTIME_STARTED', 'RESUMED', 'SHIFT_CLOSED')`);
    if (groups.length === 0) return [];
    const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const rows = await this.db.execute<{
      id: string;
      type: string;
      occurred_at: string | Date;
      incident_id: string | null;
      shift_session_id: string | null;
      business_date: string | null;
      handover_id: string | null;
      zone_name: string | null;
      employee_name: string | null;
      reason_label: string | null;
      source: string;
      to_status: string | null;
      from_state: string | null;
    }>(sql`
      select e.id, e.type, e.occurred_at, e.incident_id, e.shift_session_id, e.source,
        e.payload->>'to' as to_status, e.payload->>'from' as from_state,
        s.business_date::text as business_date,
        coalesce(e.payload->>'handoverId', (
          select h.id::text from handover_records h where h.shift_session_id = e.shift_session_id
          order by h.created_at desc limit 1)) as handover_id,
        coalesce(z.name, iz.name) as zone_name, emp.full_name as employee_name,
        rc.label as reason_label
      from domain_events e
      left join downtime_incidents i on i.id = e.incident_id
      left join shift_sessions s on s.id = e.shift_session_id
      left join shift_assignments a on a.id = s.assignment_id
      left join org_units u on u.id = coalesce(a.org_unit_id, (
        select p.org_unit_id from employee_positions p
        where p.employee_id = s.employee_id and p.valid_to is null
        order by p.valid_from desc limit 1))
      left join responsibility_zones z on z.id = coalesce(e.zone_id, s.zone_id)
      left join responsibility_zones iz on iz.id = i.zone_id
      left join employees emp on emp.id = e.employee_id
      left join reason_codes rc on rc.kind = 'DOWNTIME' and rc.code = coalesce(e.reason_code, i.reason_code)
      where e.occurred_at >= ${since}::timestamptz
        and e.occurred_at <= ${now.toISOString()}::timestamptz
        and (${sql.join(groups, sql` or `)})
        and not (e.type = 'INCIDENT_STATUS_CHANGED' and coalesce(e.payload->>'to', '') not in ('ACKNOWLEDGED', 'RESOLVED', 'CLOSED'))
        and not (e.type = 'RESUMED' and coalesce(e.payload->>'from', '') <> 'DOWNTIME')
        and not (e.type = 'SHIFT_CLOSED' and e.source <> 'WEB')
        ${query.siteId ? sql`and ${place.site} = ${query.siteId}` : sql``}
        ${query.orgUnitId ? sql`and ${place.unit} = ${query.orgUnitId}` : sql``}
      order by e.occurred_at desc
      limit ${query.limit}
    `);
    return rows.flatMap((r): OverviewEvent[] => {
      const kind = eventKind(r.type, r.to_status);
      if (!kind) return [];
      const incidents = kind.startsWith('INCIDENT_');
      const handover = kind.startsWith('HANDOVER_');
      return [
        {
          id: r.id,
          kind,
          at: new Date(r.occurred_at).toISOString(),
          zoneName: r.zone_name,
          employeeName: r.employee_name,
          reasonLabel: incidents || kind === 'DOWNTIME_STARTED' ? r.reason_label : null,
          target: incidents
            ? { section: 'incidents', id: r.incident_id, businessDate: null }
            : handover
              ? { section: 'handover', id: r.handover_id, businessDate: r.business_date }
              : { section: 'operations', id: r.shift_session_id, businessDate: r.business_date },
        },
      ];
    });
  }

  /* ------------------------------------------------------------------ */
  /* Scope options                                                       */
  /* ------------------------------------------------------------------ */

  /** Sites and units the reader can reach with any panel grant; a zone or team grant reaches its unit. */
  private async options_(tx: Db, reader: AccessScope): Promise<OverviewScopeOptions> {
    const [siteRows, unitRows, zoneRows, teamRows] = await Promise.all([
      tx.select({ id: sites.id, name: sites.name }).from(sites).orderBy(asc(sites.name)),
      tx
        .select({ id: orgUnits.id, siteId: orgUnits.siteId, name: orgUnits.name })
        .from(orgUnits)
        .orderBy(asc(orgUnits.name)),
      reader.all || reader.zoneIds.length === 0
        ? []
        : tx
            .select({ orgUnitId: responsibilityZones.orgUnitId })
            .from(responsibilityZones)
            .where(inArray(responsibilityZones.id, [...reader.zoneIds])),
      reader.all || reader.teamIds.length === 0
        ? []
        : tx
            .select({ orgUnitId: teams.orgUnitId })
            .from(teams)
            .where(inArray(teams.id, [...reader.teamIds])),
    ]);
    const viaPlaces = new Set([...zoneRows, ...teamRows].map((r) => r.orgUnitId));
    const units = unitRows.filter(
      (u) => scopeCovers(reader, { siteId: u.siteId, orgUnitId: u.id }) || viaPlaces.has(u.id),
    );
    const reachableSites = new Set(units.map((u) => u.siteId));
    if (!reader.all) for (const id of reader.siteIds) reachableSites.add(id);
    return {
      sites: siteRows.filter((s) => reader.all || reachableSites.has(s.id)),
      orgUnits: units,
    };
  }

  private async contextView(
    tx: Db,
    site: SiteRow,
    ctx: ReturnType<typeof shiftContext>,
    scope: AccessScope,
    selection: Selection,
    now: Date,
  ): Promise<OverviewSiteContext> {
    const view = async (w: ShiftWindow | null): Promise<ShiftWindowView | null> =>
      w
        ? {
            templateId: w.templateId,
            code: w.code,
            name: w.name,
            period: w.period,
            businessDate: w.businessDate,
            startsAt: w.startsAt.toISOString(),
            endsAt: w.endsAt.toISOString(),
            closesAt: w.closesAt.toISOString(),
            staffed: await this.staffed(tx, site.id, w, scope, selection, now),
          }
        : null;
    const [current, closingPrevious, next] = await Promise.all([
      view(ctx.current),
      view(ctx.closingPrevious),
      view(ctx.next),
    ]);
    return {
      siteId: site.id,
      siteName: site.name,
      timezone: site.timezone,
      current,
      closingPrevious,
      next,
    };
  }

  /**
   * Whether a shift window really happens: a PLANNED assignment of a published schedule overlaps it,
   * or a shift was recorded in it (started, arrived or still open). A day off is neither.
   */
  private async staffed(
    tx: Db,
    siteId: string,
    window: ShiftWindow,
    scope: AccessScope,
    selection: Selection,
    now: Date,
  ): Promise<boolean> {
    const [plan] = await tx
      .select({ id: shiftAssignments.id })
      .from(shiftAssignments)
      .innerJoin(
        scheduleVersions,
        and(
          eq(shiftAssignments.scheduleVersionId, scheduleVersions.id),
          eq(scheduleVersions.status, 'PUBLISHED'),
        ),
      )
      .innerJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .where(
        and(
          eq(shiftAssignments.status, 'PLANNED'),
          eq(orgUnits.siteId, siteId),
          lt(shiftAssignments.planStartAt, window.endsAt),
          gt(shiftAssignments.planEndAt, window.startsAt),
          selection.orgUnitId ? eq(shiftAssignments.orgUnitId, selection.orgUnitId) : undefined,
          scopeCondition(scope, {
            site: orgUnits.siteId,
            unit: shiftAssignments.orgUnitId,
            team: shiftAssignments.teamId,
            zone: shiftAssignments.zoneId,
          }),
        ),
      )
      .limit(1);
    if (plan) return true;
    if (window.startsAt.getTime() > now.getTime()) return false;
    const unit = shiftUnitSql();
    const [recorded] = await tx
      .select({ id: shiftSessions.id })
      .from(shiftSessions)
      .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .leftJoin(orgUnits, sql`${orgUnits.id} = ${unit}`)
      .where(
        and(
          eq(orgUnits.siteId, siteId),
          sql`coalesce(${shiftSessions.startedAt}, ${shiftSessions.createdAt}) < ${window.endsAt.toISOString()}::timestamptz`,
          or(isNull(shiftSessions.endedAt), gt(shiftSessions.endedAt, window.startsAt)),
          selection.orgUnitId ? sql`${unit} = ${selection.orgUnitId}` : undefined,
          scopeCondition(scope, {
            site: orgUnits.siteId,
            unit,
            team: shiftAssignments.teamId,
            zone: shiftSessions.zoneId,
          }),
        ),
      )
      .limit(1);
    return !!recorded;
  }

  /* ------------------------------------------------------------------ */
  /* Staffing                                                            */
  /* ------------------------------------------------------------------ */

  private planned(
    tx: Db,
    siteId: string,
    window: ShiftWindow,
    scope: AccessScope,
    selection: Selection,
  ): Promise<PlannedRow[]> {
    return tx
      .select({
        assignmentId: shiftAssignments.id,
        employeeId: shiftAssignments.employeeId,
        planStartAt: shiftAssignments.planStartAt,
        planEndAt: shiftAssignments.planEndAt,
        zoneId: shiftAssignments.zoneId,
        orgUnitId: shiftAssignments.orgUnitId,
        fullName: employees.fullName,
        personnelNumber: employees.personnelNumber,
        orgUnitName: orgUnits.name,
        zoneName: responsibilityZones.name,
      })
      .from(shiftAssignments)
      .innerJoin(
        scheduleVersions,
        and(
          eq(shiftAssignments.scheduleVersionId, scheduleVersions.id),
          eq(scheduleVersions.status, 'PUBLISHED'),
        ),
      )
      .innerJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .innerJoin(employees, eq(shiftAssignments.employeeId, employees.id))
      .leftJoin(responsibilityZones, eq(shiftAssignments.zoneId, responsibilityZones.id))
      .where(
        and(
          eq(shiftAssignments.status, 'PLANNED'),
          eq(orgUnits.siteId, siteId),
          lt(shiftAssignments.planStartAt, window.endsAt),
          gt(shiftAssignments.planEndAt, window.startsAt),
          selection.orgUnitId ? eq(shiftAssignments.orgUnitId, selection.orgUnitId) : undefined,
          scopeCondition(scope, {
            site: orgUnits.siteId,
            unit: shiftAssignments.orgUnitId,
            team: shiftAssignments.teamId,
            zone: shiftAssignments.zoneId,
          }),
        ),
      )
      .orderBy(asc(shiftAssignments.planStartAt));
  }

  /**
   * Evidence of presence for the window: sessions or presences linked to the planned assignments,
   * any recorded session of a planned person since the window's early start, and open shifts in
   * scope (people present without a plan).
   */
  private async arrivals(
    tx: Db,
    siteId: string,
    planned: readonly PlannedRow[],
    window: ShiftWindow,
    scope: AccessScope,
    selection: Selection,
  ): Promise<ArrivalRow[]> {
    const assignmentIds = planned.map((p) => p.assignmentId);
    const employeeIds = [...new Set(planned.map((p) => p.employeeId))];
    const earliest = new Date(window.startsAt.getTime() - 3 * 3_600_000);
    const unit = shiftUnitSql();
    const [linked, presence, open] = await Promise.all([
      employeeIds.length
        ? tx
            .select({
              employeeId: shiftSessions.employeeId,
              assignmentId: shiftSessions.assignmentId,
            })
            .from(shiftSessions)
            .where(
              or(
                assignmentIds.length
                  ? inArray(shiftSessions.assignmentId, assignmentIds)
                  : undefined,
                and(
                  inArray(shiftSessions.employeeId, employeeIds),
                  or(
                    gte(shiftSessions.startedAt, earliest),
                    notInArray(shiftSessions.state, [...TERMINAL_STATES]),
                  ),
                ),
              ),
            )
        : [],
      employeeIds.length
        ? tx
            .select({
              employeeId: presenceSessions.employeeId,
              assignmentId: presenceSessions.assignmentId,
            })
            .from(presenceSessions)
            .where(
              and(
                inArray(presenceSessions.employeeId, employeeIds),
                or(
                  assignmentIds.length
                    ? inArray(presenceSessions.assignmentId, assignmentIds)
                    : undefined,
                  eq(presenceSessions.status, 'OPEN'),
                  gte(presenceSessions.arrivedAt, earliest),
                ),
              ),
            )
        : [],
      tx
        .select({
          employeeId: shiftSessions.employeeId,
          assignmentId: shiftSessions.assignmentId,
          fullName: employees.fullName,
          zoneName: responsibilityZones.name,
        })
        .from(shiftSessions)
        .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
        .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
        .leftJoin(orgUnits, sql`${orgUnits.id} = ${unit}`)
        .leftJoin(responsibilityZones, eq(shiftSessions.zoneId, responsibilityZones.id))
        .where(
          and(
            notInArray(shiftSessions.state, [...TERMINAL_STATES]),
            eq(orgUnits.siteId, siteId),
            selection.orgUnitId ? sql`${unit} = ${selection.orgUnitId}` : undefined,
            scopeCondition(scope, {
              site: orgUnits.siteId,
              unit,
              team: shiftAssignments.teamId,
              zone: shiftSessions.zoneId,
            }),
          ),
        ),
    ]);
    const names = new Map(planned.map((p) => [p.employeeId, p]));
    return [
      ...linked.map((a) => ({
        ...a,
        fullName: names.get(a.employeeId)?.fullName ?? '',
        zoneName: names.get(a.employeeId)?.zoneName ?? null,
      })),
      ...presence.map((a) => ({
        ...a,
        fullName: names.get(a.employeeId)?.fullName ?? '',
        zoneName: names.get(a.employeeId)?.zoneName ?? null,
      })),
      ...open,
    ];
  }

  private sumStaffing(
    contexts: readonly { site: SiteRow; ctx: ReturnType<typeof shiftContext> }[],
    bySite: ReadonlyMap<string, StaffingSnapshot>,
    people: {
      readonly planned: ReadonlyMap<string, OverviewPlannedPerson>;
      readonly arrived: ReadonlyMap<string, OverviewPerson>;
    },
  ): OverviewStaffing {
    const { planned, arrived } = people;
    const all = [...bySite.values()];
    const sum = (k: 'planned' | 'present' | 'notArrived' | 'expected' | 'unscheduled') =>
      all.reduce((s, x) => s + x[k], 0);
    const oldest = all
      .map((s) => s.oldestNotArrivedSince)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const firstDate = contexts.find((c) => c.ctx.current)?.ctx.current?.businessDate ?? null;
    return {
      planned: sum('planned'),
      present: sum('present'),
      notArrived: sum('notArrived'),
      expected: sum('expected'),
      unscheduled: sum('unscheduled'),
      presentPeople: all
        .flatMap((s) => s.presentEmployeeIds)
        .flatMap((id) => planned.get(id) ?? []),
      expectedPeople: all
        .flatMap((s) => s.expectedEmployeeIds)
        .flatMap((id) => planned.get(id) ?? []),
      notArrivedPeople: all
        .flatMap((s) => s.notArrivedEmployeeIds)
        .flatMap((id) => planned.get(id) ?? []),
      unscheduledPeople: all
        .flatMap((s) => s.unscheduledEmployeeIds)
        .flatMap((id) => arrived.get(id) ?? []),
      oldestNotArrivedSince: oldest?.toISOString() ?? null,
      businessDate: firstDate,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Downtime and incidents                                              */
  /* ------------------------------------------------------------------ */

  private async downtime(
    tx: Db,
    contexts: readonly { site: SiteRow; ctx: ReturnType<typeof shiftContext> }[],
    scope: AccessScope,
    selection: Selection,
    now: Date,
  ): Promise<OverviewDowntime> {
    const unit = shiftUnitSql();
    const intervals: DowntimeInterval[] = [];
    let from = now;
    for (const { site, ctx } of contexts) {
      if (!ctx.current) continue;
      const start = ctx.current.startsAt;
      if (start < from) from = start;
      const rows = await tx
        .select({
          employeeId: shiftSessions.employeeId,
          zoneId: shiftSessions.zoneId,
          reasonCode: activityIntervals.reasonCode,
          startedAt: activityIntervals.startedAt,
          endedAt: activityIntervals.endedAt,
        })
        .from(activityIntervals)
        .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
        .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
        .leftJoin(orgUnits, sql`${orgUnits.id} = ${unit}`)
        .where(
          and(
            eq(activityIntervals.state, 'DOWNTIME'),
            lt(activityIntervals.startedAt, now),
            or(isNull(activityIntervals.endedAt), gt(activityIntervals.endedAt, start)),
            eq(orgUnits.siteId, site.id),
            selection.orgUnitId ? sql`${unit} = ${selection.orgUnitId}` : undefined,
            scopeCondition(scope, {
              site: orgUnits.siteId,
              unit,
              team: shiftAssignments.teamId,
              zone: shiftSessions.zoneId,
            }),
          ),
        );
      // Each site's own shift start clips its intervals; the snapshot then merges them.
      intervals.push(
        ...rows.map((r) => ({ ...r, startedAt: r.startedAt < start ? start : r.startedAt })),
      );
    }
    const snapshot = downtimeSnapshot(intervals, from, now);
    const incidents = await this.incidentRows(tx, contexts, scope, selection);
    const zoneIds = snapshot.byZone.flatMap((z) => (z.zoneId ? [z.zoneId] : []));
    const [zoneNames, reasons] = await Promise.all([
      zoneIds.length
        ? tx
            .select({ id: responsibilityZones.id, name: responsibilityZones.name })
            .from(responsibilityZones)
            .where(inArray(responsibilityZones.id, zoneIds))
        : [],
      snapshot.topReason
        ? tx
            .select({ label: reasonCodes.label })
            .from(reasonCodes)
            .where(
              and(eq(reasonCodes.kind, 'DOWNTIME'), eq(reasonCodes.code, snapshot.topReason.code)),
            )
            .limit(1)
        : [],
    ]);
    const zoneName = new Map(zoneNames.map((z) => [z.id, z.name]));
    return {
      zoneMinutes: snapshot.zoneMinutes,
      personMinutes: snapshot.personMinutes,
      incidents: incidents.filter((i) => i.status !== 'DUPLICATE').length,
      topReason: snapshot.topReason
        ? {
            ...snapshot.topReason,
            label: reasons[0]?.label ?? snapshot.topReason.code,
          }
        : null,
      byZone: snapshot.byZone.map((z) => ({
        zoneId: z.zoneId,
        zoneName: z.zoneId ? (zoneName.get(z.zoneId) ?? null) : null,
        minutes: z.minutes,
      })),
    };
  }

  private async incidentRows(
    tx: Db,
    contexts: readonly { site: SiteRow; ctx: ReturnType<typeof shiftContext> }[],
    scope: AccessScope,
    selection: Selection,
  ): Promise<IncidentReaction[]> {
    const conditions: SQL[] = [];
    for (const { site, ctx } of contexts) {
      if (!ctx.current) continue;
      conditions.push(
        and(
          eq(downtimeIncidents.siteId, site.id),
          gte(downtimeIncidents.openedAt, ctx.current.startsAt),
        ) as SQL,
      );
    }
    if (conditions.length === 0) return [];
    return tx
      .select({
        status: downtimeIncidents.status,
        openedAt: downtimeIncidents.openedAt,
        slaDueAt: downtimeIncidents.slaDueAt,
        acknowledgedAt: downtimeIncidents.acknowledgedAt,
        resolvedAt: downtimeIncidents.resolvedAt,
      })
      .from(downtimeIncidents)
      .where(
        and(
          or(...conditions),
          selection.orgUnitId ? eq(downtimeIncidents.orgUnitId, selection.orgUnitId) : undefined,
          scopeCondition(scope, {
            site: downtimeIncidents.siteId,
            unit: downtimeIncidents.orgUnitId,
            zone: downtimeIncidents.zoneId,
          }),
        ),
      );
  }

  private async reactions(
    tx: Db,
    contexts: readonly { site: SiteRow; ctx: ReturnType<typeof shiftContext> }[],
    scope: AccessScope,
    selection: Selection,
    now: Date,
  ): Promise<OverviewTimeToAction> {
    return timeToAction(await this.incidentRows(tx, contexts, scope, selection), now);
  }

  /* ------------------------------------------------------------------ */
  /* Handover                                                            */
  /* ------------------------------------------------------------------ */

  private async handover(
    tx: Db,
    contexts: readonly { site: SiteRow; ctx: ReturnType<typeof shiftContext> }[],
    scope: AccessScope,
    selection: Selection,
  ): Promise<OverviewHandover> {
    const unit = shiftUnitSql();
    const outcomes: HandoverOutcome[] = [];
    for (const { site, ctx } of contexts) {
      if (!ctx.current) continue;
      const start = ctx.current.startsAt.getTime();
      const rows = await tx.execute<{ status: string; disputed: boolean }>(sql`
        select h.status, exists (
          select 1 from handover_reviews r where r.handover_id = h.id and r.decision = 'ISSUE'
        ) as disputed
        from handover_records h
        join shift_sessions on shift_sessions.id = h.shift_session_id
        left join shift_assignments on shift_assignments.id = shift_sessions.assignment_id
        left join responsibility_zones z on z.id = h.zone_id
        left join org_units u on u.id = ${unit}
        where h.status not in ('DRAFT', 'SUPERSEDED')
          and coalesce(shift_sessions.plan_end_at, shift_assignments.plan_end_at)
            between ${new Date(start - HANDOVER_BOUNDARY_MS).toISOString()}::timestamptz
            and ${new Date(start + HANDOVER_BOUNDARY_MS).toISOString()}::timestamptz
          and coalesce(z.site_id, u.site_id) = ${site.id}
          ${selection.orgUnitId ? sql`and coalesce(z.org_unit_id, u.id) = ${selection.orgUnitId}` : sql``}
          ${scopeSql(scope, {
            site: sql`coalesce(z.site_id, u.site_id)`,
            unit: sql`coalesce(z.org_unit_id, u.id)`,
            team: sql`shift_assignments.team_id`,
            zone: sql`h.zone_id`,
          })}
      `);
      outcomes.push(...rows.map((r) => ({ status: r.status, disputed: r.disputed })));
    }
    return handoverAcceptance(outcomes);
  }

  /* ------------------------------------------------------------------ */
  /* Zones                                                               */
  /* ------------------------------------------------------------------ */

  private async zones(
    tx: Db,
    contexts: readonly { site: SiteRow; ctx: ReturnType<typeof shiftContext> }[],
    scope: AccessScope,
    selection: Selection,
    now: Date,
  ): Promise<OverviewZone[]> {
    const out: OverviewZone[] = [];
    for (const { site } of contexts) {
      const zoneRows = await tx
        .select({
          zoneId: responsibilityZones.id,
          zoneName: responsibilityZones.name,
          orgUnitId: responsibilityZones.orgUnitId,
          orgUnitName: orgUnits.name,
        })
        .from(responsibilityZones)
        .innerJoin(orgUnits, eq(responsibilityZones.orgUnitId, orgUnits.id))
        .where(
          and(
            eq(responsibilityZones.siteId, site.id),
            eq(responsibilityZones.isActive, true),
            selection.orgUnitId
              ? eq(responsibilityZones.orgUnitId, selection.orgUnitId)
              : undefined,
            scopeCondition(scope, {
              site: responsibilityZones.siteId,
              unit: responsibilityZones.orgUnitId,
              zone: responsibilityZones.id,
            }),
          ),
        )
        .orderBy(asc(orgUnits.name), asc(responsibilityZones.name));
      if (zoneRows.length === 0) continue;
      const zoneIds = zoneRows.map((z) => z.zoneId);
      const [plannedNow, openSessions, openDowntime] = await Promise.all([
        tx
          .select({
            assignmentId: shiftAssignments.id,
            zoneId: shiftAssignments.zoneId,
            employeeId: shiftAssignments.employeeId,
            fullName: employees.fullName,
            planStartAt: shiftAssignments.planStartAt,
          })
          .from(shiftAssignments)
          .innerJoin(employees, eq(shiftAssignments.employeeId, employees.id))
          .innerJoin(
            scheduleVersions,
            and(
              eq(shiftAssignments.scheduleVersionId, scheduleVersions.id),
              eq(scheduleVersions.status, 'PUBLISHED'),
            ),
          )
          .where(
            and(
              eq(shiftAssignments.status, 'PLANNED'),
              lt(shiftAssignments.planStartAt, now),
              gt(shiftAssignments.planEndAt, now),
              or(
                inArray(shiftAssignments.zoneId, zoneIds),
                sql`exists (select 1 from assignment_segments s where s.assignment_id = ${shiftAssignments.id} and s.zone_id in ${zoneIds})`,
              ),
            ),
          ),
        tx
          .select({
            zoneId: shiftSessions.zoneId,
            state: shiftSessions.state,
            employeeId: shiftSessions.employeeId,
            fullName: employees.fullName,
          })
          .from(shiftSessions)
          .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
          .where(
            and(
              inArray(shiftSessions.zoneId, zoneIds),
              notInArray(shiftSessions.state, [...TERMINAL_STATES]),
            ),
          ),
        tx
          .select({
            zoneId: shiftSessions.zoneId,
            since: sql<Date>`min(${activityIntervals.startedAt})`.mapWith(
              (v: unknown) => new Date(v as string),
            ),
          })
          .from(activityIntervals)
          .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
          .where(
            and(
              eq(activityIntervals.state, 'DOWNTIME'),
              isNull(activityIntervals.endedAt),
              inArray(shiftSessions.zoneId, zoneIds),
            ),
          )
          .groupBy(shiftSessions.zoneId),
      ]);
      const segments = plannedNow.length
        ? await tx
            .select({
              assignmentId: assignmentSegments.assignmentId,
              zoneId: assignmentSegments.zoneId,
              localStart: assignmentSegments.localStart,
              localEnd: assignmentSegments.localEnd,
            })
            .from(assignmentSegments)
            .where(
              inArray(
                assignmentSegments.assignmentId,
                plannedNow.map((p) => p.assignmentId),
              ),
            )
        : [];
      const local = DateTime.fromJSDate(now, { zone: site.timezone }).toFormat('HH:mm');
      const within = (s: { localStart: string; localEnd: string }) =>
        s.localStart <= s.localEnd
          ? s.localStart <= local && local < s.localEnd
          : local >= s.localStart || local < s.localEnd;
      const segmentsByAssignment = groupBy(segments, (s) => s.assignmentId);
      const plannedByZone = new Map<string, (typeof plannedNow)[number][]>();
      for (const p of plannedNow) {
        const own = segmentsByAssignment.get(p.assignmentId) ?? [];
        const zoneId = own.length ? (own.find(within)?.zoneId ?? null) : p.zoneId;
        if (zoneId) plannedByZone.set(zoneId, [...(plannedByZone.get(zoneId) ?? []), p]);
      }
      const openByZone = groupBy(
        openSessions.flatMap((s) => (s.zoneId ? [{ ...s, zoneId: s.zoneId }] : [])),
        (s) => s.zoneId,
      );
      const downtimeByZone = new Map(openDowntime.map((d) => [d.zoneId, d.since]));
      const meta = new Map(zoneRows.map((z) => [z.zoneId, z]));
      for (const view of sortZones(
        zoneRows.map((z) =>
          zoneStatus({
            zoneId: z.zoneId,
            planned: plannedByZone.get(z.zoneId)?.length ?? 0,
            openStates: (openByZone.get(z.zoneId) ?? []).map((o) => o.state),
            downtimeSince: downtimeByZone.get(z.zoneId) ?? null,
          }),
        ),
      )) {
        const z = meta.get(view.zoneId)!;
        out.push({
          zoneId: view.zoneId,
          zoneName: z.zoneName,
          orgUnitId: z.orgUnitId,
          orgUnitName: z.orgUnitName,
          siteId: site.id,
          status: view.status,
          planned: view.planned,
          present: view.present,
          since: view.since?.toISOString() ?? null,
          ...zonePeople(
            z.zoneName,
            plannedByZone.get(view.zoneId) ?? [],
            openByZone.get(view.zoneId) ?? [],
          ),
        });
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Terminals and setup                                                 */
  /* ------------------------------------------------------------------ */

  private async terminals(
    tx: Db,
    contexts: readonly { site: SiteRow; ctx: ReturnType<typeof shiftContext> }[],
    staffingBySite: ReadonlyMap<string, StaffingSnapshot>,
    now: Date,
  ): Promise<OverviewTerminal[]> {
    const siteIds = contexts.map((c) => c.site.id);
    if (siteIds.length === 0) return [];
    // Terminals are site infrastructure: anyone whose scope reaches the site depends on them.
    const rows = await tx
      .select({
        id: qrTerminals.id,
        siteId: qrTerminals.siteId,
        name: qrTerminals.name,
        status: qrTerminals.status,
        paired: sql<boolean>`${qrTerminals.deviceTokenHash} is not null`,
        lastSeenAt: qrTerminals.lastSeenAt,
      })
      .from(qrTerminals)
      .where(and(inArray(qrTerminals.siteId, siteIds), isNull(qrTerminals.deletedAt)))
      .orderBy(asc(qrTerminals.name));
    return rows
      .filter((t) => t.status === 'ACTIVE')
      .map((t) => {
        const connectivity = terminalConnectivity(t, now, this.options.rotationSeconds);
        const ctx = contexts.find((c) => c.site.id === t.siteId)?.ctx;
        const boundaries = [ctx?.current?.endsAt, ctx?.next?.startsAt]
          .filter((d): d is Date => !!d && d.getTime() >= now.getTime())
          .sort((a, b) => a.getTime() - b.getTime());
        return {
          id: t.id,
          siteId: t.siteId,
          name: t.name,
          connectivity,
          lastSeenAt: t.lastSeenAt?.toISOString() ?? null,
          critical:
            connectivity === 'OFFLINE' &&
            offlineTerminalIsCritical({
              now,
              nextBoundaryAt: boundaries[0] ?? null,
              notArrived: staffingBySite.get(t.siteId)?.notArrived ?? 0,
            }),
        };
      });
  }

  private async setup(
    tx: Db,
    siteIds: readonly string[],
    scope: AccessScope,
    selection: Selection,
  ) {
    const person = sql`(select p.org_unit_id from employee_positions p where p.employee_id = ${employees.id} and p.valid_to is null order by p.valid_from desc limit 1)`;
    const unscopedAll = scope.all && !selection.siteId && !selection.orgUnitId;
    const [unlinked] = await tx
      .select({ count: sql<number>`count(distinct ${employees.id})::int` })
      .from(employees)
      .leftJoin(
        telegramAccounts,
        and(eq(telegramAccounts.employeeId, employees.id), eq(telegramAccounts.status, 'ACTIVE')),
      )
      .leftJoin(orgUnits, sql`${orgUnits.id} = ${person}`)
      .leftJoin(
        employeePositions,
        and(eq(employeePositions.employeeId, employees.id), isNull(employeePositions.validTo)),
      )
      .where(
        and(
          eq(employees.status, 'ACTIVE'),
          isNull(telegramAccounts.id),
          unscopedAll
            ? undefined
            : and(
                siteIds.length ? inArray(orgUnits.siteId, [...siteIds]) : sql`false`,
                selection.orgUnitId ? eq(orgUnits.id, selection.orgUnitId) : undefined,
                scopeCondition(scope, {
                  site: orgUnits.siteId,
                  unit: orgUnits.id,
                  team: employeePositions.teamId,
                }),
              ),
        ),
      );
    const [unpaired] = siteIds.length
      ? await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(qrTerminals)
          .where(
            and(
              inArray(qrTerminals.siteId, [...siteIds]),
              isNull(qrTerminals.deletedAt),
              eq(qrTerminals.status, 'ACTIVE'),
              isNull(qrTerminals.deviceTokenHash),
            ),
          )
      : [{ count: 0 }];
    return {
      unlinkedEmployees: Number(unlinked?.count ?? 0),
      unpairedTerminals: Number(unpaired?.count ?? 0),
    };
  }
}

interface PlannedRow {
  readonly assignmentId: string;
  readonly employeeId: string;
  readonly planStartAt: Date;
  readonly planEndAt: Date;
  readonly zoneId: string | null;
  readonly orgUnitId: string;
  readonly fullName: string;
  readonly personnelNumber: string;
  readonly orgUnitName: string;
  readonly zoneName: string | null;
}

interface ArrivalRow {
  readonly employeeId: string;
  readonly assignmentId: string | null;
  readonly fullName: string;
  readonly zoneName: string | null;
}

/**
 * Unit of a shift: its assignment's unit, else the employee's current position (a shift without a
 * schedule). Rendered in a query that joins shift_sessions and shift_assignments by table name.
 */
function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
}

/** The faces behind a zone's "present of planned": who is there and who of the plan is not. */
function zonePeople(
  zoneName: string,
  planned: readonly { employeeId: string; fullName: string; planStartAt: Date }[],
  open: readonly { employeeId: string; fullName: string }[],
): Pick<OverviewZone, 'presentPeople' | 'missingPeople'> {
  const here = new Set(open.map((o) => o.employeeId));
  const person = (employeeId: string, fullName: string, planStartAt: Date | null) => ({
    employeeId,
    fullName,
    planStartAt: planStartAt?.toISOString() ?? null,
    zoneName,
  });
  const presentPeople = [...new Map(open.map((o) => [o.employeeId, o])).values()].map((o) =>
    person(o.employeeId, o.fullName, null),
  );
  const missing = new Map<string, OverviewPerson>();
  for (const p of planned)
    if (!here.has(p.employeeId) && !missing.has(p.employeeId))
      missing.set(p.employeeId, person(p.employeeId, p.fullName, p.planStartAt));
  return { presentPeople, missingPeople: [...missing.values()] };
}

function shiftUnitSql(): SQL<string | null> {
  return sql<string | null>`coalesce(shift_assignments.org_unit_id, (
    select p.org_unit_id from employee_positions p
    where p.employee_id = shift_sessions.employee_id and p.valid_to is null
    order by p.valid_from desc limit 1))`;
}

/** `scopeCondition` for raw SQL: an `and (...)` fragment, empty for everything. */
function scopeSql(scope: AccessScope, cols: { site: SQL; unit: SQL; team: SQL; zone: SQL }): SQL {
  const condition = scopeCondition(scope, cols);
  return condition ? sql`and ${condition}` : sql``;
}

function eventKind(type: string, to: string | null): OverviewEventKind | null {
  switch (type) {
    case 'INCIDENT_REPORTED':
    case 'INCIDENT_ESCALATED':
    case 'INCIDENT_SLA_BREACHED':
    case 'DOWNTIME_STARTED':
    case 'HANDOVER_SUBMITTED':
    case 'HANDOVER_DISPUTED':
      return type;
    case 'INCIDENT_STATUS_CHANGED':
      return to === 'ACKNOWLEDGED' ? 'INCIDENT_ACKNOWLEDGED' : 'INCIDENT_RESOLVED';
    case 'RESUMED':
      return 'DOWNTIME_ENDED';
    case 'HANDOVER_ACCEPTED':
    case 'HANDOVER_RESOLVED':
      return 'HANDOVER_DECIDED';
    case 'SHIFT_CLOSED':
      return 'SHIFT_CLOSED_BY_MASTER';
    default:
      return null;
  }
}
