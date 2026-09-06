import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  activityIntervals,
  and,
  auditLog,
  bonusCriteriaResults,
  bonusShiftScores,
  desc,
  domainEvents,
  downtimeIncidents,
  employees,
  eq,
  gte,
  handoverMedia,
  handoverRecords,
  handoverReviews,
  inArray,
  like,
  lte,
  mediaObjects,
  orgUnits,
  overtimeApprovals,
  presenceSessions,
  reasonCodes,
  requests,
  responsibilityZones,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  sql,
  type Database,
} from '@vakhta/db';
import { DEFAULT_LOCALE, scoreMonth, type Locale } from '@vakhta/domain';
import type {
  AuditEntryView,
  AuditQuery,
  DomainEventView,
  EventsQuery,
  ReportKind,
  ReportQuery,
  ReportTableView,
} from '@vakhta/contracts';
import { messages, type Messages } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';

type Cell = string | number | null;
type Row = Record<string, Cell>;
type Column = ReportTableView['columns'][number];

/** Placed into the first text cell of the totals row; replaced with the localized word in build(). */
const TOTALS_SENTINEL = '__TOTALS__';
/** Columns are computed locale-free; labels are resolved once in build() for the requester's language. */
const col = (key: string, kind: Column['kind'] = 'number'): Column => ({ key, label: key, kind });

