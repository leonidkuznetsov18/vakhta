import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  authUser,
  bonusPointAwards,
  employeePositions,
  employees,
  eq,
  inArray,
  isNull,
  orgUnits,
  shiftSessions,
  sites,
  sql,
  webUserRoles,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { businessDateOf, previousMonth } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import { DATABASE } from '../infra/database.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * The previous month is only closed once the new one is this many days old: a checklist approved on
 * the first day of the new month still belongs to the old one, so awarding on the 1st could crown
 * the wrong unit.
 */
const CLOSE_AFTER_DAY = 2;

export interface MonthCloseOutcome {
  readonly siteId: string;
  readonly month: string;
  /** The unit with the most checklist points, or null when nobody scored at this site. */
  readonly unitOfMonth: string | null;
  /** Month-end points inserted (unit of the month plus its shift master). */
  readonly awarded: number;
  /** Monthly cards put into the outbox. */
  readonly cards: number;
}

interface EmployeeMonthTotals {
  readonly employeeId: string;
  readonly points: number;
  readonly approved: number;
  readonly orgUnitId: string | null;
}

/**
 * Month-end of the points model (2026-09-08): points reset with the month because every award row
 * carries its month, so nothing is deleted — the ledger is the history. At the turn of the month
 * this service picks the unit of the month, gives every one of its employees and its shift master an
 * extra point, and sends each employee a card in the bot with their score and a warm word. Every
 * step is idempotent: awards conflict on their unique index, cards on their dedupe key.
 */
