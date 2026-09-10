import { Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  activityIntervals,
  and,
  asc,
  desc,
  employees,
  employeePositions,
  eq,
  gte,
  isNull,
  lt,
  lte,
  orgUnits,
  reasonCodes,
  responsibilityZones,
  shiftSessions,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { DEFAULT_LOCALE } from '@vakhta/domain';
import type { LossBar, LossInterval, LossesQuery, LossesView } from '@vakhta/contracts';
import { messages, type Locale } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { DATABASE } from '../infra/database.module.js';

const WORKING = 'WORKING';
const DETAIL_LIMIT = 500;
const EXPORT_LIMIT = 20_000;

type ReportRows = ReturnType<LossesService['rows']>;

/** One interval is one row. All readers share attribution, cutoff and minute arithmetic. */
@Injectable()
export class LossesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
  ) {}

  async overview(
    q: LossesQuery,
    locale: Locale = DEFAULT_LOCALE,
    now = new Date(),
  ): Promise<LossesView> {
    const t = messages(locale);
    const label = (state: string) => t.states[state as keyof typeof t.states] ?? state;
    const asOf = cutoff(q, now);
    return this.db.transaction(
      async (tx) => {
        const rows = this.rows(tx, q, asOf);
        const [totals] = await tx
          .select({
            minutes: sql<number>`coalesce(sum(${rows.minutes}), 0)::int`,
            explained: sql<number>`coalesce(sum(${rows.minutes}) filter (where ${rows.category} <> ${WORKING} and ${rows.reasonCode} is not null), 0)::int`,
          })
          .from(rows);
        const categories = await tx
          .select({
            key: rows.category,
            minutes: sql<number>`sum(${rows.minutes})::int`,
            intervals: sql<number>`count(*)::int`,
            employees: sql<number>`count(distinct ${rows.employeeId})::int`,
          })
          .from(rows)
          .where(sql`${rows.category} <> ${WORKING}`)
          .groupBy(rows.category);
        const lostMinutes = categories.reduce((sum, row) => sum + row.minutes, 0);
        const bars = q.category
          ? await this.byReason(tx, rows, q, t.admin.reports.lossNoReason)
          : toBars(
              categories.map((row) => ({ ...row, label: label(row.key) })),
              lostMinutes,
            );
        const intervalsTotal = await this.count(tx, rows, q);
        const intervals = q.category ? await this.intervals(tx, rows, q, label, DETAIL_LIMIT) : [];
        return {
          from: q.from,
          to: q.to,
          totalMinutes: totals?.minutes ?? 0,
          lostMinutes,
          explainedShare: lostMinutes > 0 ? (totals?.explained ?? 0) / lostMinutes : 0,
          bars,
          category: q.category ?? null,
          categoryLabel: q.category ? label(q.category) : null,
          intervals,
          intervalsTotal,
          intervalsLimit: DETAIL_LIMIT,
          intervalsTruncated: Boolean(q.category) && intervalsTotal > intervals.length,
          exportLimit: EXPORT_LIMIT,
          asOf: asOf.toISOString(),
          generatedAt: now.toISOString(),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /** Exports are complete or rejected. A cutoff is not an immutable historical data version. */
  async export(
    q: LossesQuery,
    format: 'csv' | 'xlsx',
    actor: Actor,
    locale: Locale = DEFAULT_LOCALE,
    now = new Date(),
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const t = messages(locale);
    const r = t.admin.reports;
    const label = (state: string) => t.states[state as keyof typeof t.states] ?? state;
    const asOf = cutoff(q, now);
    return this.db.transaction(
      async (tx) => {
        const source = this.rows(tx, q, asOf);
        const total = await this.count(tx, source, q);
        if (total > EXPORT_LIMIT) {
          throw new DomainError(
            'REPORT_EXPORT_TOO_LARGE',
            422,
            `This export contains ${total} intervals; the limit is ${EXPORT_LIMIT}. Narrow the dates or unit filter.`,
          );
        }
        const rows = await this.intervals(tx, source, q, label, EXPORT_LIMIT);
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
          r.lossCutoff,
          r.generatedAt,
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
          asOf.toISOString(),
          now.toISOString(),
        ]);
        const filename = `vakhta-losses-${q.from}-${q.to}.${format}`;
        let body: Buffer;
        let contentType: string;
        if (format === 'csv') {
          const lines = [header, ...matrix].map((row) => row.map(csvCell).join(';'));
          body = Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8');
          contentType = 'text/csv; charset=utf-8';
        } else {
          const book = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(
            book,
            XLSX.utils.aoa_to_sheet([header, ...matrix]),
            'losses',
          );
          // xlsx's untyped write return is checked at the boundary rather than asserted as Buffer.
          const output: unknown = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
          if (!Buffer.isBuffer(output)) throw new Error('XLSX export did not produce a Buffer');
          body = output;
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        }
        await this.audit.record(tx, {
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
            reason: q.reason ?? null,
            noReason: q.noReason ?? false,
            rows: rows.length,
            asOf: asOf.toISOString(),
            generatedAt: now.toISOString(),
          },
        });
        return { body, contentType, filename };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  /** Shared relation: at most one historical position and one applicable reason per interval. */
  rows(tx: DbOrTx, q: LossesQuery, asOf: Date) {
    const end = sql`least(coalesce(${activityIntervals.endedAt}, ${asOf.toISOString()}::timestamptz), ${asOf.toISOString()}::timestamptz)`;
    // A missing shift start uses its first recorded interval, never today's position. Historical
    // overlaps are resolved deterministically without multiplying recorded minutes.
    const positionAt = sql`coalesce(${shiftSessions.startedAt}, (select min(first_interval.started_at) from activity_intervals first_interval where first_interval.shift_session_id = ${shiftSessions.id}))`;
    const position = sql`(select history.id from employee_positions history
      where history.employee_id = ${shiftSessions.employeeId} and history.valid_from <= ${positionAt}
        and (history.valid_to is null or history.valid_to > ${positionAt})
      order by history.valid_from desc, history.id desc limit 1)`;
    const scope = [
      gte(shiftSessions.businessDate, q.from),
      lte(shiftSessions.businessDate, q.to),
      lt(activityIntervals.startedAt, asOf),
    ];
    if (q.orgUnitId) scope.push(eq(employeePositions.orgUnitId, q.orgUnitId));
    if (q.siteId) scope.push(eq(orgUnits.siteId, q.siteId));
    return (
      tx
        .select({
          id: activityIntervals.id,
          businessDate: shiftSessions.businessDate,
          employeeId: shiftSessions.employeeId,
          employeeName: employees.fullName,
          orgUnitId: employeePositions.orgUnitId,
          orgUnitName: sql<string | null>`${orgUnits.name}`.as('org_unit_name'),
          siteId: orgUnits.siteId,
          zoneName: sql<string | null>`${responsibilityZones.name}`.as('zone_name'),
          category: activityIntervals.state,
          reasonCode: activityIntervals.reasonCode,
          reasonLabel: sql<
            string | null
          >`coalesce(${reasonCodes.label}, ${activityIntervals.reasonCode})`.as('reason_label'),
          comment: sql<
            string | null
          >`(select string_agg(report.comment, E'\n' order by report.reported_at, report.id)
        from downtime_reports report where report.shift_session_id = ${shiftSessions.id}
        and report.reported_at >= ${activityIntervals.startedAt} and report.reported_at < ${end})`.as(
            'comment',
          ),
          startedAt: activityIntervals.startedAt,
          endedAt:
            sql<Date | null>`case when ${activityIntervals.endedAt} <= ${asOf.toISOString()}::timestamptz then ${activityIntervals.endedAt} else null end`
              .mapWith(activityIntervals.endedAt)
              .as('ended_at'),
          // Round once per displayed interval, then sum these same integers in every aggregate.
          minutes:
            sql<number>`greatest(round(extract(epoch from (${end} - ${activityIntervals.startedAt})) / 60), 0)::int`.as(
              'minutes',
            ),
        })
        .from(activityIntervals)
        .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
        .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
        .leftJoin(employeePositions, sql`${employeePositions.id} = ${position}`)
        .leftJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
        .leftJoin(responsibilityZones, eq(shiftSessions.zoneId, responsibilityZones.id))
        // Only DOWNTIME opens an interval with a reason dictionary kind. Other kinds belong to
        // commands/events; an unknown legacy interval reason remains visible as its stored code.
        .leftJoin(
          reasonCodes,
          and(
            eq(reasonCodes.kind, 'DOWNTIME'),
            eq(activityIntervals.state, 'DOWNTIME'),
            eq(reasonCodes.code, activityIntervals.reasonCode),
          ),
        )
        .where(and(...scope))
        .as('loss_intervals')
    );
  }

  private async count(tx: DbOrTx, rows: ReportRows, q: LossesQuery): Promise<number> {
    const [result] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(rows)
      .where(detailScope(rows, q));
    return result?.total ?? 0;
  }

  private async byReason(
    tx: DbOrTx,
    rows: ReportRows,
    q: LossesQuery,
    noReason: string,
  ): Promise<LossBar[]> {
    const grouped = await tx
      .select({
        key: sql<string>`coalesce(${rows.reasonCode}, '')`,
        label: sql<string>`coalesce(${rows.reasonLabel}, ${noReason})`,
        minutes: sql<number>`sum(${rows.minutes})::int`,
        intervals: sql<number>`count(*)::int`,
        employees: sql<number>`count(distinct ${rows.employeeId})::int`,
      })
      .from(rows)
      .where(detailScope(rows, q))
      .groupBy(rows.reasonCode, rows.reasonLabel);
    return toBars(
      grouped,
      grouped.reduce((sum, row) => sum + row.minutes, 0),
    );
  }

  private async intervals(
    tx: DbOrTx,
    rows: ReportRows,
    q: LossesQuery,
    label: (state: string) => string,
    limit: number,
  ): Promise<LossInterval[]> {
    const selected = await tx
      .select()
      .from(rows)
      .where(detailScope(rows, q))
      .orderBy(desc(rows.startedAt), asc(rows.employeeName), asc(rows.id))
      .limit(limit);
    return selected.map((row) => ({
      id: row.id,
      businessDate: row.businessDate,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      orgUnitName: row.orgUnitName,
      zoneName: row.zoneName,
      category: row.category,
      categoryLabel: label(row.category),
      reasonLabel: row.reasonLabel,
      comment: row.comment,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      minutes: row.minutes,
    }));
  }
}

function detailScope(rows: ReportRows, q: LossesQuery) {
  const scope = [
    q.category ? sql`${rows.category}::text = ${q.category}` : sql`${rows.category} <> ${WORKING}`,
  ];
  if (q.noReason) scope.push(isNull(rows.reasonCode));
  else if (q.reason) scope.push(eq(rows.reasonCode, q.reason));
  return and(...scope);
}

function cutoff(q: LossesQuery, now: Date): Date {
  return q.asOf ? new Date(Math.min(new Date(q.asOf).getTime(), now.getTime())) : now;
}

function toBars(raw: readonly Omit<LossBar, 'share' | 'cumulative'>[], total: number): LossBar[] {
  let cumulative = 0;
  return [...raw]
    .sort((a, b) => b.minutes - a.minutes || a.key.localeCompare(b.key))
    .map((row) => {
      const share = total > 0 ? row.minutes / total : 0;
      cumulative += share;
      return { ...row, share, cumulative };
    });
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
