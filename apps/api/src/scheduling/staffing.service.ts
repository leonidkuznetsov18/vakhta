import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  employeeQualifications,
  employees,
  eq,
  inArray,
  qualifications,
  responsibilityZones,
  shiftTemplates,
  zoneStaffingRequirements,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import type {
  CreateQualificationCommand,
  EmployeeQualificationView,
  QualificationView,
  RecordEmployeeQualificationCommand,
  SetStaffingRequirementCommand,
  StaffingRequirementView,
  StaffingView,
} from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';

type RequirementRow = typeof zoneStaffingRequirements.$inferSelect;
type HoldingRow = typeof employeeQualifications.$inferSelect;

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
      };
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
