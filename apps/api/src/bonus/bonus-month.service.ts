import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  bonusMonthClosures,
  bonusPointAwards,
  employeePositions,
  employees,
  eq,
  inArray,
  isNull,
  shiftSessions,
  sites,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { businessDateOf, previousMonth, type MonthNominations } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import { DomainError } from '../common/domain-error.js';
import { isSerializationFailure } from '../common/pg-errors.js';
import { DATABASE } from '../infra/database.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  liveMonthNominations,
  monthEmployeePoints,
  type EmployeeMonthPoints,
} from './bonus-month-nominations.js';

const CLOSE_AFTER_DAY = 2;
const CLOSE_ATTEMPTS = 3;

export interface MonthCloseOutcome {
  readonly siteId: string;
  readonly month: string;
  readonly unitOfMonth: string | null;
  readonly awarded: number;
  readonly cards: number;
}

/** One immutable site/month decision owns all awards and already-localized notification cards. */
@Injectable()
export class BonusMonthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  async closeDueMonths(now = new Date()): Promise<MonthCloseOutcome[]> {
    const rows = await this.db.select({ id: sites.id, timezone: sites.timezone }).from(sites);
    const outcomes: MonthCloseOutcome[] = [];
    for (const site of rows) {
      const today = businessDateOf(now, site.timezone);
      if (Number(today.slice(8, 10)) < CLOSE_AFTER_DAY) continue;
      outcomes.push(await this.closeMonth(site.id, previousMonth(today.slice(0, 7)), now));
    }
    return outcomes;
  }

  async closeMonth(siteId: string, month: string, now = new Date()): Promise<MonthCloseOutcome> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.closeOnce(siteId, month, now);
      } catch (error) {
        // A waiting repeatable-read closer can hold a snapshot older than the first commit.
        // Retry the complete transaction, including the final-snapshot lookup; never just awards.
        if (!isSerializationFailure(error) || attempt >= CLOSE_ATTEMPTS) throw error;
      }
    }
  }

  private closeOnce(siteId: string, month: string, now: Date): Promise<MonthCloseOutcome> {
    return this.db.transaction(
      async (tx) => {
        const [site] = await tx
          .select({ id: sites.id })
          .from(sites)
          .where(eq(sites.id, siteId))
          .for('no key update');
        if (!site) throw new DomainError('SITE_NOT_FOUND', 404, 'Site not found');
        const [closed] = await tx
          .select()
          .from(bonusMonthClosures)
          .where(and(eq(bonusMonthClosures.siteId, siteId), eq(bonusMonthClosures.month, month)));
        if (closed) return { siteId, month, unitOfMonth: closed.orgUnitId, awarded: 0, cards: 0 };

        const initial = await liveMonthNominations(tx, siteId, month);
        const unit = initial.unitOfMonth;
        const unitMembers = unit ? await this.unitEmployeeIds(tx, unit.id) : [];
        const masterIds = [...new Set(initial.masters.flatMap((master) => master.employeeIds))];
        let awarded = 0;
        if (unit) {
          awarded += await this.insertAwards(tx, unitMembers, {
            orgUnitId: unit.id,
            month,
            kind: 'UNIT_OF_MONTH',
            now,
          });
          awarded += await this.insertAwards(tx, masterIds, {
            orgUnitId: unit.id,
            month,
            kind: 'MASTER_OF_MONTH',
            now,
          });
        }
        // Preserve the existing employee nomination: all ledger points, including these final awards.
        const nominations = await liveMonthNominations(tx, siteId, month);
        const [snapshot] = await tx
          .insert(bonusMonthClosures)
          .values({
            siteId,
            month,
            closedAt: now,
            employeeId: nominations.employeeOfMonth?.id ?? null,
            employeeName: nominations.employeeOfMonth?.name ?? null,
            employeePoints: nominations.employeeOfMonth?.points ?? null,
            orgUnitId: nominations.unitOfMonth?.id ?? null,
            orgUnitName: nominations.unitOfMonth?.name ?? null,
            orgUnitPoints: nominations.unitOfMonth?.points ?? null,
            masters: nominations.masters,
          })
          .onConflictDoNothing()
          .returning({ id: bonusMonthClosures.id });
        if (!snapshot)
          throw new Error('Month closure was not inserted while holding the site lock');
        const totals = await monthEmployeePoints(tx, siteId, month);
        const cards = await this.sendCards(
          tx,
          month,
          nominations,
          totals,
          new Set([...unitMembers, ...masterIds]),
        );
        return { siteId, month, unitOfMonth: nominations.unitOfMonth?.id ?? null, awarded, cards };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  private async unitEmployeeIds(tx: DbOrTx, orgUnitId: string): Promise<string[]> {
    const rows = await tx
      .selectDistinct({ employeeId: employeePositions.employeeId })
      .from(employeePositions)
      .innerJoin(employees, eq(employeePositions.employeeId, employees.id))
      .where(
        and(
          eq(employeePositions.orgUnitId, orgUnitId),
          isNull(employeePositions.validTo),
          eq(employees.status, 'ACTIVE'),
        ),
      );
    return rows.map((row) => row.employeeId);
  }

  private async insertAwards(
    tx: DbOrTx,
    employeeIds: readonly string[],
    award: {
      orgUnitId: string;
      month: string;
      kind: 'UNIT_OF_MONTH' | 'MASTER_OF_MONTH';
      now: Date;
    },
  ): Promise<number> {
    if (employeeIds.length === 0) return 0;
    const inserted = await tx
      .insert(bonusPointAwards)
      .values(
        employeeIds.map((employeeId) => ({
          employeeId,
          orgUnitId: award.orgUnitId,
          month: award.month,
          businessDate: null,
          kind: award.kind,
          points: 1,
          awardedAt: award.now,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: bonusPointAwards.id });
    return inserted.length;
  }

  private async sendCards(
    tx: DbOrTx,
    month: string,
    nominations: MonthNominations,
    totals: readonly EmployeeMonthPoints[],
    winningRecipients: ReadonlySet<string>,
  ): Promise<number> {
    if (totals.length === 0) return 0;
    const shifts = await this.shiftCounts(tx, month, totals);
    const masterIds = new Set(nominations.masters.flatMap((master) => master.employeeIds));
    const unit = nominations.unitOfMonth;
    let cards = 0;
    for (const row of totals) {
      const sent = await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: row.employeeId,
        template: masterIds.has(row.employeeId) ? 'BONUS_MONTH_MASTER' : 'BONUS_MONTH_CARD',
        payload: (t) => {
          const lines = [
            format(t.bonus.monthCardTitle, { month }),
            format(t.bonus.monthCardPoints, { points: String(row.points) }),
            format(t.bonus.monthCardStats, {
              shifts: String(shifts.get(row.employeeId) ?? 0),
              approved: String(row.approved),
            }),
          ];
          if (nominations.employeeOfMonth?.id === row.employeeId)
            lines.push(t.bonus.monthCardEmployeeOfMonth);
          if (unit && winningRecipients.has(row.employeeId))
            lines.push(
              masterIds.has(row.employeeId)
                ? format(t.bonus.monthCardMaster, { unit: unit.name })
                : format(t.bonus.monthCardUnitOfMonth, { unit: unit.name }),
            );
          lines.push(t.bonus.monthCardWish);
          return { text: lines.join('\n') };
        },
        // Preserve the existing delivery key and avoid duplicate historical bot announcements.
        dedupeKey: `bonus-month-card:${month}:${row.employeeId}`,
      });
      if (sent) cards += 1;
    }
    return cards;
  }

  private async shiftCounts(
    tx: DbOrTx,
    month: string,
    totals: readonly EmployeeMonthPoints[],
  ): Promise<Map<string, number>> {
    const rows = await tx
      .select({ employeeId: shiftSessions.employeeId, shifts: sql<number>`count(*)::int` })
      .from(shiftSessions)
      .where(
        and(
          sql`${shiftSessions.businessDate}::text like ${`${month}-%`}`,
          inArray(
            shiftSessions.employeeId,
            totals.map((row) => row.employeeId),
          ),
        ),
      )
      .groupBy(shiftSessions.employeeId);
    return new Map(rows.map((row) => [row.employeeId, row.shifts]));
  }
}
