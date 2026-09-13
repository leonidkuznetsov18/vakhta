import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  employeeAvailability,
  employeeQualifications,
  employees,
  eq,
  inArray,
  qualifications,
  responsibilityZones,
  shiftTemplates,
  siteSchedulingRules,
  sites,
  zoneStaffingRequirements,
  type Database,
  type DbOrTx,
  scheduleVersions,
  shiftAssignments,
} from '@vakhta/db';
import type {
  CandidateView,
  CandidatesQuery,
  CreateQualificationCommand,
  EmployeeAvailabilityView,
  EmployeeQualificationView,
  CalendarEventsQuery,
  CalendarEventsView,
  OperationsQuery,
  OperationsView,
  ScheduleAttentionView,
  PlanContextView,
  QualificationView,
  RecordAvailabilityCommand,
  RecordEmployeeQualificationCommand,
  SchedulingRulesView,
  SetSchedulingRulesCommand,
  SetStaffingRequirementCommand,
  StaffingRequirementView,
  StaffingView,
} from '@vakhta/contracts';
import {
  businessDateOf,
  eligibilityStatus,
  evaluatePlan,
  holidayRegion,
  holidaysBetween,
  planInstants,
} from '@vakhta/domain';
import {
  loadAbsenceEvents,
  loadAbsences,
  loadBirthdays,
  loadContextIntervals,
  loadReplacementNeeds,
  loadOperationalRequests,
  loadPreferences,
  loadPresence,
  loadRules,
  loadUnitMembership,
  monthContextRange,
  toPlannedIntervals,
} from './plan-context.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';

type RequirementRow = typeof zoneStaffingRequirements.$inferSelect;
type HoldingRow = typeof employeeQualifications.$inferSelect;
type AvailabilityRow = typeof employeeAvailability.$inferSelect;

/**
 * Staffing demand and qualification evidence (SC-01, SC-04, D-02). Configuration is audited;
 * coverage itself is a pure domain calculation performed where the plan is displayed or saved.
 */