@Injectable()
export class BonusMonthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  /** Closes the previous month at every site whose local calendar has moved far enough past it. */
  async closeDueMonths(now: Date = new Date()): Promise<MonthCloseOutcome[]> {
    const rows = await this.db.select({ id: sites.id, timezone: sites.timezone }).from(sites);
    const outcomes: MonthCloseOutcome[] = [];
    for (const site of rows) {
      const today = businessDateOf(now, site.timezone);
      if (Number(today.slice(8, 10)) < CLOSE_AFTER_DAY) continue;
      outcomes.push(await this.closeMonth(site.id, previousMonth(today.slice(0, 7)), now));
    }
    return outcomes;
  }

  /** Awards and cards for one site and one month; safe to call again, nothing is duplicated. */
  async closeMonth(
    siteId: string,
    month: string,
    now: Date = new Date(),
  ): Promise<MonthCloseOutcome> {
    return this.db.transaction(async (tx) => {
      const winner = await this.unitOfMonth(tx, siteId, month);
      let awarded = 0;
      if (winner) {
        awarded += await this.awardUnit(tx, winner.orgUnitId, month, now);
        awarded += await this.awardMasters(tx, winner.orgUnitId, month, now);
      }
      const cards = await this.sendCards(tx, siteId, month, winner);
      return { siteId, month, unitOfMonth: winner?.orgUnitId ?? null, awarded, cards };
    });
  }

  /**
   * The unit with the most points from approved checklists. Month-end awards are excluded on
   * purpose: they must not decide the winner they follow from, so a repeated close is stable.
   */
  private async unitOfMonth(
    tx: DbOrTx,
    siteId: string,
    month: string,
  ): Promise<{ orgUnitId: string; name: string; points: number } | null> {
    const rows = await tx
      .select({
        orgUnitId: orgUnits.id,
        name: orgUnits.name,
        points: sql<number>`sum(${bonusPointAwards.points})::int`,
      })
      .from(bonusPointAwards)
      .innerJoin(orgUnits, eq(bonusPointAwards.orgUnitId, orgUnits.id))
      .where(
        and(
          eq(bonusPointAwards.month, month),
          eq(bonusPointAwards.kind, 'CHECKLIST_APPROVED'),
          eq(orgUnits.siteId, siteId),
        ),
      )
      .groupBy(orgUnits.id, orgUnits.name)
      .orderBy(sql`sum(${bonusPointAwards.points}) desc`, asc(orgUnits.name));
    const top = rows[0];
    return top && Number(top.points) > 0
      ? { orgUnitId: top.orgUnitId, name: top.name, points: Number(top.points) }
      : null;
  }

  /** One extra point for every active employee currently assigned to the winning unit. */
  private async awardUnit(
    tx: DbOrTx,
    orgUnitId: string,
    month: string,
    now: Date,
  ): Promise<number> {
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
    return this.insertAwards(
      tx,
      rows.map((r) => r.employeeId),
      { orgUnitId, month, kind: 'UNIT_OF_MONTH', now },
    );
  }

  /**
   * The shift master of the winning unit gets a point too. Web users and employees are separate
   * records, so the master is matched to their employee card by e-mail; without one there is no
   * ledger to credit and no chat to write to, and the panel still names them.
   */
  private async awardMasters(
    tx: DbOrTx,
    orgUnitId: string,
    month: string,
    now: Date,
  ): Promise<number> {
    const ids = await this.masterEmployeeIds(tx, orgUnitId);
    return this.insertAwards(tx, ids, { orgUnitId, month, kind: 'MASTER_OF_MONTH', now });
  }

  private async masterEmployeeIds(tx: DbOrTx, orgUnitId: string): Promise<string[]> {
    const rows = await tx
      .select({ employeeId: employees.id })
      .from(webUserRoles)
      .innerJoin(authUser, eq(webUserRoles.userId, authUser.id))
      .innerJoin(employees, sql`lower(${employees.email}) = lower(${authUser.email})`)
      .where(
        and(
          eq(webUserRoles.role, 'SHIFT_MASTER'),
          eq(webUserRoles.scopeType, 'ORG_UNIT'),
          eq(webUserRoles.scopeId, orgUnitId),
          eq(employees.status, 'ACTIVE'),
        ),
      );
    return [...new Set(rows.map((r) => r.employeeId))];
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

  /** A card for every employee who earned something this month at this site. */
  private async sendCards(
    tx: DbOrTx,
    siteId: string,
    month: string,
    winner: { orgUnitId: string; name: string } | null,
  ): Promise<number> {
    const totals = await this.totals(tx, siteId, month);
    if (totals.length === 0) return 0;
    const shifts = await this.shiftCounts(tx, month, totals);
    const best = totals[0];
    const masterIds = winner
      ? new Set(await this.masterEmployeeIds(tx, winner.orgUnitId))
      : new Set<string>();
    let cards = 0;
    for (const row of totals) {
      const isBest = best !== undefined && row.employeeId === best.employeeId && row.points > 0;
      const inWinningUnit = winner !== null && row.orgUnitId === winner.orgUnitId;
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
          if (isBest) lines.push(t.bonus.monthCardEmployeeOfMonth);
          if (inWinningUnit && winner)
            lines.push(
              masterIds.has(row.employeeId)
                ? format(t.bonus.monthCardMaster, { unit: winner.name })
                : format(t.bonus.monthCardUnitOfMonth, { unit: winner.name }),
            );
          lines.push(t.bonus.monthCardWish);
          return { text: lines.join('\n') };
        },
        dedupeKey: `bonus-month-card:${month}:${row.employeeId}`,
      });
      if (sent) cards += 1;
    }
    return cards;
  }

  /** Points and approved checklists per employee for the month, best first. */
  private async totals(tx: DbOrTx, siteId: string, month: string): Promise<EmployeeMonthTotals[]> {
    const rows = await tx
      .select({
        employeeId: bonusPointAwards.employeeId,
        orgUnitId: bonusPointAwards.orgUnitId,
        points: sql<number>`sum(${bonusPointAwards.points})::int`,
        approved: sql<number>`sum(${bonusPointAwards.points}) filter (where ${bonusPointAwards.kind} = 'CHECKLIST_APPROVED')::int`,
      })
      .from(bonusPointAwards)
      .innerJoin(orgUnits, eq(bonusPointAwards.orgUnitId, orgUnits.id))
      .where(and(eq(bonusPointAwards.month, month), eq(orgUnits.siteId, siteId)))
      .groupBy(bonusPointAwards.employeeId, bonusPointAwards.orgUnitId);
    return rows
      .map((r) => ({
        employeeId: r.employeeId,
        orgUnitId: r.orgUnitId,
        points: Number(r.points ?? 0),
        approved: Number(r.approved ?? 0),
      }))
      .sort((a, b) => b.points - a.points);
  }

  /** How many shifts each of them worked that month; the set is already scoped to the site. */
  private async shiftCounts(
    tx: DbOrTx,
    month: string,
    totals: readonly EmployeeMonthTotals[],
  ): Promise<Map<string, number>> {
    const rows = await tx
      .select({
        employeeId: shiftSessions.employeeId,
        shifts: sql<number>`count(*)::int`,
      })
      .from(shiftSessions)
      .where(
        and(
          sql`${shiftSessions.businessDate}::text like ${`${month}-%`}`,
          inArray(
            shiftSessions.employeeId,
            totals.map((t) => t.employeeId),
          ),
        ),
      )
      .groupBy(shiftSessions.employeeId);
    return new Map(rows.map((r) => [r.employeeId, Number(r.shifts)]));
  }
}
