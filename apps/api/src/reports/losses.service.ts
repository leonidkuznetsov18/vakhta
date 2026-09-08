import { Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  activityIntervals,
  and,
  asc,
  desc,
  downtimeReports,
  employees,
  employeePositions,
  eq,
  gte,
  isNull,
  lte,
  orgUnits,
  reasonCodes,
  responsibilityZones,
  shiftSessions,
  sql,
  type Database,
} from '@vakhta/db';
import { DEFAULT_LOCALE } from '@vakhta/domain';
import type { LossBar, LossInterval, LossesQuery, LossesView } from '@vakhta/contracts';
import { messages, type Locale } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';

/** The state a shift is in while it is doing its main work; everything else is time not spent on it. */
const WORKING = 'WORKING';

/**
 * Where a shift's time goes and why (2026-09-09).
 *
 * The question the product exists for is "where is the weak spot", and the answer is a Pareto: the
 * categories of non-working time ranked by how much of it they take, with the running share that
 * shows which two or three make up most of the loss. Under a category the same ranking by the
 * reason recorded for it, and under that the intervals themselves.
 *
 * It ranks losses; it cannot price them. What an hour of handover costs in output is not in this
 * system — there is no output and no takt — so the report says which cause to fix first, not what
 * fixing it is worth. And it is only as honest as the reasons people record, which is why the share
 * of explained minutes travels with it.
 */
