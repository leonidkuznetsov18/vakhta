import { Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  and,
  assignmentAcknowledgements,
  employees,
  eq,
  orgUnits,
  positions,
  responsibilityZones,
  shiftAssignments,
  shiftTemplates,
  sites,
  sql,
  teams,
  asc,
  type Database,
} from '@vakhta/db';
import type { ScheduleExportQuery } from '@vakhta/contracts';
import { DEFAULT_LOCALE, formatLocal, hasAnyRole, type WebRole } from '@vakhta/domain';
import { messages, type Locale } from '@vakhta/i18n';
import { webUserActor, type WebUser } from '../auth/web-auth.guard.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';
import { ScheduleService } from './schedule.service.js';

const EXPORT_LIMIT = 20_000;
const EMPLOYEE_NAME_READERS: WebRole[] = [
  'ADMIN',
  'HR',
  'PRODUCTION_HEAD',
  'PLANNER',
  'SHIFT_MASTER',
];
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Explicit cell types preserve formula-looking text as literal values, never formulas or links. */
function worksheet(rows: readonly (readonly (string | number | null)[])[]) {
  return XLSX.utils.aoa_to_sheet(
    rows.map((row) =>
      row.map((value): XLSX.CellObject =>
        typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: value ?? '' },
      ),
    ),
  );
}

