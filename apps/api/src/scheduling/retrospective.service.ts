import { Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  and,
  asc,
  desc,
  employees,
  eq,
  inArray,
  orgUnits,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  sites,
  type Database,
} from '@vakhta/db';
import type { RetrospectiveQuery, RetrospectiveRow, RetrospectiveView } from '@vakhta/contracts';
import { DEFAULT_LOCALE, hasAnyRole, type Locale } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import type { WebUser } from '../auth/web-auth.guard.js';
import { DATABASE } from '../infra/database.module.js';
import { latestBySlot, planSlotKey, sameSlotAssignments } from './plan-context.js';
import { EMPLOYEE_NAME_READERS, worksheet } from './schedule-export.service.js';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Retrospective report (SC-41): the effective published plan of a unit month next to the recorded
 * shift sessions and closed-shift summaries. Planned time, recorded work and unknown departure
 * stay separate; a shift without any session is "missing actuals", never a verdict.
 */
@Injectable()
export class RetrospectiveService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async view(query: RetrospectiveQuery, now: Date = new Date()): Promise<RetrospectiveView> {
    const [scope] = await this.db
      .select({ timezone: sites.timezone })
      .from(sites)
      .where(eq(sites.id, query.siteId));
    const [version] = await this.db
      .select()
      .from(scheduleVersions)
      .where(
        and(
          eq(scheduleVersions.siteId, query.siteId),
          eq(scheduleVersions.orgUnitId, query.orgUnitId),
          eq(scheduleVersions.periodMonth, query.periodMonth),
          eq(scheduleVersions.status, 'PUBLISHED'),
        ),
      )
      .orderBy(desc(scheduleVersions.versionNo))
      .limit(1);
    const base = {
      generatedAt: now.toISOString(),
      timezone: scope?.timezone ?? 'UTC',
      periodMonth: query.periodMonth,
      siteId: query.siteId,
      orgUnitId: query.orgUnitId,
    };
    if (!version) return { ...base, version: null, rows: [], totals: [] };
    const planned = await this.db
      .select()
      .from(shiftAssignments)
      .where(
        and(
          eq(shiftAssignments.scheduleVersionId, version.id),
          eq(shiftAssignments.status, 'PLANNED'),
        ),
      )
      .orderBy(asc(shiftAssignments.businessDate), asc(shiftAssignments.employeeId));
    const sessions = await this.recordedSessions(version.orgUnitId, planned);
    const rows: RetrospectiveRow[] = planned.map((a) => {
      const session = sessions.get(planSlotKey(a));
      const departure: RetrospectiveRow['departure'] = !session
        ? 'NONE'
        : session.endedAt && !session.autoCloseReason
          ? 'RECORDED'
          : 'UNKNOWN';
      return {
        assignmentId: a.id,
        employeeId: a.employeeId,
        businessDate: a.businessDate,
        zoneId: a.zoneId,
        plannedStartAt: a.planStartAt.toISOString(),
        plannedEndAt: a.planEndAt.toISOString(),
        plannedMinutes: Math.round((a.planEndAt.getTime() - a.planStartAt.getTime()) / 60_000),
        sessionId: session?.id ?? null,
        recordedStartAt: session?.startedAt?.toISOString() ?? null,
        recordedEndAt: session?.endedAt?.toISOString() ?? null,
        workMinutes: session?.workMinutes ?? null,
        totalMinutes: session?.totalMinutes ?? null,
        departure,
        autoCloseReason: session?.autoCloseReason ?? null,
      };
    });
    const totals = new Map<string, RetrospectiveView['totals'][number]>();
    for (const row of rows) {
      const total = totals.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        shifts: 0,
        plannedMinutes: 0,
        workMinutes: 0,
        recordedShifts: 0,
        unknownDepartures: 0,
        missingActuals: 0,
      };
      totals.set(row.employeeId, {
        ...total,
        shifts: total.shifts + 1,
        plannedMinutes: total.plannedMinutes + row.plannedMinutes,
        workMinutes: total.workMinutes + (row.workMinutes ?? 0),
        recordedShifts: total.recordedShifts + (row.sessionId ? 1 : 0),
        unknownDepartures: total.unknownDepartures + (row.departure === 'UNKNOWN' ? 1 : 0),
        missingActuals: total.missingActuals + (row.departure === 'NONE' ? 1 : 0),
      });
    }
    return {
      ...base,
      version: {
        id: version.id,
        versionNo: version.versionNo,
        publishedAt: version.publishedAt?.toISOString() ?? null,
      },
      rows,
      totals: [...totals.values()],
    };
  }

  /** The latest recorded shift of each planned slot, whichever version it was recorded under. */
  private async recordedSessions(
    orgUnitId: string,
    planned: readonly (typeof shiftAssignments.$inferSelect)[],
  ) {
    const first = planned[0];
    const last = planned.at(-1);
    if (!first || !last) return new Map<string, never>();
    const rows = await this.db
      .select({
        employeeId: shiftAssignments.employeeId,
        businessDate: shiftAssignments.businessDate,
        id: shiftSessions.id,
        startedAt: shiftSessions.startedAt,
        endedAt: shiftSessions.endedAt,
        autoCloseReason: shiftSessions.autoCloseReason,
        workMinutes: shiftSummaries.workMinutes,
        totalMinutes: shiftSummaries.totalMinutes,
      })
      .from(shiftSessions)
      .innerJoin(shiftAssignments, eq(shiftAssignments.id, shiftSessions.assignmentId))
      .leftJoin(shiftSummaries, eq(shiftSummaries.shiftSessionId, shiftSessions.id))
      .where(
        sameSlotAssignments({
          orgUnitId,
          employeeIds: [...new Set(planned.map((row) => row.employeeId))],
          from: first.businessDate,
          to: last.businessDate,
        }),
      )
      .orderBy(desc(shiftSessions.createdAt));
    return latestBySlot(rows);
  }

  /** Formula-safe XLSX with the scope, timezone, version identity and creation time stated. */
  async export(
    query: RetrospectiveQuery,
    user: WebUser,
    locale: Locale = DEFAULT_LOCALE,
    now: Date = new Date(),
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const t = messages(locale).scheduleExport;
    const view = await this.view(query, now);
    const namesAllowed = hasAnyRole(user.grants, EMPLOYEE_NAME_READERS);
    const [scope] = await this.db
      .select({ siteName: sites.name, unitName: orgUnits.name })
      .from(orgUnits)
      .innerJoin(sites, eq(sites.id, orgUnits.siteId))
      .where(eq(orgUnits.id, query.orgUnitId));
    const people = namesAllowed
      ? await this.db
          .select({ id: employees.id, fullName: employees.fullName })
          .from(employees)
          .where(
            view.totals.length > 0
              ? inArray(
                  employees.id,
                  view.totals.map((row) => row.employeeId),
                )
              : eq(employees.id, query.orgUnitId),
          )
      : [];
    const name = (id: string) => people.find((row) => row.id === id)?.fullName ?? null;
    const metadata = [
      [t.scope, t.retrospectiveScope],
      [t.month, view.periodMonth],
      [t.siteId, view.siteId],
      [t.siteName, scope?.siteName ?? null],
      [t.unitId, view.orgUnitId],
      [t.unitName, scope?.unitName ?? null],
      [t.timezone, view.timezone],
      [t.versionId, view.version?.id ?? null],
      [t.versionNo, view.version?.versionNo ?? null],
      [t.publishedAt, view.version?.publishedAt ?? null],
      [t.generatedAt, view.generatedAt],
      [t.labels, `${t.currentLabels}${namesAllowed ? '' : ` ${t.idsOnly}`}`],
      [t.rows, view.rows.length],
    ];
    const headers = [
      t.assignmentId,
      t.employeeId,
      t.employeeName,
      t.businessDate,
      t.zoneId,
      t.startUtc,
      t.endUtc,
      t.duration,
      t.sessionId,
      t.recordedStart,
      t.recordedEnd,
      t.workMinutes,
      t.totalMinutes,
      t.departure,
      t.autoCloseReason,
    ];
    const data = view.rows.map((row) => [
      row.assignmentId,
      row.employeeId,
      name(row.employeeId),
      row.businessDate,
      row.zoneId,
      row.plannedStartAt,
      row.plannedEndAt,
      row.plannedMinutes,
      row.sessionId,
      row.recordedStartAt,
      row.recordedEndAt,
      row.workMinutes,
      row.totalMinutes,
      row.departure,
      row.autoCloseReason,
    ]);
    const totalsHeaders = [
      t.employeeId,
      t.employeeName,
      t.shifts,
      t.plannedMinutes,
      t.workMinutes,
      t.recordedShifts,
      t.unknownDepartures,
      t.missingActuals,
    ];
    const totals = view.totals.map((row) => [
      row.employeeId,
      name(row.employeeId),
      row.shifts,
      row.plannedMinutes,
      row.workMinutes,
      row.recordedShifts,
      row.unknownDepartures,
      row.missingActuals,
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, worksheet(metadata), t.metadataSheet);
    XLSX.utils.book_append_sheet(book, worksheet([headers, ...data]), t.retrospectiveSheet);
    XLSX.utils.book_append_sheet(
      book,
      worksheet([totalsHeaders, ...totals]),
      t.retrospectiveTotalsSheet,
    );
    const output: unknown = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    if (!Buffer.isBuffer(output)) throw new Error('XLSX writer returned an unexpected type');
    return {
      body: output,
      contentType: XLSX_CONTENT_TYPE,
      filename: `vakhta-retrospective-${query.orgUnitId}-${query.periodMonth}.xlsx`,
    };
  }
}