/**
 * Шість звітів MVP (ТЗ 9.3) як агрегати над проєкціями; без рейтингів «хто менше відпочивав».
 * Вивантаження CSV/XLSX містить версію даних і час формування та пишеться в аудит (FR-WEB-05).
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}

  async build(
    kind: ReportKind,
    q: ReportQuery,
    locale: Locale = DEFAULT_LOCALE,
    now: Date = new Date(),
  ): Promise<ReportTableView> {
    if (q.from > q.to)
      throw new DomainError('PERIOD_INVALID', 422, 'The period start is after its end');
    const t = messages(locale);
    const { columns, rows, totals } = await this.compute(kind, q, t);
    const dataVersion = createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex')
      .slice(0, 12);
    return {
      kind,
      title: t.admin.reports.kinds[kind],
      from: q.from,
      to: q.to,
      columns: columns.map((c) => ({ ...c, label: t.admin.reports.columns[c.key] ?? c.key })),
      rows,
      totals: totals
        ? Object.fromEntries(
            Object.entries(totals).map(([k, v]) => [
              k,
              v === TOTALS_SENTINEL ? t.admin.reports.totals : v,
            ]),
          )
        : null,
      generatedAt: now.toISOString(),
      dataVersion,
    };
  }

  /** Вивантаження: той самий звіт у CSV або XLSX; кожне вивантаження в аудиті з версією даних. */
  async export(
    kind: ReportKind,
    q: ReportQuery,
    format: 'csv' | 'xlsx',
    actor: Actor,
    locale: Locale = DEFAULT_LOCALE,
    now: Date = new Date(),
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const t = messages(locale);
    const report = await this.build(kind, q, locale, now);
    const header = report.columns.map((c) => c.label);
    const matrix = report.rows.map((r) => report.columns.map((c) => r[c.key] ?? ''));
    if (report.totals) matrix.push(report.columns.map((c) => report.totals?.[c.key] ?? ''));
    const meta = `${report.title}; ${report.from} – ${report.to}; ${t.admin.reports.generatedAt} ${report.generatedAt}; ${t.admin.reports.dataVersion} ${report.dataVersion}`;
    await this.audit.record(this.db, {
      actor,
      action: 'report.export',
      objectType: 'report',
      objectId: kind,
      after: {
        format,
        from: q.from,
        to: q.to,
        siteId: q.siteId ?? null,
        rows: report.rows.length,
        dataVersion: report.dataVersion,
        generatedAt: report.generatedAt,
      },
    });
    const filename = `vakhta-${kind}-${report.from}-${report.to}.${format}`;
    if (format === 'csv') {
      const lines = [
        `# ${meta}`,
        header.map(csv).join(';'),
        ...matrix.map((r) => r.map((v) => csv(String(v))).join(';')),
      ];
      return {
        body: Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename,
      };
    }
    const sheet = XLSX.utils.aoa_to_sheet([[meta], header, ...matrix]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, kind.slice(0, 31));
    const body = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      body,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    };
  }

  private async compute(
    kind: ReportKind,
    q: ReportQuery,
    t: Messages,
  ): Promise<{ columns: Column[]; rows: Row[]; totals: Row | null }> {
    switch (kind) {
      case 'hours':
        return this.hours(q);
      case 'time-structure':
        return this.timeStructure(q);
      case 'downtime':
        return this.downtime(q);
      case 'handover':
        return this.handover(q);
      case 'bot-usage':
        return this.botUsage(q);
      case 'bonus':
        return this.bonus(q, t);
    }
  }

  /** Закриті зміни періоду в області запиту, з підсумками і планом. */
  private async sessions(q: ReportQuery) {
    const conditions = [
      gte(shiftSessions.businessDate, q.from),
      lte(shiftSessions.businessDate, q.to),
      inArray(shiftSessions.state, ['SHIFT_CLOSED', 'EMERGENCY_EXIT']),
    ];
    if (q.orgUnitId) conditions.push(eq(shiftAssignments.orgUnitId, q.orgUnitId));
    if (q.siteId) conditions.push(eq(orgUnits.siteId, q.siteId));
    return this.db
      .select({
        s: shiftSessions,
        summary: shiftSummaries,
        employeeName: employees.fullName,
        personnelNumber: employees.personnelNumber,
        planStartAt: shiftAssignments.planStartAt,
        planEndAt: shiftAssignments.planEndAt,
        zoneId: shiftSessions.zoneId,
      })
      .from(shiftSessions)
      .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
      .leftJoin(shiftSummaries, eq(shiftSummaries.shiftSessionId, shiftSessions.id))
      .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .leftJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .where(and(...conditions));
  }

  private async hours(q: ReportQuery) {
    const rows = await this.sessions(q);
    const ids = rows.map((r) => r.s.id);
    const approvals = ids.length
      ? await this.db
          .select()
          .from(overtimeApprovals)
          .where(inArray(overtimeApprovals.shiftSessionId, ids))
      : [];
    const presence = ids.length
      ? await this.db
          .select()
          .from(presenceSessions)
          .where(
            inArray(
              presenceSessions.id,
              rows.map((r) => r.s.presenceId).filter((x): x is string => x !== null),
            ),
          )
      : [];
    const byEmployee = new Map<string, Row>();
    for (const r of rows) {
      const row = byEmployee.get(r.s.employeeId) ?? {
        employee: r.employeeName,
        personnelNumber: r.personnelNumber,
        shifts: 0,
        plannedMinutes: 0,
        actualMinutes: 0,
        presenceMinutes: 0,
        lateMinutes: 0,
        lateCount: 0,
        earlyLeaveMinutes: 0,
        overtimePendingMinutes: 0,
        overtimeApprovedMinutes: 0,
      };
      const approval = approvals.find((a) => a.shiftSessionId === r.s.id);
      const p = presence.find((x) => x.id === r.s.presenceId);
      inc(row, 'shifts', 1);
      inc(
        row,
        'plannedMinutes',
        r.planStartAt && r.planEndAt
          ? Math.round((r.planEndAt.getTime() - r.planStartAt.getTime()) / 60_000)
          : 0,
      );
      inc(row, 'actualMinutes', r.summary?.totalMinutes ?? 0);
      inc(
        row,
        'presenceMinutes',
        p?.departedAt ? Math.round((p.departedAt.getTime() - p.arrivedAt.getTime()) / 60_000) : 0,
      );
      inc(row, 'lateMinutes', r.summary?.lateMinutes ?? 0);
      inc(row, 'lateCount', (r.summary?.lateMinutes ?? 0) > 0 ? 1 : 0);
      inc(row, 'earlyLeaveMinutes', r.summary?.earlyLeaveMinutes ?? 0);
      inc(
        row,
        'overtimePendingMinutes',
        r.summary?.overtimePending && approval?.status !== 'APPROVED'
          ? r.summary.overtimeMinutes
          : 0,
      );
      inc(row, 'overtimeApprovedMinutes', approval?.status === 'APPROVED' ? approval.minutes : 0);
      byEmployee.set(r.s.employeeId, row);
    }
    const columns = [
      col('employee', 'text'),
      col('personnelNumber', 'text'),
      col('shifts'),
      col('plannedMinutes', 'minutes'),
      col('actualMinutes', 'minutes'),
      col('presenceMinutes', 'minutes'),
      col('lateCount'),
      col('lateMinutes', 'minutes'),
      col('earlyLeaveMinutes', 'minutes'),
      col('overtimePendingMinutes', 'minutes'),
      col('overtimeApprovedMinutes', 'minutes'),
    ];
    const out = [...byEmployee.values()].sort((a, b) =>
      String(a['employee']).localeCompare(String(b['employee'])),
    );
    return { columns, rows: out, totals: sumTotals(out, columns) };
  }

  private async timeStructure(q: ReportQuery) {
    const rows = await this.sessions(q);
    const ids = rows.map((r) => r.s.id);
    const cleaning = ids.length
      ? await this.db
          .select({
            sessionId: activityIntervals.shiftSessionId,
            minutes:
              sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(${activityIntervals.endedAt}, now()) - ${activityIntervals.startedAt})) / 60), 0)`.mapWith(
                Number,
              ),
          })
          .from(activityIntervals)
          .where(
            and(
              inArray(activityIntervals.shiftSessionId, ids),
              inArray(activityIntervals.state, ['CLEANING', 'HANDOVER']),
            ),
          )
          .groupBy(activityIntervals.shiftSessionId)
      : [];
    const corrections = ids.length
      ? await this.db
          .select({
            sessionId: domainEvents.shiftSessionId,
            n: sql<number>`COUNT(*)`.mapWith(Number),
          })
          .from(domainEvents)
          .where(
            and(
              inArray(domainEvents.shiftSessionId, ids),
              eq(domainEvents.type, 'SHIFT_CORRECTED'),
            ),
          )
          .groupBy(domainEvents.shiftSessionId)
      : [];
    const byEmployee = new Map<string, Row>();
    for (const r of rows) {
      const row = byEmployee.get(r.s.employeeId) ?? {
        employee: r.employeeName,
        shifts: 0,
        workMinutes: 0,
        preparationMinutes: 0,
        serviceMinutes: 0,
        breakMinutes: 0,
        mealMinutes: 0,
        downtimeMinutes: 0,
        cleaningMinutes: 0,
        corrections: 0,
        clarifications: 0,
      };
      inc(row, 'shifts', 1);
      inc(row, 'workMinutes', r.summary?.workMinutes ?? 0);
      inc(row, 'preparationMinutes', r.summary?.preparationMinutes ?? 0);
      inc(row, 'serviceMinutes', r.summary?.serviceMinutes ?? 0);
      inc(row, 'breakMinutes', r.summary?.breakMinutes ?? 0);
      inc(row, 'mealMinutes', r.summary?.mealMinutes ?? 0);
      inc(row, 'downtimeMinutes', r.summary?.downtimeMinutes ?? 0);
      inc(
        row,
        'cleaningMinutes',
        Math.round(cleaning.find((c) => c.sessionId === r.s.id)?.minutes ?? 0),
      );
      inc(row, 'corrections', corrections.find((c) => c.sessionId === r.s.id)?.n ?? 0);
      inc(row, 'clarifications', r.s.needsClarification ? 1 : 0);
      byEmployee.set(r.s.employeeId, row);
    }
    const columns = [
      col('employee', 'text'),
      col('shifts'),
      col('workMinutes', 'minutes'),
      col('preparationMinutes', 'minutes'),
      col('serviceMinutes', 'minutes'),
      col('breakMinutes', 'minutes'),
      col('mealMinutes', 'minutes'),
      col('downtimeMinutes', 'minutes'),
      col('cleaningMinutes', 'minutes'),
      col('corrections'),
      col('clarifications'),
    ];
    const out = [...byEmployee.values()];
    return { columns, rows: out, totals: sumTotals(out, columns) };
  }

  private async downtime(q: ReportQuery) {
    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(`${q.to}T23:59:59.999Z`);
    const conditions = [gte(downtimeIncidents.openedAt, from), lte(downtimeIncidents.openedAt, to)];
    if (q.siteId) conditions.push(eq(downtimeIncidents.siteId, q.siteId));
    if (q.orgUnitId) conditions.push(eq(downtimeIncidents.orgUnitId, q.orgUnitId));
    const incidents = await this.db
      .select({
        i: downtimeIncidents,
        zoneName: responsibilityZones.name,
        reasonLabel: reasonCodes.label,
      })
      .from(downtimeIncidents)
      .leftJoin(responsibilityZones, eq(downtimeIncidents.zoneId, responsibilityZones.id))
      .leftJoin(
        reasonCodes,
        and(eq(reasonCodes.kind, 'DOWNTIME'), eq(reasonCodes.code, downtimeIncidents.reasonCode)),
      )
      .where(and(...conditions));
    const personal = await this.db
      .select({
        reasonCode: activityIntervals.reasonCode,
        zoneId: shiftSessions.zoneId,
        minutes:
          sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(${activityIntervals.endedAt}, now()) - ${activityIntervals.startedAt})) / 60), 0)`.mapWith(
            Number,
          ),
      })
      .from(activityIntervals)
      .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
      .where(
        and(
          eq(activityIntervals.state, 'DOWNTIME'),
          gte(activityIntervals.startedAt, from),
          lte(activityIntervals.startedAt, to),
        ),
      )
      .groupBy(activityIntervals.reasonCode, shiftSessions.zoneId);
    const zones = await this.db
      .select({ id: responsibilityZones.id, name: responsibilityZones.name })
      .from(responsibilityZones);
    const rows = new Map<string, Row & { _res: number; _resN: number }>();
    for (const r of incidents) {
      if (r.i.status === 'DUPLICATE') continue;
      const key = `${r.i.reasonCode}|${r.i.zoneId ?? ''}`;
      const row = rows.get(key) ?? {
        reason: r.reasonLabel ?? r.i.reasonCode,
        zone: r.zoneName ?? '—',
        incidents: 0,
        reports: 0,
        avgResolutionMinutes: null,
        slaBreached: 0,
        personalDowntimeMinutes: 0,
        _res: 0,
        _resN: 0,
      };
      inc(row, 'incidents', 1);
      inc(row, 'reports', r.i.reportsCount);
      const reacted = r.i.acknowledgedAt ?? r.i.resolvedAt;
      if ((reacted ?? new Date()).getTime() > r.i.slaDueAt.getTime()) inc(row, 'slaBreached', 1);
      if (r.i.resolvedAt) {
        row._res += (r.i.resolvedAt.getTime() - r.i.openedAt.getTime()) / 60_000;
        row._resN += 1;
      }
      rows.set(key, row);
    }
    for (const p of personal) {
      const key = `${p.reasonCode ?? 'UNKNOWN'}|${p.zoneId ?? ''}`;
      const row = rows.get(key) ?? {
        reason: p.reasonCode ?? '—',
        zone: zones.find((z) => z.id === p.zoneId)?.name ?? '—',
        incidents: 0,
        reports: 0,
        avgResolutionMinutes: null,
        slaBreached: 0,
        personalDowntimeMinutes: 0,
        _res: 0,
        _resN: 0,
      };
      inc(row, 'personalDowntimeMinutes', Math.round(p.minutes));
      rows.set(key, row);
    }
    const out: Row[] = [...rows.values()].map(({ _res, _resN, ...row }) => ({
      ...row,
      avgResolutionMinutes: _resN > 0 ? Math.round(_res / _resN) : null,
    }));
    const columns = [
      col('reason', 'text'),
      col('zone', 'text'),
      col('incidents'),
      col('reports'),
      col('avgResolutionMinutes', 'minutes'),
      col('slaBreached'),
      col('personalDowntimeMinutes', 'minutes'),
    ];
    return {
      columns,
      rows: out.sort(
        (a, b) => Number(b['personalDowntimeMinutes']) - Number(a['personalDowntimeMinutes']),
      ),
      totals: sumTotals(
        out,
        columns.filter((c) => c.key !== 'avgResolutionMinutes'),
      ),
    };
  }

  private async handover(q: ReportQuery) {
    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(`${q.to}T23:59:59.999Z`);
    const conditions = [
      gte(handoverRecords.submittedAt, from),
      lte(handoverRecords.submittedAt, to),
    ];
    if (q.siteId) conditions.push(eq(responsibilityZones.siteId, q.siteId));
    if (q.orgUnitId) conditions.push(eq(responsibilityZones.orgUnitId, q.orgUnitId));
    const records = await this.db
      .select({ r: handoverRecords, zoneName: responsibilityZones.name })
      .from(handoverRecords)
      .innerJoin(responsibilityZones, eq(handoverRecords.zoneId, responsibilityZones.id))
      .where(and(...conditions));
    const ids = records.map((r) => r.r.id);
    const reviews = ids.length
      ? await this.db.select().from(handoverReviews).where(inArray(handoverReviews.handoverId, ids))
      : [];
    const photos = ids.length
      ? await this.db
          .select({ handoverId: handoverMedia.handoverId, quality: mediaObjects.quality })
          .from(handoverMedia)
          .innerJoin(mediaObjects, eq(handoverMedia.mediaObjectId, mediaObjects.id))
          .where(inArray(handoverMedia.handoverId, ids))
      : [];
    const rows = new Map<string, Row & { _rev: number; _revN: number }>();
    for (const rec of records) {
      const row = rows.get(rec.r.zoneId) ?? {
        zone: rec.zoneName,
        handovers: 0,
        accepted: 0,
        disputed: 0,
        resolvedIssue: 0,
        resolvedNoFault: 0,
        overdue: 0,
        avgReviewMinutes: null,
        photos: 0,
        photosOk: 0,
        photosSuspect: 0,
        _rev: 0,
        _revN: 0,
      };
      inc(row, 'handovers', 1);
      if (rec.r.status === 'ACCEPTED' || rec.r.status === 'RESOLVED_ACCEPTED')
        inc(row, 'accepted', 1);
      if (rec.r.status === 'DISPUTED') inc(row, 'disputed', 1);
      if (rec.r.status === 'RESOLVED_ISSUE_CONFIRMED') inc(row, 'resolvedIssue', 1);
      if (rec.r.status === 'RESOLVED_NO_FAULT') inc(row, 'resolvedNoFault', 1);
      if (rec.r.escalatedToMasterAt) inc(row, 'overdue', 1);
      const review = reviews.find((x) => x.handoverId === rec.r.id);
      if (review && rec.r.submittedAt) {
        row._rev += (review.reviewedAt.getTime() - rec.r.submittedAt.getTime()) / 60_000;
        row._revN += 1;
      }
      for (const p of photos.filter((x) => x.handoverId === rec.r.id)) {
        inc(row, 'photos', 1);
        if (p.quality === 'OK') inc(row, 'photosOk', 1);
        if (
          p.quality === 'DUPLICATE_SUSPECT' ||
          p.quality === 'DARK' ||
          p.quality === 'LOW_RES' ||
          p.quality === 'MANUAL_REVIEW'
        )
          inc(row, 'photosSuspect', 1);
      }
      rows.set(rec.r.zoneId, row);
    }
    const out: Row[] = [...rows.values()].map(({ _rev, _revN, ...row }) => ({
      ...row,
      avgReviewMinutes: _revN > 0 ? Math.round(_rev / _revN) : null,
    }));
    const columns = [
      col('zone', 'text'),
      col('handovers'),
      col('accepted'),
      col('disputed'),
      col('resolvedIssue'),
      col('resolvedNoFault'),
      col('overdue'),
      col('avgReviewMinutes', 'minutes'),
      col('photos'),
      col('photosOk'),
      col('photosSuspect'),
    ];
    return {
      columns,
      rows: out,
      totals: sumTotals(
        out,
        columns.filter((c) => c.key !== 'avgReviewMinutes'),
      ),
    };
  }

  private async botUsage(q: ReportQuery) {
    const rows = await this.sessions(q);
    const presenceIds = rows.map((r) => r.s.presenceId).filter((x): x is string => x !== null);
    const presence = presenceIds.length
      ? await this.db
          .select()
          .from(presenceSessions)
          .where(inArray(presenceSessions.id, presenceIds))
      : [];
    const tech = await this.db
      .select({ employeeId: requests.employeeId, n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(requests)
      .where(
        and(
          eq(requests.type, 'TECH_ISSUE'),
          gte(requests.submittedAt, new Date(`${q.from}T00:00:00Z`)),
          lte(requests.submittedAt, new Date(`${q.to}T23:59:59.999Z`)),
        ),
      )
      .groupBy(requests.employeeId);
    const byEmployee = new Map<string, Record<string, unknown> & { _reasons: Set<string> }>();
    for (const r of rows) {
      const row = byEmployee.get(r.s.employeeId) ?? {
        employee: r.employeeName,
        shifts: 0,
        qrArrivals: 0,
        reserveArrivals: 0,
        masterStarts: 0,
        emergencyExits: 0,
        techIssues: tech.find((x) => x.employeeId === r.s.employeeId)?.n ?? 0,
        reserveReasons: '',
        _reasons: new Set<string>(),
      };
      inc(row, 'shifts', 1);
      const p = presence.find((x) => x.id === r.s.presenceId);
      if (p?.arrivalMethod === 'QR') inc(row, 'qrArrivals', 1);
      else if (p) {
        inc(row, 'reserveArrivals', 1);
        if (p.reasonCode) row._reasons.add(p.reasonCode);
      }
      if (r.s.startMethod === 'MASTER') inc(row, 'masterStarts', 1);
      if (r.s.state === 'EMERGENCY_EXIT') inc(row, 'emergencyExits', 1);
      byEmployee.set(r.s.employeeId, row);
    }
    const out: Row[] = [...byEmployee.values()].map(({ _reasons, ...row }) => ({
      ...row,
      reserveReasons: [..._reasons].join(', '),
    }));
    const columns = [
      col('employee', 'text'),
      col('shifts'),
      col('qrArrivals'),
      col('reserveArrivals'),
      col('reserveReasons', 'text'),
      col('masterStarts'),
      col('emergencyExits'),
      col('techIssues'),
    ];
    return {
      columns,
      rows: out,
      totals: sumTotals(
        out,
        columns.filter((c) => c.kind === 'number'),
      ),
    };
  }

  private async bonus(q: ReportQuery, t: Messages) {
    const conditions = [
      gte(bonusShiftScores.businessDate, q.from),
      lte(bonusShiftScores.businessDate, q.to),
    ];
    const scores = await this.db
      .select({ s: bonusShiftScores, employeeName: employees.fullName })
      .from(bonusShiftScores)
      .innerJoin(employees, eq(bonusShiftScores.employeeId, employees.id))
      .innerJoin(shiftSessions, eq(bonusShiftScores.shiftSessionId, shiftSessions.id))
      .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .leftJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .where(
        and(
          ...conditions,
          q.siteId ? eq(orgUnits.siteId, q.siteId) : undefined,
          q.orgUnitId ? eq(shiftAssignments.orgUnitId, q.orgUnitId) : undefined,
        ),
      );
    const ids = scores.map((s) => s.s.id);
    const missed = ids.length
      ? await this.db
          .select({
            scoreId: bonusCriteriaResults.scoreId,
            criterion: bonusCriteriaResults.criterion,
            lost: sql<number>`${bonusCriteriaResults.maxPoints} - ${bonusCriteriaResults.earnedPoints}`.mapWith(
              Number,
            ),
          })
          .from(bonusCriteriaResults)
          .where(
            and(
              inArray(bonusCriteriaResults.scoreId, ids),
              eq(bonusCriteriaResults.status, 'missed'),
            ),
          )
      : [];
    const byEmployee = new Map<
      string,
      Record<string, unknown> & {
        _scores: { score: number; plannedMinutes: number }[];
        _lost: Map<string, number>;
      }
    >();
    for (const r of scores) {
      const row = byEmployee.get(r.s.employeeId) ?? {
        employee: r.employeeName,
        evaluated: 0,
        preliminary: 0,
        confirmed: 0,
        pending: 0,
        avgScore: null,
        sMonth: null,
        topDeviation: '',
        _scores: [] as { score: number; plannedMinutes: number }[],
        _lost: new Map<string, number>(),
      };
      if (r.s.status !== 'NOT_EVALUATED') inc(row, 'evaluated', 1);
      if (r.s.status === 'PRELIMINARY') inc(row, 'preliminary', 1);
      if (r.s.status === 'CONFIRMED') inc(row, 'confirmed', 1);
      if (r.s.status === 'PENDING' || r.s.status === 'MANUAL_REVIEW' || r.s.status === 'APPEALED')
        inc(row, 'pending', 1);
      if (r.s.score !== null && (r.s.status === 'PRELIMINARY' || r.s.status === 'CONFIRMED'))
        row._scores.push({ score: r.s.score, plannedMinutes: r.s.plannedMinutes });
      for (const m of missed.filter((x) => x.scoreId === r.s.id))
        row._lost.set(m.criterion, (row._lost.get(m.criterion) ?? 0) + m.lost);
      byEmployee.set(r.s.employeeId, row);
    }
    const out: Row[] = [...byEmployee.values()].map(({ _scores, _lost, ...row }) => {
      const top = [..._lost.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        ...(row as Row),
        avgScore: _scores.length
          ? Math.round(_scores.reduce((s, x) => s + x.score, 0) / _scores.length)
          : null,
        sMonth: scoreMonth(_scores),
        topDeviation: top
          ? (t.bonus.criteria[top[0] as keyof typeof t.bonus.criteria] ?? top[0])
          : '',
      };
    });
    const columns = [
      col('employee', 'text'),
      col('evaluated'),
      col('preliminary'),
      col('confirmed'),
      col('pending'),
      col('avgScore'),
      col('sMonth'),
      col('topDeviation', 'text'),
    ];
    return { columns, rows: out, totals: null };
  }

  /* ------------------------------------------------------------------ */
  /* Аудит (ТЗ 9.1 «Аудит», 13)                                          */
  /* ------------------------------------------------------------------ */

  async auditEntries(q: AuditQuery): Promise<AuditEntryView[]> {
    const conditions = [];
    if (q.from) conditions.push(gte(auditLog.at, new Date(q.from)));
    if (q.to) conditions.push(lte(auditLog.at, new Date(q.to)));
    if (q.actorId) conditions.push(eq(auditLog.actorId, q.actorId));
    if (q.action) conditions.push(like(auditLog.action, `%${q.action}%`));
    if (q.objectType) conditions.push(eq(auditLog.objectType, q.objectType));
    if (q.objectId) conditions.push(eq(auditLog.objectId, q.objectId));
    const rows = await this.db
      .select()
      .from(auditLog)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.at))
      .limit(q.limit ?? 200);
    return rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      objectType: r.objectType,
      objectId: r.objectId,
      before: r.before,
      after: r.after,
      reason: r.reason,
    }));
  }

  async events(q: EventsQuery): Promise<DomainEventView[]> {
    const conditions = [];
    if (q.from) conditions.push(gte(domainEvents.occurredAt, new Date(q.from)));
    if (q.to) conditions.push(lte(domainEvents.occurredAt, new Date(q.to)));
    if (q.employeeId) conditions.push(eq(domainEvents.employeeId, q.employeeId));
    if (q.shiftSessionId) conditions.push(eq(domainEvents.shiftSessionId, q.shiftSessionId));
    if (q.type) conditions.push(like(domainEvents.type, `%${q.type}%`));
    const rows = await this.db
      .select({ e: domainEvents, employeeName: employees.fullName })
      .from(domainEvents)
      .leftJoin(employees, eq(domainEvents.employeeId, employees.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(domainEvents.occurredAt))
      .limit(q.limit ?? 200);
    return rows.map(({ e, employeeName }) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt.toISOString(),
      receivedAt: e.receivedAt.toISOString(),
      source: e.source,
      actorId: e.actorId,
      actingRole: e.actingRole,
      employeeId: e.employeeId,
      employeeName,
      shiftSessionId: e.shiftSessionId,
      reasonCode: e.reasonCode,
      comment: e.comment,
      correctsEventId: e.correctsEventId,
      payload: e.payload,
    }));
  }
}

function inc(row: Record<string, unknown>, key: string, by: number): void {
  row[key] = Number(row[key] ?? 0) + by;
}

function sumTotals(rows: Row[], columns: Column[]): Row {
  const totals: Row = {};
  for (const c of columns) {
    if (c.kind === 'text') {
      totals[c.key] = c === columns[0] ? TOTALS_SENTINEL : '';
      continue;
    }
    totals[c.key] = rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0);
  }
  return totals;
}

function csv(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