@Injectable()
export class StaffingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}

  async view(siteId: string, orgUnitId: string): Promise<StaffingView> {
    return this.db.transaction(async (tx) => {
      const zoneIds = (
        await tx
          .select({ id: responsibilityZones.id })
          .from(responsibilityZones)
          .where(eq(responsibilityZones.orgUnitId, orgUnitId))
      ).map((zone) => zone.id);
      const requirements = zoneIds.length
        ? await tx
            .select()
            .from(zoneStaffingRequirements)
            .where(inArray(zoneStaffingRequirements.zoneId, zoneIds))
            .orderBy(asc(zoneStaffingRequirements.effectiveFrom))
        : [];
      const catalog = await tx
        .select()
        .from(qualifications)
        .where(eq(qualifications.siteId, siteId))
        .orderBy(asc(qualifications.code));
      const holdings = catalog.length
        ? await tx
            .select()
            .from(employeeQualifications)
            .where(
              inArray(
                employeeQualifications.qualificationId,
                catalog.map((item) => item.id),
              ),
            )
        : [];
      const rules = await loadRules(tx, siteId);
      const availability = await tx
        .select()
        .from(employeeAvailability)
        .orderBy(asc(employeeAvailability.validFrom));
      return {
        requirements: requirements.map((row) => this.toRequirementView(row)),
        qualifications: catalog.map((row) => ({
          id: row.id,
          siteId: row.siteId,
          code: row.code,
          name: row.name,
          isActive: row.isActive,
        })),
        holdings: holdings.map((row) => this.toHoldingView(row)),
        rules: { siteId, ...rules },
        availability: availability.map((row) => this.toAvailabilityView(row)),
      };
    });
  }

  async rules(siteId: string): Promise<SchedulingRulesView> {
    return { siteId, ...(await loadRules(this.db, siteId)) };
  }

  /** One row per site; every change is audited with the previous values (D-03). */
  async setRules(cmd: SetSchedulingRulesCommand, actor: Actor): Promise<SchedulingRulesView> {
    return this.db.transaction(async (tx) => {
      const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, cmd.siteId));
      if (!site) throw new DomainError('SITE_NOT_FOUND', 404, 'Site not found');
      const before = await loadRules(tx, cmd.siteId);
      const values = {
        minRestMinutes: cmd.minRestMinutes,
        maxMonthMinutes: cmd.maxMonthMinutes,
        restSeverity: cmd.restSeverity,
        hoursSeverity: cmd.hoursSeverity,
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      await tx
        .insert(siteSchedulingRules)
        .values({ siteId: cmd.siteId, ...values })
        .onConflictDoUpdate({ target: siteSchedulingRules.siteId, set: values });
      await this.audit.record(tx, {
        actor,
        action: 'staffing.rules.set',
        objectType: 'site',
        objectId: cmd.siteId,
        before: { ...before },
        after: { ...cmd },
      });
      return { siteId: cmd.siteId, ...(await loadRules(tx, cmd.siteId)) };
    });
  }

  async recordAvailability(
    cmd: RecordAvailabilityCommand,
    actor: Actor,
  ): Promise<EmployeeAvailabilityView> {
    return this.db.transaction(async (tx) => {
      const [employee] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, cmd.employeeId));
      if (!employee) throw new DomainError('EMPLOYEE_NOT_FOUND', 404, 'Employee not found');
      const [row] = await tx
        .insert(employeeAvailability)
        .values({
          employeeId: cmd.employeeId,
          kind: cmd.kind,
          weekday: cmd.weekday ?? null,
          date: cmd.date ?? null,
          validFrom: cmd.validFrom,
          validTo: cmd.validTo ?? null,
          note: cmd.note ?? null,
          recordedBy: actor.id,
        })
        .returning();
      if (!row) throw new Error('employee_availability: insert returned no row');
      await this.audit.record(tx, {
        actor,
        action: 'staffing.availability.record',
        objectType: 'employee',
        objectId: cmd.employeeId,
        after: { kind: cmd.kind, weekday: cmd.weekday ?? null, date: cmd.date ?? null },
      });
      return this.toAvailabilityView(row);
    });
  }

  async removeAvailability(id: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(employeeAvailability)
        .where(eq(employeeAvailability.id, id));
      if (!row) throw new DomainError('AVAILABILITY_NOT_FOUND', 404, 'Record not found');
      await tx.delete(employeeAvailability).where(eq(employeeAvailability.id, id));
      await this.audit.record(tx, {
        actor,
        action: 'staffing.availability.remove',
        objectType: 'employee',
        objectId: row.employeeId,
        before: { kind: row.kind, weekday: row.weekday, date: row.date },
      });
    });
  }

  async availabilityEmployee(id: string): Promise<string> {
    const [row] = await this.db
      .select({ employeeId: employeeAvailability.employeeId })
      .from(employeeAvailability)
      .where(eq(employeeAvailability.id, id));
    if (!row) throw new DomainError('AVAILABILITY_NOT_FOUND', 404, 'Record not found');
    return row.employeeId;
  }

  /** Context for local plan evaluation in the calendar: other plans, absences, membership. */
  async context(siteId: string, orgUnitId: string, periodMonth: string): Promise<PlanContextView> {
    const range = monthContextRange(periodMonth);
    return this.db.transaction(async (tx) => {
      const intervals = await loadContextIntervals(tx, {
        siteId,
        from: range.from,
        to: range.to,
        exclude: { orgUnitId, periodMonth },
      });
      const absences = await loadAbsences(tx, { from: range.from, to: range.to });
      const membership = await loadUnitMembership(tx, siteId);
      return {
        intervals: intervals.map((row) => ({
          employeeId: row.employeeId,
          businessDate: row.businessDate,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
          orgUnitId: row.orgUnitId,
          status: row.status,
        })),
        absences,
        otherUnitEmployees: membership.filter((member) => member.orgUnitId !== orgUnitId),
      };
    });
  }

  /** Holidays of the site region, birthdays, absences and replacement needs for a date range. */
  async events(query: CalendarEventsQuery): Promise<CalendarEventsView> {
    return this.db.transaction(async (tx) => {
      const [site] = await tx
        .select({ timezone: sites.timezone })
        .from(sites)
        .where(eq(sites.id, query.siteId));
      const region = holidayRegion(site?.timezone ?? 'UTC');
      const members = (await loadUnitMembership(tx, query.siteId))
        .filter((member) => member.orgUnitId === query.orgUnitId)
        .map((member) => member.employeeId);
      const planned = await tx
        .select({ employeeId: shiftAssignments.employeeId })
        .from(shiftAssignments)
        .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
        .where(
          and(
            eq(scheduleVersions.siteId, query.siteId),
            eq(scheduleVersions.orgUnitId, query.orgUnitId),
            inArray(scheduleVersions.status, ['DRAFT', 'IN_REVIEW', 'PUBLISHED']),
            eq(shiftAssignments.status, 'PLANNED'),
          ),
        );
      const people = [...new Set([...members, ...planned.map((row) => row.employeeId)])];
      return {
        region,
        holidays: holidaysBetween(region, query.from, query.to),
        birthdays: await loadBirthdays(tx, { employeeIds: people, from: query.from, to: query.to }),
        absences: await loadAbsenceEvents(tx, {
          employeeIds: people,
          from: query.from,
          to: query.to,
        }),
        replacements: await loadReplacementNeeds(tx, {
          siteId: query.siteId,
          orgUnitId: query.orgUnitId,
          from: query.from,
          to: query.to,
        }),
      };
    });
  }

  /** Today's holiday, birthdays and sick leaves plus the week's replacement needs (Overview). */
  async attention(siteId: string, now: Date = new Date()): Promise<ScheduleAttentionView> {
    return this.db.transaction(async (tx) => {
      const [site] = await tx
        .select({ timezone: sites.timezone })
        .from(sites)
        .where(eq(sites.id, siteId));
      const timezone = site?.timezone ?? 'UTC';
      const today = businessDateOf(now, timezone);
      const weekEnd = new Date(`${today}T00:00:00Z`);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
      const to = weekEnd.toISOString().slice(0, 10);
      const people = [...new Set((await loadUnitMembership(tx, siteId)).map((m) => m.employeeId))];
      const absences = await loadAbsenceEvents(tx, { employeeIds: people, from: today, to: today });
      return {
        today,
        holiday: holidaysBetween(holidayRegion(timezone), today, today)[0]?.code ?? null,
        birthdaysToday: (
          await loadBirthdays(tx, { employeeIds: people, from: today, to: today })
        ).map((row) => row.employeeId),
        onSickLeave: absences.filter((item) => item.type === 'SICK' && item.status === 'APPROVED'),
        replacements: await loadReplacementNeeds(tx, { siteId, from: today, to }),
      };
    });
  }

  /** Presence evidence and request context of the unit's people for a date range (#17). */
  async operations(query: OperationsQuery, now: Date = new Date()): Promise<OperationsView> {
    return this.db.transaction(async (tx) => ({
      fetchedAt: now.toISOString(),
      presence: await loadPresence(tx, query, now),
      requests: await loadOperationalRequests(tx, query),
    }));
  }

  /**
   * Everyone active on the site evaluated for one zone, template and date (SC-02): own-unit
   * people first, eligible before warned before blocked; reasons stay visible. The commit
   * re-evaluates, so a stale list cannot create a conflict.
   */
  async candidates(query: CandidatesQuery): Promise<CandidateView[]> {
    return this.db.transaction(async (tx) => {
      const [site] = await tx
        .select({ timezone: sites.timezone })
        .from(sites)
        .where(eq(sites.id, query.siteId));
      if (!site) throw new DomainError('SITE_NOT_FOUND', 404, 'Site not found');
      const [template] = await tx
        .select()
        .from(shiftTemplates)
        .where(
          and(eq(shiftTemplates.id, query.templateId), eq(shiftTemplates.siteId, query.siteId)),
        );
      if (!template) throw new DomainError('TEMPLATE_NOT_FOUND', 404, 'Template not found');
      const plan = planInstants(query.businessDate, template, site.timezone);
      const people = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.status, 'ACTIVE'));
      const ids = people.map((person) => person.id);
      const range = monthContextRange(query.businessDate.slice(0, 7));
      const context = toPlannedIntervals(
        await loadContextIntervals(tx, {
          siteId: query.siteId,
          employeeIds: ids,
          from: range.from,
          to: range.to,
        }),
      );
      const absences = await loadAbsences(tx, { employeeIds: ids, from: range.from, to: range.to });
      const preferences = await loadPreferences(tx, ids);
      const rules = await loadRules(tx, query.siteId);
      const requirements = (
        await tx
          .select()
          .from(zoneStaffingRequirements)
          .where(eq(zoneStaffingRequirements.zoneId, query.zoneId))
      ).map((row) => ({
        id: row.id,
        zoneId: row.zoneId,
        templateId: row.templateId,
        requiredCount: row.requiredCount,
        qualificationId: row.qualificationId,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
      }));
      const holdings = ids.length
        ? await tx
            .select()
            .from(employeeQualifications)
            .where(inArray(employeeQualifications.employeeId, ids))
        : [];
      const membership = new Map(
        (await loadUnitMembership(tx, query.siteId)).map((row) => [row.employeeId, row.orgUnitId]),
      );
      const month = query.businessDate.slice(0, 7);
      const rank = { ELIGIBLE: 0, WARNING: 1, BLOCKED: 2 } as const;
      return ids
        .map((employeeId) => {
          const reasons = evaluatePlan({
            proposed: [
              {
                employeeId,
                businessDate: query.businessDate,
                startMs: plan.planStartAt.getTime(),
                endMs: plan.planEndAt.getTime(),
                templateId: query.templateId,
                zoneId: query.zoneId,
                orgUnitId: query.orgUnitId,
              },
            ],
            context: context.filter((item) => item.employeeId === employeeId),
            absences,
            preferences,
            rules,
            staffing: { requirements, holdings },
            month,
          });
          const orgUnitId = membership.get(employeeId) ?? null;
          return {
            employeeId,
            orgUnitId,
            ownUnit: orgUnitId === query.orgUnitId,
            status: eligibilityStatus(reasons),
            reasons,
          };
        })
        .sort((a, b) => Number(b.ownUnit) - Number(a.ownUnit) || rank[a.status] - rank[b.status]);
    });
  }

  async createQualification(
    cmd: CreateQualificationCommand,
    actor: Actor,
  ): Promise<QualificationView> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(qualifications)
        .where(and(eq(qualifications.siteId, cmd.siteId), eq(qualifications.code, cmd.code)));
      if (existing)
        throw new DomainError(
          'QUALIFICATION_EXISTS',
          409,
          `Qualification ${cmd.code} already exists on this site`,
        );
      const [row] = await tx
        .insert(qualifications)
        .values({ siteId: cmd.siteId, code: cmd.code, name: cmd.name })
        .returning();
      if (!row) throw new Error('qualifications: insert returned no row');
      await this.audit.record(tx, {
        actor,
        action: 'staffing.qualification.create',
        objectType: 'qualification',
        objectId: row.id,
        after: { siteId: row.siteId, code: row.code, name: row.name },
      });
      return { id: row.id, siteId: row.siteId, code: row.code, name: row.name, isActive: true };
    });
  }

  async recordHolding(
    cmd: RecordEmployeeQualificationCommand,
    actor: Actor,
  ): Promise<EmployeeQualificationView> {
    return this.db.transaction(async (tx) => {
      const [employee] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, cmd.employeeId));
      if (!employee) throw new DomainError('EMPLOYEE_NOT_FOUND', 404, 'Employee not found');
      const [qualification] = await tx
        .select()
        .from(qualifications)
        .where(eq(qualifications.id, cmd.qualificationId));
      if (!qualification)
        throw new DomainError('QUALIFICATION_NOT_FOUND', 404, 'Qualification not found');
      const [row] = await tx
        .insert(employeeQualifications)
        .values({
          employeeId: cmd.employeeId,
          qualificationId: cmd.qualificationId,
          validFrom: cmd.validFrom,
          validUntil: cmd.validUntil ?? null,
          note: cmd.note ?? null,
          recordedBy: actor.id,
        })
        .returning();
      if (!row) throw new Error('employee_qualifications: insert returned no row');
      await this.audit.record(tx, {
        actor,
        action: 'staffing.qualification.record',
        objectType: 'employee',
        objectId: cmd.employeeId,
        after: {
          qualificationId: cmd.qualificationId,
          validFrom: cmd.validFrom,
          validUntil: cmd.validUntil ?? null,
        },
      });
      return this.toHoldingView(row);
    });
  }

  async removeHolding(id: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(employeeQualifications)
        .where(eq(employeeQualifications.id, id));
      if (!row) throw new DomainError('QUALIFICATION_NOT_FOUND', 404, 'Record not found');
      await tx.delete(employeeQualifications).where(eq(employeeQualifications.id, id));
      await this.audit.record(tx, {
        actor,
        action: 'staffing.qualification.remove',
        objectType: 'employee',
        objectId: row.employeeId,
        before: {
          qualificationId: row.qualificationId,
          validFrom: row.validFrom,
          validUntil: row.validUntil,
        },
      });
    });
  }

  /** Creates or replaces one requirement row; the zone, template and qualification must match the site. */
  async setRequirement(
    cmd: SetStaffingRequirementCommand,
    actor: Actor,
  ): Promise<StaffingRequirementView> {
    return this.db.transaction(async (tx) => {
      const [zone] = await tx
        .select()
        .from(responsibilityZones)
        .where(eq(responsibilityZones.id, cmd.zoneId));
      if (!zone) throw new DomainError('ZONE_NOT_FOUND', 404, 'Zone not found');
      const [template] = await tx
        .select()
        .from(shiftTemplates)
        .where(and(eq(shiftTemplates.id, cmd.templateId), eq(shiftTemplates.siteId, zone.siteId)));
      if (!template)
        throw new DomainError('TEMPLATE_NOT_FOUND', 422, 'Template does not belong to the site');
      if (cmd.qualificationId) {
        const [qualification] = await tx
          .select()
          .from(qualifications)
          .where(
            and(eq(qualifications.id, cmd.qualificationId), eq(qualifications.siteId, zone.siteId)),
          );
        if (!qualification)
          throw new DomainError(
            'QUALIFICATION_NOT_FOUND',
            422,
            'Qualification does not belong to the site',
          );
      }
      const values = {
        zoneId: cmd.zoneId,
        templateId: cmd.templateId,
        requiredCount: cmd.requiredCount,
        qualificationId: cmd.qualificationId ?? null,
        effectiveFrom: cmd.effectiveFrom,
        effectiveTo: cmd.effectiveTo ?? null,
        note: cmd.note ?? null,
        updatedAt: new Date(),
      };
      let before: RequirementRow | undefined;
      let row: RequirementRow | undefined;
      if (cmd.id) {
        [before] = await tx
          .select()
          .from(zoneStaffingRequirements)
          .where(eq(zoneStaffingRequirements.id, cmd.id));
        if (!before || before.zoneId !== cmd.zoneId)
          throw new DomainError('REQUIREMENT_NOT_FOUND', 404, 'Requirement not found');
        [row] = await tx
          .update(zoneStaffingRequirements)
          .set(values)
          .where(eq(zoneStaffingRequirements.id, cmd.id))
          .returning();
      } else {
        [row] = await tx
          .insert(zoneStaffingRequirements)
          .values({ ...values, createdBy: actor.id })
          .returning();
      }
      if (!row) throw new Error('zone_staffing_requirements: write returned no row');
      await this.audit.record(tx, {
        actor,
        action: 'staffing.requirement.set',
        objectType: 'zone',
        objectId: cmd.zoneId,
        before: before ? this.toRequirementView(before) : null,
        after: this.toRequirementView(row),
      });
      return this.toRequirementView(row);
    });
  }

  async removeRequirement(id: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(zoneStaffingRequirements)
        .where(eq(zoneStaffingRequirements.id, id));
      if (!row) throw new DomainError('REQUIREMENT_NOT_FOUND', 404, 'Requirement not found');
      await tx.delete(zoneStaffingRequirements).where(eq(zoneStaffingRequirements.id, id));
      await this.audit.record(tx, {
        actor,
        action: 'staffing.requirement.remove',
        objectType: 'zone',
        objectId: row.zoneId,
        before: this.toRequirementView(row),
      });
    });
  }

  /** Site of a zone, for scope checks before a write. */
  async zoneScope(zoneId: string, tx: DbOrTx = this.db) {
    const [zone] = await tx
      .select({ siteId: responsibilityZones.siteId, orgUnitId: responsibilityZones.orgUnitId })
      .from(responsibilityZones)
      .where(eq(responsibilityZones.id, zoneId));
    if (!zone) throw new DomainError('ZONE_NOT_FOUND', 404, 'Zone not found');
    return zone;
  }

  async requirementScope(id: string) {
    const [row] = await this.db
      .select({ zoneId: zoneStaffingRequirements.zoneId })
      .from(zoneStaffingRequirements)
      .where(eq(zoneStaffingRequirements.id, id));
    if (!row) throw new DomainError('REQUIREMENT_NOT_FOUND', 404, 'Requirement not found');
    return this.zoneScope(row.zoneId);
  }

  async holdingSite(id: string) {
    const [row] = await this.db
      .select({ siteId: qualifications.siteId })
      .from(employeeQualifications)
      .innerJoin(qualifications, eq(qualifications.id, employeeQualifications.qualificationId))
      .where(eq(employeeQualifications.id, id));
    if (!row) throw new DomainError('QUALIFICATION_NOT_FOUND', 404, 'Record not found');
    return row.siteId;
  }

  async qualificationSite(id: string) {
    const [row] = await this.db
      .select({ siteId: qualifications.siteId })
      .from(qualifications)
      .where(eq(qualifications.id, id));
    if (!row) throw new DomainError('QUALIFICATION_NOT_FOUND', 404, 'Qualification not found');
    return row.siteId;
  }

  private toRequirementView(row: RequirementRow): StaffingRequirementView {
    return {
      id: row.id,
      zoneId: row.zoneId,
      templateId: row.templateId,
      requiredCount: row.requiredCount,
      qualificationId: row.qualificationId,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      note: row.note,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toAvailabilityView(row: AvailabilityRow): EmployeeAvailabilityView {
    return {
      id: row.id,
      employeeId: row.employeeId,
      kind: row.kind,
      weekday: row.weekday,
      date: row.date,
      validFrom: row.validFrom,
      validTo: row.validTo,
      note: row.note,
    };
  }

  private toHoldingView(row: HoldingRow): EmployeeQualificationView {
    return {
      id: row.id,
      employeeId: row.employeeId,
      qualificationId: row.qualificationId,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      note: row.note,
      recordedAt: row.recordedAt.toISOString(),
    };
  }
}
