import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  activityIntervals,
  and,
  asc,
  bonusAdjustments,
  bonusCriteriaResults,
  bonusPeriodResults,
  bonusPeriods,
  bonusRuleVersions,
  bonusShiftScores,
  desc,
  domainEvents,
  downtimeReports,
  employees,
  eq,
  handoverMedia,
  handoverRecords,
  handoverResolutions,
  inArray,
  isNull,
  like,
  lte,
  mediaObjects,
  ne,
  or,
  orgUnits,
  presenceSessions,
  reasonCodes,
  requests,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  BONUS_CRITERIA,
  DEFAULT_BONUS_RULES,
  evaluateShift,
  handoverDecisionFrom,
  scoreMonth,
  scoreShift,
  type BonusCriterion,
  type BonusRules,
  type CriterionResult,
  type ShiftBonusInputs,
} from '@vakhta/domain';
import type {
  AdjustScoreCommand,
  AdjustmentView,
  BonusPeriodView,
  BonusRuleVersionView,
  ClosePeriodCommand,
  CreateRuleVersionCommand,
  CriterionResultView,
  EmployeeMonthView,
  MyScoresView,
  SecondApprovalCommand,
  SetBaseAmountsCommand,
  ShiftScoreView,
} from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { HandoverChanges } from '../handover/handover-changes.js';
import { IncidentChanges } from '../incidents/incident-changes.js';
import { DATABASE } from '../infra/database.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RequestChanges } from '../requests/request-changes.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { SHIFT_OPTIONS, type ShiftOptions } from '../shift/shift.service.js';

export interface BonusOptions {
  readonly appealWindowDays: number;
}
export const BONUS_OPTIONS = Symbol('BONUS_OPTIONS');

type ScoreRow = typeof bonusShiftScores.$inferSelect;
type RuleRow = typeof bonusRuleVersions.$inferSelect;

const SYSTEM: Actor = { type: 'SYSTEM', id: null, role: 'SYSTEM' };

/**
 * Бонус як чиста функція над журналом (ADR-0007): входи збираються з таблиць рішень,
 * оцінка детермінована, результат зберігається з хешем входів; перерахунок запускають події
 * закриття зміни, рішення по передачі, інциденту, зверненню чи апеляції.
 */
@Injectable()
export class BonusService implements OnModuleInit {
  private readonly logger = new Logger(BonusService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    private readonly shiftChanges: ShiftChanges,
    private readonly handoverChanges: HandoverChanges,
    private readonly incidentChanges: IncidentChanges,
    private readonly requestChanges: RequestChanges,
    @Inject(SHIFT_OPTIONS) private readonly shiftOptions: ShiftOptions,
    @Inject(BONUS_OPTIONS) private readonly options: BonusOptions,
  ) {}

  /** Перерахунок за подіями інших модулів; помилки лише логуються, щоб не ламати транзакції джерела. */
  onModuleInit(): void {
    const safe = (fn: () => Promise<unknown>) => {
      fn().catch((err: unknown) =>
        this.logger.warn(`перерахунок бонусу: ${err instanceof Error ? err.message : String(err)}`),
      );
    };
    this.shiftChanges.stream().subscribe((e) => {
      if (e.state === 'SHIFT_CLOSED' || e.state === 'EMERGENCY_EXIT')
        safe(() => this.evaluate(e.sessionId));
    });
    this.handoverChanges
      .stream()
      .subscribe((e) => safe(() => this.evaluateByHandover(e.handoverId)));
    this.incidentChanges
      .stream()
      .subscribe((e) => safe(() => this.evaluateByIncident(e.incidentId)));
    this.requestChanges.stream().subscribe((e) => safe(() => this.evaluateByRequest(e.requestId)));
  }

  /* ------------------------------------------------------------------ */
  /* Правила                                                             */
  /* ------------------------------------------------------------------ */

  async ruleVersionFor(siteId: string | null, at: Date, tx: DbOrTx = this.db): Promise<RuleRow> {
    const rows = await tx
      .select()
      .from(bonusRuleVersions)
      .where(
        and(
          eq(bonusRuleVersions.isActive, true),
          or(
            isNull(bonusRuleVersions.siteId),
            siteId ? eq(bonusRuleVersions.siteId, siteId) : sql`false`,
          ),
          lte(bonusRuleVersions.validFrom, at),
        ),
      )
      .orderBy(desc(bonusRuleVersions.siteId), desc(bonusRuleVersions.validFrom))
      .limit(1);
    if (rows[0]) return rows[0];
    const [created] = await tx
      .insert(bonusRuleVersions)
      .values({
        siteId: null,
        label: DEFAULT_BONUS_RULES.version,
        validFrom: new Date('2020-01-01T00:00:00Z'),
        rules: DEFAULT_BONUS_RULES,
        createdBy: null,
      })
      .returning();
    if (!created) throw new Error('bonus_rule_versions: insert не повернув рядок');
    return created;
  }

  async listRuleVersions(): Promise<BonusRuleVersionView[]> {
    const rows = await this.db
      .select()
      .from(bonusRuleVersions)
      .orderBy(desc(bonusRuleVersions.validFrom));
    return rows.map((r) => ({
      id: r.id,
      siteId: r.siteId,
      label: r.label,
      validFrom: r.validFrom.toISOString(),
      isActive: r.isActive,
      createdBy: r.createdBy,
      approvedBy: r.approvedBy,
      rules: r.rules,
    }));
  }