@Injectable()
export class LossesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}

  async overview(
    q: LossesQuery,
    locale: Locale = DEFAULT_LOCALE,
    now: Date = new Date(),
  ): Promise<LossesView> {
    const t = messages(locale);
    const label = (state: string) => t.states[state as keyof typeof t.states] ?? state;

    const total = await this.db
      .select({ minutes: this.minutes() })
      .from(activityIntervals)
      .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
      .leftJoin(employeePositions, this.currentPosition())
      .leftJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
      .where(and(...this.scope(q)));

    const byCategory = await this.db
      .select({
        key: activityIntervals.state,
        minutes: this.minutes(),
        intervals: sql<number>`count(*)::int`,
        employees: sql<number>`count(distinct ${shiftSessions.employeeId})::int`,
      })
      .from(activityIntervals)
      .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
      .leftJoin(employeePositions, this.currentPosition())
      .leftJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
      .where(and(...this.scope(q), sql`${activityIntervals.state} <> ${WORKING}`))
      .groupBy(activityIntervals.state);

    const lostMinutes = byCategory.reduce((sum, r) => sum + Number(r.minutes ?? 0), 0);

    // How much of the loss carries a reason: without it the ranking looks more certain than it is.
    const [explained] = await this.db
      .select({ minutes: this.minutes() })
      .from(activityIntervals)
      .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
      .leftJoin(employeePositions, this.currentPosition())
      .leftJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
      .where(
        and(
          ...this.scope(q),
          sql`${activityIntervals.state} <> ${WORKING}`,
          sql`${activityIntervals.reasonCode} is not null`,
        ),
      );

    const bars = q.category
      ? await this.byReason(q, lostMinutes, t)
      : this.toBars(
          byCategory.map((r) => ({
            key: r.key,
            label: label(r.key),
            minutes: Number(r.minutes ?? 0),
            intervals: Number(r.intervals ?? 0),
            employees: Number(r.employees ?? 0),
          })),
          lostMinutes,
        );

    const intervals = q.category ? await this.intervals(q, label) : [];

    return {
      from: q.from,
      to: q.to,
      totalMinutes: Number(total[0]?.minutes ?? 0),
      lostMinutes,
      explainedShare: lostMinutes > 0 ? Number(explained?.minutes ?? 0) / lostMinutes : 0,
      bars,
      category: q.category ?? null,
      categoryLabel: q.category ? label(q.category) : null,
      intervals,
      intervalsTotal: intervals.length,
      generatedAt: now.toISOString(),
    };
  }

  /** The same rows as the drill-down, as a file; every download is audited like any other export. */
  async export(
    q: LossesQuery,
    format: 'csv' | 'xlsx',
    actor: Actor,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const t = messages(locale);
    const r = t.admin.reports;
    const label = (state: string) => t.states[state as keyof typeof t.states] ?? state;
    const rows = await this.intervals({ ...q, category: q.category }, label, 20_000);
    const header = [
      r.lossDate,
      r.lossEmployee,
      t.admin.bonus.unit,
      r.lossZone,
      r.lossCategory,
      r.lossReason,
      r.lossFrom,
      r.lossTo,
      r.lossMinutes,
      r.lossComment,
    ];
    const matrix = rows.map((i) => [
      i.businessDate,
      i.employeeName,
      i.orgUnitName ?? '',
      i.zoneName ?? '',
      i.categoryLabel,
      i.reasonLabel ?? '',
      i.startedAt,
      i.endedAt ?? '',
      i.minutes,
      i.comment ?? '',
    ]);
    await this.audit.record(this.db, {
      actor,
      action: 'report.export',
      objectType: 'report',
      objectId: 'losses',
      after: {
        format,
        from: q.from,
        to: q.to,
        siteId: q.siteId ?? null,
        orgUnitId: q.orgUnitId ?? null,
        category: q.category ?? null,
        rows: rows.length,
      },
    });
    const filename = `vakhta-losses-${q.from}-${q.to}.${format}`;
    if (format === 'csv') {
      const cell = (v: string | number | undefined) => {
        const text = String(v ?? '');
        return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      };
      const lines = [header.map(cell).join(';'), ...matrix.map((row) => row.map(cell).join(';'))];
      return {
        body: Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename,
      };
    }
    const sheet = XLSX.utils.aoa_to_sheet([header, ...matrix]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'losses');
    return {
      body: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    };
  }

  /** Minutes an interval lasted; one still open counts up to now, as it does on the shift screen. */
  private minutes() {
    return sql<number>`coalesce(sum(extract(epoch from (coalesce(${activityIntervals.endedAt}, now()) - ${activityIntervals.startedAt})) / 60), 0)::int`;
  }

  /** The employee's current unit: an interval has no unit of its own, the person does. */
  private currentPosition() {
    return and(
      eq(employeePositions.employeeId, shiftSessions.employeeId),
      isNull(employeePositions.validTo),
    );
  }

  private scope(q: LossesQuery) {
    const conditions = [
      gte(shiftSessions.businessDate, q.from),
      lte(shiftSessions.businessDate, q.to),
    ];
    if (q.orgUnitId) conditions.push(eq(employeePositions.orgUnitId, q.orgUnitId));
    if (q.siteId) conditions.push(eq(orgUnits.siteId, q.siteId));
    return conditions;
  }

  private toBars(
    raw: readonly {
      key: string;
      label: string;
      minutes: number;
      intervals: number;
      employees: number;
    }[],
    total: number,
  ): LossBar[] {
    const sorted = [...raw].sort((a, b) => b.minutes - a.minutes);
    let running = 0;
    return sorted.map((r) => {
      const share = total > 0 ? r.minutes / total : 0;
      running += share;
      return { ...r, share, cumulative: running };
    });
  }

  /** Level two: inside one category, ranked by the reason recorded for the interval. */
  private async byReason(
    q: LossesQuery,
    lostMinutes: number,
    t: ReturnType<typeof messages>,
  ): Promise<LossBar[]> {
    const rows = await this.db
      .select({
        key: sql<string>`coalesce(${activityIntervals.reasonCode}, '')`,
        label: sql<string>`coalesce(${reasonCodes.label}, '')`,
        minutes: this.minutes(),
        intervals: sql<number>`count(*)::int`,
        employees: sql<number>`count(distinct ${shiftSessions.employeeId})::int`,
      })
      .from(activityIntervals)
      .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
      .leftJoin(employeePositions, this.currentPosition())
      .leftJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
      .leftJoin(reasonCodes, eq(reasonCodes.code, activityIntervals.reasonCode))
      // The state is an enum column and the category arrives as text, so the comparison is cast.
      .where(and(...this.scope(q), sql`${activityIntervals.state}::text = ${q.category ?? ''}`))
      .groupBy(sql`1, 2`);
    const categoryMinutes = rows.reduce((sum, r) => sum + Number(r.minutes ?? 0), 0);
    void lostMinutes;
    return this.toBars(
      rows.map((r) => ({
        key: r.key,
        // An interval with no reason is the honest "not recorded", not an empty row.
        label: r.label || t.admin.reports.lossNoReason,
        minutes: Number(r.minutes ?? 0),
        intervals: Number(r.intervals ?? 0),
        employees: Number(r.employees ?? 0),
      })),
      categoryMinutes,
    );
  }

  /** Level three: the intervals themselves, newest first. */
  private async intervals(
    q: LossesQuery,
    label: (state: string) => string,
    limit = 500,
  ): Promise<LossInterval[]> {
    const conditions = [...this.scope(q)];
    if (q.category) conditions.push(sql`${activityIntervals.state}::text = ${q.category}`);
    else conditions.push(sql`${activityIntervals.state} <> ${WORKING}`);
    if (q.noReason) conditions.push(isNull(activityIntervals.reasonCode));
    else if (q.reason) conditions.push(eq(activityIntervals.reasonCode, q.reason));
    const rows = await this.db
      .select({
        id: activityIntervals.id,
        businessDate: shiftSessions.businessDate,
        employeeId: shiftSessions.employeeId,
        employeeName: employees.fullName,
        orgUnitName: orgUnits.name,
        zoneName: responsibilityZones.name,
        category: activityIntervals.state,
        reasonLabel: reasonCodes.label,
        // The interval itself carries no words; the problem report written during it does.
        comment: downtimeReports.comment,
        startedAt: activityIntervals.startedAt,
        endedAt: activityIntervals.endedAt,
        minutes: sql<number>`(extract(epoch from (coalesce(${activityIntervals.endedAt}, now()) - ${activityIntervals.startedAt})) / 60)::int`,
      })
      .from(activityIntervals)
      .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
      .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
      .leftJoin(employeePositions, this.currentPosition())
      .leftJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
      .leftJoin(responsibilityZones, eq(shiftSessions.zoneId, responsibilityZones.id))
      .leftJoin(reasonCodes, eq(reasonCodes.code, activityIntervals.reasonCode))
      .leftJoin(
        downtimeReports,
        and(
          eq(downtimeReports.shiftSessionId, activityIntervals.shiftSessionId),
          gte(downtimeReports.reportedAt, activityIntervals.startedAt),
          sql`${downtimeReports.reportedAt} <= coalesce(${activityIntervals.endedAt}, now())`,
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(activityIntervals.startedAt), asc(employees.fullName))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      businessDate: r.businessDate,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      orgUnitName: r.orgUnitName,
      zoneName: r.zoneName,
      category: r.category,
      categoryLabel: label(r.category),
      reasonLabel: r.reasonLabel,
      comment: r.comment,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      minutes: Math.max(0, Number(r.minutes ?? 0)),
    }));
  }
}
