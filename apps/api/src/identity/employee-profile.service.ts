import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  authUser,
  desc,
  employeePositions,
  employees,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  sql,
  lte,
  or,
  orgUnits,
  positions,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
  teams,
  webUserRoles,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { businessDateOf, grantCovers, profileZone, unitMasterState } from '@vakhta/domain';
import { EmployeeProfileView } from '@vakhta/contracts';
import type { WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { DATABASE } from '../infra/database.module.js';
import { EmployeesService } from './employees.service.js';
import { employeeProfileAccess } from './employee-profile-access.js';
import { EmployeeCompensationService } from './employee-compensation.service.js';

@Injectable()
export class EmployeeProfileService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly directory: EmployeesService,
    private readonly compensation: EmployeeCompensationService,
  ) {}

  async get(id: string, user: WebUser, now = new Date()): Promise<EmployeeProfileView> {
    return this.db.transaction(
      async (tx) => {
        const access = await employeeProfileAccess(tx, id, user, undefined, now);
        const [employee] = await tx.select().from(employees).where(eq(employees.id, id));
        if (!employee) throw new DomainError('EMPLOYEE_NOT_FOUND', 404, 'Employee not found');
        const [assignment] = await tx
          .select({
            record: employeePositions,
            unit: orgUnits,
            position: positions,
            team: teams,
            site: sites,
          })
          .from(employeePositions)
          .innerJoin(orgUnits, eq(orgUnits.id, employeePositions.orgUnitId))
          .innerJoin(positions, eq(positions.id, employeePositions.positionId))
          .innerJoin(sites, eq(sites.id, orgUnits.siteId))
          .leftJoin(teams, eq(teams.id, employeePositions.teamId))
          .where(
            and(
              eq(employeePositions.employeeId, id),
              lte(employeePositions.validFrom, now),
              or(isNull(employeePositions.validTo), gt(employeePositions.validTo, now)),
            ),
          )
          .orderBy(desc(employeePositions.validFrom))
          .limit(1);
        const timezone = assignment?.site.timezone ?? 'Europe/Kyiv';
        const today = businessDateOf(now, timezone);
        const month = today.slice(0, 7);
        const master = await this.master(tx, assignment?.unit ?? null, id, user);
        const published = assignment
          ? await tx
              .select({ id: scheduleVersions.id })
              .from(scheduleVersions)
              .where(
                and(
                  eq(scheduleVersions.orgUnitId, assignment.unit.id),
                  eq(scheduleVersions.periodMonth, month),
                  inArray(scheduleVersions.status, ['PUBLISHED', 'CLOSED']),
                ),
              )
              .limit(1)
          : [];
        const shifts = await tx
          .select({
            assignment: shiftAssignments,
            template: shiftTemplates,
            zone: responsibilityZones,
            timezone: sites.timezone,
          })
          .from(shiftAssignments)
          .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
          .innerJoin(shiftTemplates, eq(shiftTemplates.id, shiftAssignments.templateId))
          .innerJoin(sites, eq(sites.id, scheduleVersions.siteId))
          .leftJoin(responsibilityZones, eq(responsibilityZones.id, shiftAssignments.zoneId))
          .where(
            and(
              eq(shiftAssignments.employeeId, id),
              inArray(scheduleVersions.status, ['PUBLISHED', 'CLOSED']),
              eq(shiftAssignments.status, 'PLANNED'),
              or(
                sql`${shiftAssignments.businessDate}::text LIKE ${`${month}%`}`,
                gte(shiftAssignments.planStartAt, now),
              ),
            ),
          )
          .orderBy(asc(shiftAssignments.planStartAt));
        const zoneView = (zone: typeof responsibilityZones.$inferSelect | null) =>
          zone ? { id: zone.id, name: zone.name, available: zone.isActive } : null;
        const monthShifts = shifts.filter((row) => row.assignment.businessDate.startsWith(month));
        const next = shifts.filter((row) => row.assignment.planStartAt >= now).slice(0, 5);
        const [open] = await tx
          .select({ id: shiftSessions.id, zone: responsibilityZones })
          .from(shiftSessions)
          .leftJoin(responsibilityZones, eq(responsibilityZones.id, shiftSessions.zoneId))
          .where(
            and(
              eq(shiftSessions.employeeId, id),
              isNull(shiftSessions.endedAt),
              inArray(shiftSessions.state, [
                'PREPARATION',
                'WORKING',
                'CLEANING',
                'HANDOVER',
                'BREAK',
                'MEAL',
                'SERVICE_TIME',
                'DOWNTIME',
                'READY_TO_CLOSE',
              ]),
            ),
          )
          .limit(1);
        const history = await tx
          .select({
            record: employeePositions,
            unit: orgUnits.name,
            position: positions.name,
            master: employees.fullName,
          })
          .from(employeePositions)
          .innerJoin(orgUnits, eq(orgUnits.id, employeePositions.orgUnitId))
          .innerJoin(positions, eq(positions.id, employeePositions.positionId))
          .leftJoin(employees, eq(employees.id, employeePositions.managerEmployeeId))
          .where(eq(employeePositions.employeeId, id))
          .orderBy(desc(employeePositions.validFrom));
        const masterOf = await tx
          .select({ id: orgUnits.id, name: orgUnits.name })
          .from(orgUnits)
          .where(eq(orgUnits.masterEmployeeId, id));
        const linked = await this.directory.activeLinkByEmployee(id, tx);
        const base = this.directory.toView(
          employee,
          linked !== null,
          assignment
            ? {
                positionId: assignment.position.id,
                orgUnitId: assignment.unit.id,
                teamId: assignment.team?.id ?? null,
              }
            : null,
        );
        const { birthDate: _birthDate, ...safeEmployee } = base;
        return EmployeeProfileView.parse({
          employee: safeEmployee,
          version: employee.updatedAt.toISOString(),
          access: {
            ...access,
            statusEdit: access.personalEdit,
            personalEdit: access.personalEdit && employee.status !== 'TERMINATED',
            compensation:
              employee.status === 'TERMINATED' && access.compensation === 'WRITE'
                ? 'READ'
                : access.compensation,
          },
          birthDate:
            employee.birthDate && access.birthDate === 'DAY_MONTH'
              ? {
                  day: Number(employee.birthDate.slice(8)),
                  month: Number(employee.birthDate.slice(5, 7)),
                }
              : employee.birthDate,
          ...(access.maritalStatus ? { maritalStatus: employee.maritalStatus } : {}),
          avatarVersion: employee.avatarMediaId,
          work: {
            position: assignment
              ? { id: assignment.position.id, name: assignment.position.name }
              : null,
            unit: assignment ? { id: assignment.unit.id, name: assignment.unit.name } : null,
            team: assignment?.team ? { id: assignment.team.id, name: assignment.team.name } : null,
            master,
            masterOf,
            zone: profileZone({
              openShift: open ? { zone: zoneView(open.zone) } : null,
              nextShift: next[0] ? { zone: zoneView(next[0].zone) } : null,
              monthZones: monthShifts.flatMap((row) => {
                const zone = zoneView(row.zone);
                return zone ? [zone] : [];
              }),
            }),
            history: history.map((row) => ({
              id: row.record.id,
              position: row.position,
              unit: row.unit,
              master: row.master,
              validFrom: row.record.validFrom.toISOString(),
              validTo: row.record.validTo?.toISOString() ?? null,
            })),
          },
          schedule: {
            month,
            timezone,
            published: published.length > 0 || monthShifts.length > 0,
            shiftCount: monthShifts.length,
            plannedMinutes: monthShifts.reduce(
              (sum, row) =>
                sum +
                (row.assignment.planEndAt.getTime() - row.assignment.planStartAt.getTime()) /
                  60_000,
              0,
            ),
            nextShifts: next.map((row) => ({
              id: row.assignment.id,
              date: row.assignment.businessDate,
              startAt: row.assignment.planStartAt.toISOString(),
              endAt: row.assignment.planEndAt.toISOString(),
              template: row.template.name,
              timezone: row.timezone,
              zone: zoneView(row.zone),
            })),
          },
          ...(access.compensation !== 'NONE'
            ? { compensation: await this.compensation.read(tx, id, today) }
            : {}),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  private async master(
    tx: DbOrTx,
    unit: typeof orgUnits.$inferSelect | null,
    employeeId: string,
    user: WebUser,
  ) {
    const [employee] = unit?.masterEmployeeId
      ? await tx.select().from(employees).where(eq(employees.id, unit.masterEmployeeId))
      : [];
    const grants = employee?.email
      ? await tx
          .select({
            role: webUserRoles.role,
            scopeType: webUserRoles.scopeType,
            scopeId: webUserRoles.scopeId,
          })
          .from(webUserRoles)
          .innerJoin(authUser, eq(authUser.id, webUserRoles.userId))
          .where(and(eq(authUser.email, employee.email), eq(webUserRoles.role, 'SHIFT_MASTER')))
      : [];
    let canOpen = false;
    if (employee) {
      try {
        await employeeProfileAccess(tx, employee.id, user);
        canOpen = true;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
      }
    }
    return {
      employee: employee ? { id: employee.id, name: employee.fullName } : null,
      ...unitMasterState({
        masterId: employee?.id ?? null,
        masterStatus: employee?.status ?? null,
        employeeId,
        masterGrantCoversUnit:
          !!unit &&
          grants.some((grant) => grantCovers(grant, { orgUnitId: unit.id, siteId: unit.siteId })),
      }),
      canOpen,
    };
  }
}