  /** Нова версія правил: не застосовується заднім числом до закритих періодів (ТЗ 7.1). */
  async createRuleVersion(
    cmd: CreateRuleVersionCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<BonusRuleVersionView> {
    const rules = {
      ...DEFAULT_BONUS_RULES,
      ...(cmd.rules as Partial<BonusRules>),
      version: cmd.label,
    } as BonusRules;
    const total = BONUS_CRITERIA.reduce((s, c) => s + (rules.criteria[c]?.maxPoints ?? 0), 0);
    if (total !== 100)
      throw new DomainError(
        'BONUS_RULES_INVALID',
        422,
        `Сума максимумів критеріїв має бути 100, зараз ${total}`,
      );
    const [row] = await this.db
      .insert(bonusRuleVersions)
      .values({
        siteId: cmd.siteId ?? null,
        label: cmd.label,
        validFrom: new Date(cmd.validFrom),
        rules,
        createdBy: actor.id,
        createdAt: now,
      })
      .returning();
    if (!row) throw new Error('bonus_rule_versions: insert не повернув рядок');
    await this.audit.record(this.db, {
      actor,
      action: 'bonus.rules.create',
      objectType: 'bonus_rule_version',
      objectId: row.id,
      after: { label: cmd.label, validFrom: cmd.validFrom },
    });
    return {
      id: row.id,
      siteId: row.siteId,
      label: row.label,
      validFrom: row.validFrom.toISOString(),
      isActive: row.isActive,
      createdBy: row.createdBy,
      approvedBy: row.approvedBy,
      rules: row.rules,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Оцінка зміни                                                        */
  /* ------------------------------------------------------------------ */

  async evaluate(sessionId: string, now: Date = new Date()): Promise<ShiftScoreView | null> {
    const view = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(shiftSessions)
        .where(eq(shiftSessions.id, sessionId))
        .limit(1);
      if (!session || (session.state !== 'SHIFT_CLOSED' && session.state !== 'EMERGENCY_EXIT'))
        return null;
      const [summary] = await tx
        .select()
        .from(shiftSummaries)
        .where(eq(shiftSummaries.shiftSessionId, sessionId))
        .limit(1);
      if (!summary) return null;
      const place = session.assignmentId ? await this.placeOf(tx, session.assignmentId) : null;
      const month = session.businessDate.slice(0, 7);
      if (place && (await this.periodClosed(tx, place.siteId, month))) {
        const [existing] = await tx
          .select()
          .from(bonusShiftScores)
          .where(eq(bonusShiftScores.shiftSessionId, sessionId))
          .limit(1);
        return existing ? this.scoreView(tx, existing.id) : null;
      }
      const rule = await this.ruleVersionFor(place?.siteId ?? null, session.startedAt ?? now, tx);
      const { inputs, excludedReason, appealed, plannedMinutes } = await this.collect(
        tx,
        session,
        summary,
        place,
      );

      const [existing] = await tx
        .select()
        .from(bonusShiftScores)
        .where(eq(bonusShiftScores.shiftSessionId, sessionId))
        .limit(1);
      if (existing?.status === 'CONFIRMED') return this.scoreView(tx, existing.id);

      const adjustments = existing
        ? await tx
            .select()
            .from(bonusAdjustments)
            .where(
              and(
                eq(bonusAdjustments.scoreId, existing.id),
                eq(bonusAdjustments.status, 'APPLIED'),
              ),
            )
        : [];
      let results: CriterionResult[] = excludedReason ? [] : evaluateShift(rule.rules, inputs);
      if (!excludedReason) {
        results = results.map((r) => {
          const delta = adjustments
            .filter((a) => a.criterion === r.criterion)
            .reduce((s, a) => s + a.delta, 0);
          if (delta === 0) return r;
          const max = rule.rules.criteria[r.criterion].maxPoints;
          const status =
            r.status === 'not_applicable'
              ? 'earned'
              : r.status === 'pending'
                ? r.status
                : 'confirmed';
          return {
            ...r,
            earnedPoints: Math.min(max, Math.max(0, r.earnedPoints + delta)),
            status,
            basis: [
              ...r.basis,
              ...adjustments
                .filter((a) => a.criterion === r.criterion)
                .map((a) => `ADJUSTMENT:${a.id}:${a.delta}`),
            ],
          };
        });
      }
      const inputsHash = createHash('sha256')
        .update(
          JSON.stringify({
            inputs,
            adjustments: adjustments.map((a) => a.id),
            rule: rule.id,
            excludedReason,
          }),
        )
        .digest('hex');
      const score = excludedReason ? null : scoreShift(rule.rules, results);
      const status = excludedReason
        ? 'NOT_EVALUATED'
        : appealed
          ? 'APPEALED'
          : score?.status === 'manual_review'
            ? 'MANUAL_REVIEW'
            : score?.status === 'preliminary'
              ? 'PENDING'
              : 'PRELIMINARY';
      const values = {
        shiftSessionId: sessionId,
        employeeId: session.employeeId,
        businessDate: session.businessDate,
        ruleVersionId: rule.id,
        status,
        score: score?.score ?? null,
        applicableMax: score?.applicableMaxPoints ?? 0,
        earned: score?.earnedPoints ?? 0,
        plannedMinutes,
        inputsHash,
        computedAt: now,
        excludedReason,
      } as const;
      const [row] = await tx
        .insert(bonusShiftScores)
        .values(values)
        .onConflictDoUpdate({ target: bonusShiftScores.shiftSessionId, set: { ...values } })
        .returning();
      if (!row) throw new Error('bonus_shift_scores: upsert не повернув рядок');
      await tx.delete(bonusCriteriaResults).where(eq(bonusCriteriaResults.scoreId, row.id));
      if (results.length > 0) {
        await tx.insert(bonusCriteriaResults).values(
          results.map((r) => ({
            scoreId: row.id,
            criterion: r.criterion,
            section: rule.rules.criteria[r.criterion].section,
            maxPoints: rule.rules.criteria[r.criterion].maxPoints,
            earnedPoints: r.earnedPoints,
            status: r.status,
            basis: [...r.basis],
          })),
        );
      }
      if (!existing || existing.inputsHash !== inputsHash) {
        await this.events.append(tx, {
          type: 'BONUS_SCORE_COMPUTED',
          source: 'SYSTEM',
          actor: SYSTEM,
          occurredAt: now,
          employeeId: session.employeeId,
          shiftSessionId: sessionId,
          bonusRuleVersionId: rule.id,
          payload: {
            scoreId: row.id,
            score: row.score,
            status,
            applicableMax: row.applicableMax,
            earned: row.earned,
            inputsHash,
          },
        });
      }
      return this.scoreView(tx, row.id);
    });
    return view;
  }

  private async collect(
    tx: DbOrTx,
    session: typeof shiftSessions.$inferSelect,
    summary: typeof shiftSummaries.$inferSelect,
    place: { siteId: string; orgUnitId: string } | null,
  ) {
    const [assignment] = session.assignmentId
      ? await tx
          .select()
          .from(shiftAssignments)
          .where(eq(shiftAssignments.id, session.assignmentId))
          .limit(1)
      : [];
    const plannedMinutes = assignment
      ? Math.round((assignment.planEndAt.getTime() - assignment.planStartAt.getTime()) / 60_000)
      : 720;
    void place;

    const [presence] = session.presenceId
      ? await tx
          .select()
          .from(presenceSessions)
          .where(eq(presenceSessions.id, session.presenceId))
          .limit(1)
      : await tx
          .select()
          .from(presenceSessions)
          .where(
            and(
              eq(presenceSessions.employeeId, session.employeeId),
              lte(presenceSessions.arrivedAt, session.startedAt ?? session.createdAt),
            ),
          )
          .orderBy(desc(presenceSessions.arrivedAt))
          .limit(1);

    const events = await tx
      .select({ type: domainEvents.type, source: domainEvents.source })
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, session.id));
    const closedByEmployee = events.some(
      (e) => e.type === 'SHIFT_CLOSED' && e.source === 'TELEGRAM',
    );
    const corrections = events.filter((e) => e.type === 'SHIFT_CORRECTED').length;
    const unregisteredConfirmed = events.filter(
      (e) => e.type === 'DOWNTIME_UNREGISTERED_CONFIRMED',
    ).length;