/** Complete saved-version output. The route applies Schedule's existing read/scope permission. */
@Injectable()
export class ScheduleExportService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly schedules: ScheduleService,
    private readonly audit: AuditLog,
  ) {}

  async export(
    versionId: string,
    query: ScheduleExportQuery,
    user: WebUser,
    locale: Locale = DEFAULT_LOCALE,
    now = new Date(),
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const all = messages(locale);
    const t = all.scheduleExport;
    const namesAllowed = hasAnyRole(user.grants, EMPLOYEE_NAME_READERS);
    return this.db.transaction(
      async (tx) => {
        const version = await this.schedules.requireVersion(versionId, tx);
        if (version.revision !== query.expectedRevision)
          throw new DomainError(
            'SCHEDULE_REVISION_CONFLICT',
            409,
            'The saved schedule changed before export',
          );
        const [scope] = await tx
          .select({ siteName: sites.name, timezone: sites.timezone, unitName: orgUnits.name })
          .from(orgUnits)
          .innerJoin(sites, eq(sites.id, orgUnits.siteId))
          .where(and(eq(orgUnits.id, version.orgUnitId), eq(sites.id, version.siteId)));
        if (!scope) throw new Error('Schedule site/unit is unavailable');
        const [count] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(shiftAssignments)
          .where(eq(shiftAssignments.scheduleVersionId, versionId));
        if ((count?.total ?? 0) > EXPORT_LIMIT)
          throw new DomainError(
            'SCHEDULE_EXPORT_TOO_LARGE',
            422,
            `This saved version contains ${count?.total} assignments; the export limit is ${EXPORT_LIMIT}.`,
          );
        const rows = await tx
          .select({
            a: shiftAssignments,
            employeeName: namesAllowed ? employees.fullName : sql<string | null>`null`,
            zoneName: responsibilityZones.name,
            teamName: teams.name,
            positionName: positions.name,
            templateCode: shiftTemplates.code,
            acknowledgedAt: assignmentAcknowledgements.acknowledgedAt,
          })
          .from(shiftAssignments)
          .leftJoin(employees, eq(employees.id, shiftAssignments.employeeId))
          .leftJoin(responsibilityZones, eq(responsibilityZones.id, shiftAssignments.zoneId))
          .leftJoin(teams, eq(teams.id, shiftAssignments.teamId))
          .leftJoin(positions, eq(positions.id, shiftAssignments.positionId))
          .leftJoin(shiftTemplates, eq(shiftTemplates.id, shiftAssignments.templateId))
          .leftJoin(
            assignmentAcknowledgements,
            eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
          )
          .where(eq(shiftAssignments.scheduleVersionId, versionId))
          .orderBy(
            asc(shiftAssignments.businessDate),
            asc(shiftAssignments.employeeId),
            asc(shiftAssignments.id),
          );
        const duration = (start: Date, end: Date) => (end.getTime() - start.getTime()) / 60_000;
        const local = (instant: Date) => {
          const value = formatLocal(instant, scope.timezone);
          return `${value.local} ${value.offset}`;
        };
        const plannedMinutes = rows.reduce(
          (sum, { a }) => sum + (a.status === 'PLANNED' ? duration(a.planStartAt, a.planEndAt) : 0),
          0,
        );
        const metadata = [
          [t.scope, t.wholeVersion],
          [t.evidence, t.planOnly],
          [t.labels, `${t.currentLabels}${namesAllowed ? '' : ` ${t.idsOnly}`}`],
          [t.versionId, version.id],
          [t.versionNo, version.versionNo],
          [t.revision, version.revision],
          [
            t.versionStatus,
            `${version.status} · ${all.admin.schedule.statuses[version.status]}${version.status === 'DRAFT' || version.status === 'IN_REVIEW' ? ` — ${t.unpublished}` : ''}`,
          ],
          [t.month, version.periodMonth],
          [t.siteId, version.siteId],
          [t.siteName, scope.siteName],
          [t.unitId, version.orgUnitId],
          [t.unitName, scope.unitName],
          [t.timezone, scope.timezone],
          [t.generatedAt, now.toISOString()],
          [t.createdAt, version.createdAt.toISOString()],
          [t.publishedAt, version.publishedAt?.toISOString() ?? null],
          [t.rows, rows.length],
          [t.plannedMinutes, plannedMinutes],
        ];
        const headers = [
          t.assignmentId,
          t.versionId,
          t.employeeId,
          t.employeeName,
          t.businessDate,
          t.startUtc,
          t.endUtc,
          t.startLocal,
          t.endLocal,
          t.timezone,
          t.duration,
          t.status,
          t.kind,
          t.unitId,
          t.zoneId,
          t.zoneName,
          t.teamId,
          t.teamName,
          t.positionId,
          t.positionName,
          t.templateId,
          t.templateCode,
          t.acknowledgedAt,
        ];
        const data = rows.map(
          ({ a, employeeName, zoneName, teamName, positionName, templateCode, acknowledgedAt }) => [
            a.id,
            a.scheduleVersionId,
            a.employeeId,
            employeeName,
            a.businessDate,
            a.planStartAt.toISOString(),
            a.planEndAt.toISOString(),
            local(a.planStartAt),
            local(a.planEndAt),
            scope.timezone,
            duration(a.planStartAt, a.planEndAt),
            a.status,
            a.kind,
            a.orgUnitId,
            a.zoneId,
            zoneName,
            a.teamId,
            teamName,
            a.positionId,
            positionName,
            a.templateId,
            templateCode,
            acknowledgedAt?.toISOString() ?? null,
          ],
        );
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, worksheet(metadata), t.metadataSheet);
        XLSX.utils.book_append_sheet(book, worksheet([headers, ...data]), t.assignmentsSheet);
        const output: unknown = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
        if (!Buffer.isBuffer(output))
          throw new Error('Schedule XLSX export did not produce a Buffer');
        await this.audit.record(tx, {
          actor: webUserActor(user),
          action: 'schedule.version.export',
          objectType: 'schedule_version',
          objectId: versionId,
          after: {
            format: 'xlsx',
            revision: version.revision,
            scope: 'WHOLE_SAVED_VERSION',
            rows: rows.length,
            employeeNamesIncluded: namesAllowed,
            generatedAt: now.toISOString(),
          },
        });
        return {
          body: output,
          contentType: XLSX_CONTENT_TYPE,
          filename: `vakhta-schedule-${version.periodMonth}-v${version.versionNo}-r${version.revision}-${version.id}.xlsx`,
        };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
}