    const intervals = await tx
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, session.id))
      .orderBy(asc(activityIntervals.startedAt));
    const limits: Record<string, number> = {
      BREAK: this.shiftOptions.breakMinutes,
      MEAL: this.shiftOptions.mealMinutes,
      SERVICE_TIME: this.shiftOptions.serviceTimeMinutes,
    };
    const exceeded = intervals.filter((i) => {
      const limit = limits[i.state];
      if (!limit || !i.endedAt) return false;
      return (i.endedAt.getTime() - i.startedAt.getTime()) / 60_000 > limit + 5;
    }).length;

    const reports = await tx
      .select({ reasonCode: downtimeReports.reasonCode })
      .from(downtimeReports)
      .where(eq(downtimeReports.shiftSessionId, session.id));
    const reasons = await tx
      .select({ code: reasonCodes.code, notifyMaster: reasonCodes.notifyMaster })
      .from(reasonCodes)
      .where(eq(reasonCodes.kind, 'DOWNTIME'));
    const notifyRequired = new Map(reasons.map((r) => [r.code, r.notifyMaster]));
    const downtimeEvents = intervals
      .filter((i) => i.state === 'DOWNTIME')
      .map((i) => ({
        started: true,
        reasonGiven: i.reasonCode !== null,
        notified:
          i.reasonCode === null
            ? false
            : !notifyRequired.get(i.reasonCode) ||
              reports.some((r) => r.reasonCode === i.reasonCode),
        ended: i.endedAt !== null,
      }));

    const openRequests = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.shiftSessionId, session.id),
          inArray(requests.status, ['SUBMITTED', 'IN_REVIEW']),
          ne(requests.type, 'APPEAL'),
        ),
      );
    const appeals = await tx
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.shiftSessionId, session.id),
          eq(requests.type, 'APPEAL'),
          inArray(requests.status, ['SUBMITTED', 'IN_REVIEW']),
        ),
      );

    const approved = session.assignmentId
      ? await tx
          .select({ type: requests.type, payload: requests.payload })
          .from(requests)
          .where(
            and(
              eq(requests.assignmentId, session.assignmentId),
              eq(requests.status, 'APPROVED'),
              inArray(requests.type, ['LATE', 'EARLY_LEAVE']),
            ),
          )
      : [];
    const approvedLate = approved
      .filter((r) => r.type === 'LATE')
      .reduce((s, r) => Math.max(s, r.payload.approvedMinutes ?? r.payload.minutes ?? 0), 0);
    const approvedEarly = approved
      .filter((r) => r.type === 'EARLY_LEAVE')
      .reduce((s, r) => Math.max(s, r.payload.approvedMinutes ?? r.payload.minutes ?? 0), 0);

    const absences = await tx
      .select({ id: requests.id, type: requests.type })
      .from(requests)
      .where(
        and(
          eq(requests.employeeId, session.employeeId),
          eq(requests.status, 'APPROVED'),
          inArray(requests.type, ['VACATION', 'DAY_OFF', 'SICK']),
          sql`${requests.periodFrom} <= ${session.businessDate}`,
          sql`${requests.periodTo} >= ${session.businessDate}`,
        ),
      );
    const excludedReason = absences[0] ? `ABSENCE_APPROVED:${absences[0].type}` : null;

    const [handover] = await tx
      .select()
      .from(handoverRecords)
      .where(
        and(
          eq(handoverRecords.shiftSessionId, session.id),
          ne(handoverRecords.status, 'SUPERSEDED'),
        ),
      )
      .orderBy(desc(handoverRecords.createdAt))
      .limit(1);
    let handoverInputs: ShiftBonusInputs['handover'] = {
      required: session.zoneId !== null,
      status: null,
      checklistComplete: false,
      cannotComplete: false,
      photos: [],
      remarksComplete: false,
      decision: null,
    };
    if (handover) {
      const photos = await tx
        .select({ quality: mediaObjects.quality })
        .from(handoverMedia)
        .innerJoin(mediaObjects, eq(handoverMedia.mediaObjectId, mediaObjects.id))
        .where(eq(handoverMedia.handoverId, handover.id));
      const [resolution] = await tx
        .select()
        .from(handoverResolutions)
        .where(eq(handoverResolutions.handoverId, handover.id))
        .orderBy(desc(handoverResolutions.at))
        .limit(1);
      const [reason] = resolution?.reasonCode
        ? await tx
            .select({ severity: reasonCodes.severity })
            .from(reasonCodes)
            .where(
              and(eq(reasonCodes.kind, 'HANDOVER'), eq(reasonCodes.code, resolution.reasonCode)),
            )
            .limit(1)
        : [];
      const submitted = handover.status !== 'DRAFT';
      handoverInputs = {
        required: true,
        status: handover.status,
        checklistComplete: submitted && handover.cannotCompleteReason === null,
        cannotComplete: handover.cannotCompleteReason !== null,
        photos: photos.map((p) => p.quality),
        remarksComplete: submitted,
        decision: handoverDecisionFrom(handover.status, reason?.severity ?? null),
      };
    }

    const inputs: ShiftBonusInputs = {
      plan: assignment
        ? { planStartAt: assignment.planStartAt, planEndAt: assignment.planEndAt }
        : null,
      startedAt: session.startedAt ?? session.createdAt,
      endedAt: session.endedAt ?? new Date(),
      lateMinutes: summary.lateMinutes,
      earlyLeaveMinutes: summary.earlyLeaveMinutes,
      approvedLateMinutes: approvedLate,
      approvedEarlyLeaveMinutes: approvedEarly,
      presence: {
        arrived: presence !== undefined,
        departed: presence?.departedAt !== null && presence !== undefined,
      },
      sequence: {
        closedByEmployee,
        emergencyExit: session.state === 'EMERGENCY_EXIT',
        corrections,
        needsClarification: session.needsClarification,
      },
      breaks: { exceeded },
      openRequests: openRequests.length,
      downtime: { events: downtimeEvents, unregisteredConfirmed },
      handover: handoverInputs,
      systemIncident: events.some((e) => e.type === 'SYSTEM_INCIDENT_APPLIED'),
    };
    return { inputs, excludedReason, appealed: appeals.length > 0, plannedMinutes };
  }

  private async evaluateByHandover(handoverId: string): Promise<void> {
    const [row] = await this.db
      .select({ sessionId: handoverRecords.shiftSessionId })
      .from(handoverRecords)
      .where(eq(handoverRecords.id, handoverId))
      .limit(1);
    if (row) await this.evaluate(row.sessionId);
  }

  private async evaluateByIncident(incidentId: string): Promise<void> {
    const rows = await this.db
      .selectDistinct({ sessionId: downtimeReports.shiftSessionId })
      .from(downtimeReports)
      .where(eq(downtimeReports.incidentId, incidentId));
    for (const r of rows) if (r.sessionId) await this.evaluate(r.sessionId);
  }

  private async evaluateByRequest(requestId: string): Promise<void> {
    const [row] = await this.db
      .select({
        sessionId: requests.shiftSessionId,
        assignmentId: requests.assignmentId,
        employeeId: requests.employeeId,
        from: requests.periodFrom,
        to: requests.periodTo,
      })
      .from(requests)
      .where(eq(requests.id, requestId))
      .limit(1);
    if (!row) return;
    const ids = new Set<string>();
    if (row.sessionId) ids.add(row.sessionId);
    if (row.assignmentId) {
      const sessions = await this.db
        .select({ id: shiftSessions.id })
        .from(shiftSessions)
        .where(eq(shiftSessions.assignmentId, row.assignmentId));
      for (const s of sessions) ids.add(s.id);
    }
    if (row.from && row.to) {
      const sessions = await this.db
        .select({ id: shiftSessions.id })
        .from(shiftSessions)
        .where(
          and(
            eq(shiftSessions.employeeId, row.employeeId),
            sql`${shiftSessions.businessDate} >= ${row.from}`,
            sql`${shiftSessions.businessDate} <= ${row.to}`,
          ),
        );
      for (const s of sessions) ids.add(s.id);
    }
    for (const id of ids) await this.evaluate(id);
  }

  /* ------------------------------------------------------------------ */
  /* Коригування (ТЗ 7.7)                                                */
  /* ------------------------------------------------------------------ */

  async adjust(
    scoreId: string,
    cmd: AdjustScoreCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftScoreView> {
    const [score] = await this.db
      .select()
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.id, scoreId))
      .limit(1);
    if (!score) throw new DomainError('SCORE_NOT_FOUND', 404, 'Оцінку не знайдено');
    const [rule] = await this.db
      .select()
      .from(bonusRuleVersions)
      .where(eq(bonusRuleVersions.id, score.ruleVersionId))
      .limit(1);
    const threshold =
      rule?.rules.secondApprovalThreshold ?? DEFAULT_BONUS_RULES.secondApprovalThreshold;
    const needsSecond = cmd.delta < 0 && Math.abs(cmd.delta) > threshold;
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(bonusAdjustments)
        .values({
          scoreId,
          criterion: cmd.criterion,
          delta: cmd.delta,
          reasonCode: cmd.reasonCode,
          comment: cmd.comment,
          authorId: actor.id,
          status: needsSecond ? 'PENDING_SECOND' : 'APPLIED',
          decidedAt: needsSecond ? null : now,
          createdAt: now,
        })
        .returning();
      await this.events.append(tx, {
        type: 'BONUS_ADJUSTED',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId: score.employeeId,
        shiftSessionId: score.shiftSessionId,
        reasonCode: cmd.reasonCode,
        comment: cmd.comment,
        payload: { adjustmentId: row?.id, criterion: cmd.criterion, delta: cmd.delta, needsSecond },
      });
      await this.audit.record(tx, {
        actor,
        action: 'bonus.adjust',
        objectType: 'bonus_shift_score',
        objectId: scoreId,
        after: { criterion: cmd.criterion, delta: cmd.delta, needsSecond },
        reason: `${cmd.reasonCode}: ${cmd.comment}`,
      });
    });
    if (score.status === 'CONFIRMED') {
      // Після закриття періоду коригування лишається окремою проводкою (FR-COR-05); підсумок не переписується.
      return (await this.scoreView(this.db, scoreId))!;
    }
    return (
      (await this.evaluate(score.shiftSessionId, now)) ?? (await this.scoreView(this.db, scoreId))!
    );
  }

  async secondApprove(
    adjustmentId: string,
    cmd: SecondApprovalCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftScoreView> {
    const [adjustment] = await this.db
      .select()
      .from(bonusAdjustments)
      .where(eq(bonusAdjustments.id, adjustmentId))
      .limit(1);
    if (!adjustment) throw new DomainError('ADJUSTMENT_NOT_FOUND', 404, 'Коригування не знайдено');
    if (adjustment.status !== 'PENDING_SECOND')
      throw new DomainError('ADJUSTMENT_DECIDED', 409, 'Коригування вже вирішене');
    if (adjustment.authorId && adjustment.authorId === actor.id)
      throw new DomainError('SECOND_APPROVER_SAME', 403, 'Друге підтвердження дає інша особа');
    await this.db.transaction(async (tx) => {
      await tx
        .update(bonusAdjustments)
        .set({
          status: cmd.decision === 'APPROVED' ? 'APPLIED' : 'REJECTED',
          secondApproverId: actor.id,
          decidedAt: now,
        })
        .where(eq(bonusAdjustments.id, adjustmentId));
      await this.audit.record(tx, {
        actor,
        action: `bonus.adjust.second.${cmd.decision.toLowerCase()}`,
        objectType: 'bonus_adjustment',
        objectId: adjustmentId,
        reason: cmd.comment,
      });
    });
    const [score] = await this.db
      .select()
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.id, adjustment.scoreId))
      .limit(1);
    if (!score) throw new DomainError('SCORE_NOT_FOUND', 404, 'Оцінку не знайдено');
    return (
      (await this.evaluate(score.shiftSessionId, now)) ?? (await this.scoreView(this.db, score.id))!
    );
  }

  /* ------------------------------------------------------------------ */
  /* Період (ТЗ 7.6, матриця 2.1)                                        */
  /* ------------------------------------------------------------------ */

  async period(
    siteId: string,
    month: string,
    employeeId?: string,
    now: Date = new Date(),
  ): Promise<BonusPeriodView> {
    const [period] = await this.db
      .select()
      .from(bonusPeriods)
      .where(and(eq(bonusPeriods.siteId, siteId), eq(bonusPeriods.month, month)))
      .limit(1);
    const scoreRows = await this.db
      .select({
        s: bonusShiftScores,
        name: employees.fullName,
        personnelNumber: employees.personnelNumber,
      })
      .from(bonusShiftScores)
      .innerJoin(employees, eq(bonusShiftScores.employeeId, employees.id))
      .innerJoin(shiftSessions, eq(bonusShiftScores.shiftSessionId, shiftSessions.id))
      .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .leftJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .where(
        and(
          like(bonusShiftScores.businessDate, `${month}-%`),
          or(eq(orgUnits.siteId, siteId), isNull(orgUnits.siteId)),
          employeeId ? eq(bonusShiftScores.employeeId, employeeId) : undefined,
        ),
      )
      .orderBy(asc(employees.fullName), asc(bonusShiftScores.businessDate));
    const results = period
      ? await this.db
          .select()
          .from(bonusPeriodResults)
          .where(eq(bonusPeriodResults.periodId, period.id))
      : [];
    const byEmployee = new Map<
      string,
      { name: string; personnelNumber: string; scores: ScoreRow[] }
    >();
    for (const r of scoreRows) {
      const e = byEmployee.get(r.s.employeeId) ?? {
        name: r.name,
        personnelNumber: r.personnelNumber,
        scores: [],
      };
      e.scores.push(r.s);
      byEmployee.set(r.s.employeeId, e);
    }
    const employeesView: EmployeeMonthView[] = [];
    for (const [id, e] of byEmployee) {
      const views = [];
      for (const s of e.scores) views.push((await this.scoreView(this.db, s.id))!);
      const agg = aggregate(e.scores);
      const stored = results.find((r) => r.employeeId === id);
      employeesView.push({
        employeeId: id,
        employeeName: e.name,
        personnelNumber: e.personnelNumber,
        ...agg,
        baseAmount:
          stored?.baseAmount !== null && stored?.baseAmount !== undefined
            ? Number(stored.baseAmount)
            : null,
        bonusAmount:
          stored?.bonusAmount !== null && stored?.bonusAmount !== undefined
            ? Number(stored.bonusAmount)
            : null,
        scores: views,
      });
    }
    const pendingRows = await this.db
      .select({ a: bonusAdjustments, s: bonusShiftScores, name: employees.fullName })
      .from(bonusAdjustments)
      .innerJoin(bonusShiftScores, eq(bonusAdjustments.scoreId, bonusShiftScores.id))
      .innerJoin(employees, eq(bonusShiftScores.employeeId, employees.id))
      .where(
        and(
          eq(bonusAdjustments.status, 'PENDING_SECOND'),
          like(bonusShiftScores.businessDate, `${month}-%`),
        ),
      );
    const [rule] = period?.ruleVersionId
      ? await this.db
          .select()
          .from(bonusRuleVersions)
          .where(eq(bonusRuleVersions.id, period.ruleVersionId))
          .limit(1)
      : [];
    return {
      id: period?.id ?? null,
      siteId,
      month,
      status: period?.status ?? 'OPEN',
      ruleVersionId: period?.ruleVersionId ?? null,
      ruleLabel: rule?.label ?? null,
      closedBy: period?.closedBy ?? null,
      closedAt: period?.closedAt?.toISOString() ?? null,
      employees: employeesView,
      pendingAdjustments: pendingRows.map((p) => ({
        ...toAdjustmentView(p.a),
        scoreId: p.s.id,
        employeeName: p.name,
        businessDate: p.s.businessDate,
      })),
      serverTime: now.toISOString(),
    };
  }

  /** Закриття періоду: підтверджує оцінені зміни, фіксує версію правил, рахує S_month (ТЗ 7.6). */
  async closePeriod(
    siteId: string,
    month: string,
    cmd: ClosePeriodCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<BonusPeriodView> {
    await this.db.transaction(async (tx) => {
      const rule = await this.ruleVersionFor(siteId, new Date(`${month}-01T00:00:00Z`), tx);
      const [existing] = await tx
        .select()
        .from(bonusPeriods)
        .where(and(eq(bonusPeriods.siteId, siteId), eq(bonusPeriods.month, month)))
        .for('update');
      if (existing?.status === 'CLOSED')
        throw new DomainError('PERIOD_CLOSED', 409, 'Період уже закритий');
      const [period] = existing
        ? await tx
            .update(bonusPeriods)
            .set({ status: 'CLOSED', ruleVersionId: rule.id, closedBy: actor.id, closedAt: now })
            .where(eq(bonusPeriods.id, existing.id))
            .returning()
        : await tx
            .insert(bonusPeriods)
            .values({
              siteId,
              month,
              status: 'CLOSED',
              ruleVersionId: rule.id,
              closedBy: actor.id,
              closedAt: now,
            })
            .returning();
      if (!period) throw new Error('bonus_periods: запис не створено');
      const view = await this.period(siteId, month, undefined, now);
      for (const e of view.employees) {
        const scoreIds = e.scores
          .filter((s) => s.status === 'PRELIMINARY' && s.score !== null)
          .map((s) => s.id);
        if (scoreIds.length > 0) {
          await tx
            .update(bonusShiftScores)
            .set({ status: 'CONFIRMED', confirmedBy: actor.id, confirmedAt: now })
            .where(inArray(bonusShiftScores.id, scoreIds));
        }
        const [stored] = await tx
          .select()
          .from(bonusPeriodResults)
          .where(
            and(
              eq(bonusPeriodResults.periodId, period.id),
              eq(bonusPeriodResults.employeeId, e.employeeId),
            ),
          )
          .limit(1);
        const base =
          stored?.baseAmount !== null && stored?.baseAmount !== undefined
            ? Number(stored.baseAmount)
            : null;
        const bonus = base !== null && e.sMonth !== null ? Math.round(base * e.sMonth) / 100 : null;
        const values = {
          periodId: period.id,
          employeeId: e.employeeId,
          shifts: e.shifts,
          evaluatedShifts: e.evaluatedShifts,
          pendingShifts: e.pendingShifts,
          sMonth: e.sMonth === null ? null : String(e.sMonth),
          weightSum: String(e.weightSum),
          baseAmount: base === null ? null : String(base),
          bonusAmount: bonus === null ? null : String(bonus),
          updatedAt: now,
        };
        await tx
          .insert(bonusPeriodResults)
          .values(values)
          .onConflictDoUpdate({
            target: [bonusPeriodResults.periodId, bonusPeriodResults.employeeId],
            set: values,
          });
        await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: e.employeeId,
          template: 'BONUS_PERIOD_CLOSED',
          payload: (t) => ({
            text: format(t.bonus.periodClosed, {
              month,
              score: e.sMonth === null ? '—' : String(e.sMonth),
            }),
          }),
          dedupeKey: `bonus-period-closed:${period.id}:${e.employeeId}`,
        });
      }
      await this.events.append(tx, {
        type: 'BONUS_PERIOD_CLOSED',
        source: 'WEB',
        actor,
        occurredAt: now,
        bonusRuleVersionId: rule.id,
        comment: cmd.comment,
        payload: { periodId: period.id, siteId, month, employees: view.employees.length },
      });
      await this.audit.record(tx, {
        actor,
        action: 'bonus.period.close',
        objectType: 'bonus_period',
        objectId: period.id,
        after: { month, siteId, ruleVersionId: rule.id },
        reason: cmd.comment,
      });
    });
    return this.period(siteId, month, undefined, now);
  }

  /** Бонусну базу передає HR; сума рахується лише для закритих оцінок (ТЗ 7.6). */
  async setBaseAmounts(
    periodId: string,
    cmd: SetBaseAmountsCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<BonusPeriodView> {
    const [period] = await this.db
      .select()
      .from(bonusPeriods)
      .where(eq(bonusPeriods.id, periodId))
      .limit(1);
    if (!period) throw new DomainError('PERIOD_NOT_FOUND', 404, 'Період не знайдено');
    await this.db.transaction(async (tx) => {
      for (const item of cmd.items) {
        const [stored] = await tx
          .select()
          .from(bonusPeriodResults)
          .where(
            and(
              eq(bonusPeriodResults.periodId, periodId),
              eq(bonusPeriodResults.employeeId, item.employeeId),
            ),
          )
          .limit(1);
        const sMonth =
          stored?.sMonth !== null && stored?.sMonth !== undefined ? Number(stored.sMonth) : null;
        const bonus = sMonth === null ? null : Math.round(item.baseAmount * sMonth) / 100;
        const values = {
          periodId,
          employeeId: item.employeeId,
          shifts: stored?.shifts ?? 0,
          evaluatedShifts: stored?.evaluatedShifts ?? 0,
          pendingShifts: stored?.pendingShifts ?? 0,
          sMonth: stored?.sMonth ?? null,
          weightSum: stored?.weightSum ?? '0',
          baseAmount: String(item.baseAmount),
          bonusAmount: bonus === null ? null : String(bonus),
          updatedAt: now,
        };
        await tx
          .insert(bonusPeriodResults)
          .values(values)
          .onConflictDoUpdate({
            target: [bonusPeriodResults.periodId, bonusPeriodResults.employeeId],
            set: values,
          });
      }
      await this.audit.record(tx, {
        actor,
        action: 'bonus.base.set',
        objectType: 'bonus_period',
        objectId: periodId,
        after: { count: cmd.items.length },
      });
    });
    return this.period(period.siteId, period.month, undefined, now);
  }

  /** Вивантаження для бухгалтерії: лише підтверджені агрегати, кожне вивантаження в аудиті (FR-WEB-04/05). */
  async exportCsv(periodId: string, actor: Actor, now: Date = new Date()): Promise<string> {
    const [period] = await this.db
      .select()
      .from(bonusPeriods)
      .where(eq(bonusPeriods.id, periodId))
      .limit(1);
    if (!period) throw new DomainError('PERIOD_NOT_FOUND', 404, 'Період не знайдено');
    if (period.status !== 'CLOSED')
      throw new DomainError('PERIOD_OPEN', 409, 'Вивантаження доступне лише для закритого періоду');
    const view = await this.period(period.siteId, period.month, undefined, now);
    const lines = [
      `# vakhta bonus export;period=${period.month};site=${period.siteId};rules=${view.ruleLabel ?? ''};generated=${now.toISOString()}`,
      'employee_id;personnel_number;full_name;shifts;evaluated;pending;s_month;base_amount;bonus_amount',
      ...view.employees.map((e) =>
        [
          e.employeeId,
          e.personnelNumber,
          csv(e.employeeName),
          e.shifts,
          e.evaluatedShifts,
          e.pendingShifts,
          e.sMonth ?? '',
          e.baseAmount ?? '',
          e.bonusAmount ?? '',
        ].join(';'),
      ),
    ];
    await this.audit.record(this.db, {
      actor,
      action: 'bonus.export',
      objectType: 'bonus_period',
      objectId: periodId,
      after: { rows: view.employees.length, generatedAt: now.toISOString() },
    });
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Працівник                                                           */
  /* ------------------------------------------------------------------ */

  async myScores(employeeId: string, month: string): Promise<MyScoresView> {
    const rows = await this.db
      .select()
      .from(bonusShiftScores)
      .where(
        and(
          eq(bonusShiftScores.employeeId, employeeId),
          like(bonusShiftScores.businessDate, `${month}-%`),
        ),
      )
      .orderBy(desc(bonusShiftScores.businessDate));
    const scores = [];
    for (const r of rows) scores.push((await this.scoreView(this.db, r.id))!);
    return {
      month,
      sMonth: aggregate(rows).sMonth,
      scores,
      appealDays: this.options.appealWindowDays,
    };
  }

  /** Оцінка для бота: лише власна (перевіряє викликач). */
  async score(scoreId: string): Promise<ShiftScoreView | null> {
    return this.scoreView(this.db, scoreId);
  }

  async scoreView(tx: DbOrTx, scoreId: string): Promise<ShiftScoreView | null> {
    const [row] = await tx
      .select({ s: bonusShiftScores, name: employees.fullName, label: bonusRuleVersions.label })
      .from(bonusShiftScores)
      .innerJoin(employees, eq(bonusShiftScores.employeeId, employees.id))
      .innerJoin(bonusRuleVersions, eq(bonusShiftScores.ruleVersionId, bonusRuleVersions.id))
      .where(eq(bonusShiftScores.id, scoreId))
      .limit(1);
    if (!row) return null;
    const [criteria, adjustments] = await Promise.all([
      tx.select().from(bonusCriteriaResults).where(eq(bonusCriteriaResults.scoreId, scoreId)),
      tx
        .select()
        .from(bonusAdjustments)
        .where(eq(bonusAdjustments.scoreId, scoreId))
        .orderBy(asc(bonusAdjustments.createdAt)),
    ]);
    const order = new Map(BONUS_CRITERIA.map((c, i) => [c, i]));
    return {
      id: row.s.id,
      shiftSessionId: row.s.shiftSessionId,
      employeeId: row.s.employeeId,
      employeeName: row.name,
      businessDate: row.s.businessDate,
      status: row.s.status,
      score: row.s.score,
      earned: row.s.earned,
      applicableMax: row.s.applicableMax,
      plannedMinutes: row.s.plannedMinutes,
      ruleVersionId: row.s.ruleVersionId,
      ruleLabel: row.label,
      computedAt: row.s.computedAt.toISOString(),
      excludedReason: row.s.excludedReason,
      criteria: criteria
        .map((c): CriterionResultView => ({
          criterion: c.criterion as BonusCriterion,
          section: c.section,
          maxPoints: c.maxPoints,
          earnedPoints: c.earnedPoints,
          status: c.status as CriterionResultView['status'],
          basis: c.basis,
        }))
        .sort((a, b) => (order.get(a.criterion) ?? 0) - (order.get(b.criterion) ?? 0)),
      adjustments: adjustments.map(toAdjustmentView),
    };
  }

  private async placeOf(
    tx: DbOrTx,
    assignmentId: string,
  ): Promise<{ siteId: string; orgUnitId: string } | null> {
    const [row] = await tx
      .select({ orgUnitId: shiftAssignments.orgUnitId, siteId: orgUnits.siteId })
      .from(shiftAssignments)
      .innerJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .where(eq(shiftAssignments.id, assignmentId))
      .limit(1);
    return row ?? null;
  }

  private async periodClosed(tx: DbOrTx, siteId: string, month: string): Promise<boolean> {
    const [row] = await tx
      .select({ status: bonusPeriods.status })
      .from(bonusPeriods)
      .where(and(eq(bonusPeriods.siteId, siteId), eq(bonusPeriods.month, month)))
      .limit(1);
    return row?.status === 'CLOSED';
  }
}

function aggregate(scores: readonly ScoreRow[]) {
  const evaluated = scores.filter(
    (s) => s.score !== null && (s.status === 'PRELIMINARY' || s.status === 'CONFIRMED'),
  );
  const pending = scores.filter(
    (s) => s.status === 'PENDING' || s.status === 'MANUAL_REVIEW' || s.status === 'APPEALED',
  );
  const sMonth = scoreMonth(
    evaluated.map((s) => ({ score: s.score!, plannedMinutes: s.plannedMinutes })),
  );
  return {
    shifts: scores.filter((s) => s.status !== 'NOT_EVALUATED').length,
    evaluatedShifts: evaluated.length,
    pendingShifts: pending.length,
    sMonth,
    weightSum: Math.round(evaluated.reduce((s, x) => s + x.plannedMinutes / 720, 0) * 1000) / 1000,
  };
}

function toAdjustmentView(a: typeof bonusAdjustments.$inferSelect): AdjustmentView {
  return {
    id: a.id,
    criterion: a.criterion as BonusCriterion,
    delta: a.delta,
    reasonCode: a.reasonCode,
    comment: a.comment,
    authorId: a.authorId,
    status: a.status,
    secondApproverId: a.secondApproverId,
    createdAt: a.createdAt.toISOString(),
  };
}

function csv(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
