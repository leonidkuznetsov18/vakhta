import { readMonthNominations } from './bonus-month-nominations.js';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { Inject, Injectable } from '@nestjs/common';
import {
  bonusPresenceId,
  lockBonusMonthWithin,
  activityIntervals,
  and,
  asc,
  bonusAdjustments,
  bonusCriteriaResults,
  bonusPeriodResults,
  bonusPeriods,
  bonusPointAwards,
  bonusRuleVersions,
  bonusShiftScores,
  desc,
  domainEvents,
  downtimeReports,
  employeePositions,
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
  webUserRoles,
  authUser,
  presenceSessions,
  reasonCodes,
  requests,
  shiftAssignments,
  shiftSessions,
  shiftSummaries,
  sql,
  type Database,
  type DbOrTx,
  type Transaction,
} from '@vakhta/db';
import {
  BONUS_CRITERIA,
  DEFAULT_BONUS_RULES,
  evaluateShift,
  handoverDecisionFrom,
  reviewSuggestion,
  scoreMonth,
  DEFAULT_LOCALE,
  scoreShift,
  withScoreAdjustments,
  type BonusCriterion,
  type BonusRules,
  type CriterionResult,
  type ShiftBonusInputs,
} from '@vakhta/domain';
import type {
  AdjustScoreCommand,
  CancelAdjustmentCommand,
  ReviewScoreCommand,
  UpdateAdjustmentCommand,
  AdjustmentView,
  BonusPeriodView,
  BonusRuleVersionView,
  ClosePeriodCommand,
  ReopenPeriodCommand,
  CreateRuleVersionCommand,
  CriterionResultView,
  EmployeeMonthView,
  MyScoresView,
  BonusPointsView,
  BonusHistoryEntry,
  BonusHistoryQuery,
  BonusHistoryView,
  EmployeePointsView,
  UnitPointsView,
  SecondApprovalCommand,
  SetBaseAmountsCommand,
  ShiftScoreView,
} from '@vakhta/contracts';
import { format, messages, type Locale } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { isSerializationFailure } from '../common/pg-errors.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
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
export class BonusService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    @Inject(SHIFT_OPTIONS) private readonly shiftOptions: ShiftOptions,
    @Inject(BONUS_OPTIONS) private readonly options: BonusOptions,
  ) {}

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
    return this.db.transaction((tx) => this.evaluateWithin(tx, sessionId, now));
  }

  /** Database-only evaluation: the caller owns the task transaction, if any. */
  async evaluateWithin(
    tx: Transaction,
    sessionId: string,
    now: Date = new Date(),
  ): Promise<ShiftScoreView | null> {
    const [target] = await tx
      .select({ date: shiftSessions.businessDate })
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    if (!target) return null;
    await lockBonusMonthWithin(tx, target.date.slice(0, 7));
    const [session] = await tx
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId))
      .for('no key update');
    if (!session || (session.state !== 'SHIFT_CLOSED' && session.state !== 'EMERGENCY_EXIT'))
      return null;
    const [summary] = await tx
      .select()
      .from(shiftSummaries)
      .where(eq(shiftSummaries.shiftSessionId, sessionId))
      .limit(1);
    if (!summary)
      throw new DomainError('BONUS_SUMMARY_MISSING', 409, 'Terminal shift summary is missing');
    const place = session.assignmentId ? await this.placeOf(tx, session.assignmentId) : null;
    const month = session.businessDate.slice(0, 7);
    if (await this.periodClosed(tx, place?.siteId ?? null, month)) {
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
            and(eq(bonusAdjustments.scoreId, existing.id), eq(bonusAdjustments.status, 'APPLIED')),
          )
      : [];
    let results: CriterionResult[] = excludedReason ? [] : evaluateShift(rule.rules, inputs);
    const scoreLevel = adjustments.filter((a) => a.criterion === null).map((a) => a.delta);
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
          adjustments: adjustments
            .map((a) => ({ id: a.id, criterion: a.criterion, delta: a.delta, status: a.status }))
            .sort((a, b) => a.id.localeCompare(b.id)),
          review: existing
            ? {
                decision: existing.reviewDecision,
                score: existing.manualScore,
                comment: existing.reviewComment,
              }
            : null,
          rule: rule.id,
          excludedReason,
        }),
      )
      .digest('hex');
    const score = excludedReason ? null : scoreShift(rule.rules, results);
    // A manual review (spec 7.6) settles a shift the rules cannot score: the master's number
    // stands in for the computed one, or the shift leaves the month.
    const reviewed = score?.status === 'manual_review' ? existing : null;
    const excludedByReview = reviewed?.reviewDecision === 'EXCLUDE';
    const manualScore =
      reviewed?.reviewDecision === 'SCORE' && reviewed.manualScore !== null
        ? reviewed.manualScore
        : null;
    const computedScore = manualScore ?? score?.score ?? null;
    const finalScore =
      computedScore === null || scoreLevel.length === 0
        ? computedScore
        : withScoreAdjustments(computedScore, scoreLevel);
    const status =
      excludedReason || excludedByReview
        ? 'NOT_EVALUATED'
        : appealed
          ? 'APPEALED'
          : score?.status === 'manual_review' && manualScore === null
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
      score: status === 'NOT_EVALUATED' ? null : finalScore,
      applicableMax: score?.applicableMaxPoints ?? 0,
      earned: score?.earnedPoints ?? 0,
      plannedMinutes,
      inputsHash,
      computedAt: now,
      excludedReason:
        excludedReason ??
        (excludedByReview ? `MANUAL_REVIEW:${reviewed?.reviewComment ?? ''}` : null),
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

    const [presence] = await tx
      .select()
      .from(presenceSessions)
      .where(
        eq(
          presenceSessions.id,
          bonusPresenceId(
            sql`${session.presenceId}`,
            sql`${session.employeeId}`,
            sql`${(session.startedAt ?? session.createdAt).toISOString()}::timestamptz`,
          ),
        ),
      )
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
      .filter((i) => i.state === 'DOWNTIME' && (i.endedAt === null || i.endedAt > i.startedAt))
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
    // No report at all: the position has no checklist, the criteria do not apply (spec 7.6).
    let handoverInputs: ShiftBonusInputs['handover'] = {
      required: false,
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
      // Spec 7.6: without a zone the handover criteria apply only once the report was actually
      // submitted; a draft left behind by a master override keeps the 70-point maximum.
      handoverInputs = {
        required: session.zoneId !== null || submitted,
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

  /* ------------------------------------------------------------------ */
  /* Коригування (ТЗ 7.7)                                                */
  /* ------------------------------------------------------------------ */

  async adjust(
    scoreId: string,
    cmd: AdjustScoreCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftScoreView> {
    return this.db.transaction(async (tx) => {
      const score = await this.requireMutableScoreWithin(tx, scoreId);
      const [rule] = await tx
        .select()
        .from(bonusRuleVersions)
        .where(eq(bonusRuleVersions.id, score.ruleVersionId))
        .limit(1);
      const threshold =
        rule?.rules.secondApprovalThreshold ?? DEFAULT_BONUS_RULES.secondApprovalThreshold;
      const needsSecond = cmd.delta < 0 && Math.abs(cmd.delta) > threshold;
      if (score.status === 'CONFIRMED') {
        throw new DomainError('PERIOD_CLOSED', 409, 'The period is closed; the score is confirmed');
      }
      const criterion = cmd.criterion ?? null;

      const [row] = await tx
        .insert(bonusAdjustments)
        .values({
          scoreId,
          criterion,
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
        payload: { adjustmentId: row?.id, criterion, delta: cmd.delta, needsSecond },
      });
      await this.audit.record(tx, {
        actor,
        action: 'bonus.adjust',
        objectType: 'bonus_shift_score',
        objectId: scoreId,
        after: { adjustmentId: row?.id, criterion, delta: cmd.delta, needsSecond },
        reason: `${cmd.reasonCode}: ${cmd.comment}`,
      });
      // The employee learns about the points at once; a penalty over the threshold waits for
      // the second approval and is announced when it applies.
      if (!needsSecond) {
        await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: score.employeeId,
          template: 'BONUS_ADJUSTED',
          payload: (t) => ({
            text: format(
              cmd.delta > 0 ? t.bonus.bonusAddedNotification : t.bonus.bonusRemovedNotification,
              {
                points: Math.abs(cmd.delta),
                date: score.businessDate,
                comment: cmd.comment,
              },
            ),
          }),
          dedupeKey: `bonus-adjusted:${row?.id}`,
        });
      }
      return (
        (await this.evaluateWithin(tx, score.shiftSessionId, now)) ??
        (await this.scoreView(tx, scoreId))!
      );
    });
  }

  /** Changes the points, reason or comment of an adjustment while the period is open. */
  async updateAdjustment(
    adjustmentId: string,
    cmd: UpdateAdjustmentCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftScoreView> {
    return this.db.transaction(async (tx) => {
      const { adjustment, score } = await this.requireOpenAdjustment(tx, adjustmentId);
      const patch = {
        ...(cmd.delta !== undefined ? { delta: cmd.delta } : {}),
        ...(cmd.reasonCode !== undefined ? { reasonCode: cmd.reasonCode } : {}),
        ...(cmd.comment !== undefined ? { comment: cmd.comment } : {}),
      };
      if (Object.keys(patch).length === 0) return (await this.scoreView(tx, score.id))!;
      const [rule] = await tx
        .select()
        .from(bonusRuleVersions)
        .where(eq(bonusRuleVersions.id, score.ruleVersionId))
        .limit(1);
      const threshold =
        rule?.rules.secondApprovalThreshold ?? DEFAULT_BONUS_RULES.secondApprovalThreshold;
      const delta = cmd.delta ?? adjustment.delta;
      const needsSecond = delta < 0 && Math.abs(delta) > threshold;

      await tx
        .update(bonusAdjustments)
        .set({
          ...patch,
          status: needsSecond ? 'PENDING_SECOND' : 'APPLIED',
          secondApproverId: null,
          decidedAt: needsSecond ? null : now,
        })
        .where(eq(bonusAdjustments.id, adjustment.id));
      await this.events.append(tx, {
        type: 'BONUS_ADJUSTMENT_UPDATED',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId: score.employeeId,
        shiftSessionId: score.shiftSessionId,
        payload: { adjustmentId: adjustment.id, ...patch, needsSecond },
      });
      await this.audit.record(tx, {
        actor,
        action: 'bonus.adjustment.update',
        objectType: 'bonus_adjustment',
        objectId: adjustment.id,
        before: {
          delta: adjustment.delta,
          reasonCode: adjustment.reasonCode,
          comment: adjustment.comment,
        },
        after: patch,
      });
      return (
        (await this.evaluateWithin(tx, score.shiftSessionId, now)) ??
        (await this.scoreView(tx, score.id))!
      );
    });
  }

  /** Withdraws an adjustment; the row stays as history with the reason, the score is recomputed. */
  async cancelAdjustment(
    adjustmentId: string,
    cmd: CancelAdjustmentCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftScoreView> {
    return this.db.transaction(async (tx) => {
      const { adjustment, score } = await this.requireOpenAdjustment(tx, adjustmentId);

      await tx
        .update(bonusAdjustments)
        .set({ status: 'CANCELLED', decidedAt: now })
        .where(eq(bonusAdjustments.id, adjustment.id));
      await this.events.append(tx, {
        type: 'BONUS_ADJUSTMENT_CANCELLED',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId: score.employeeId,
        shiftSessionId: score.shiftSessionId,
        comment: cmd.reason,
        payload: { adjustmentId: adjustment.id, delta: adjustment.delta },
      });
      await this.audit.record(tx, {
        actor,
        action: 'bonus.adjustment.cancel',
        objectType: 'bonus_adjustment',
        objectId: adjustment.id,
        before: { delta: adjustment.delta, status: adjustment.status },
        reason: cmd.reason,
      });
      return (
        (await this.evaluateWithin(tx, score.shiftSessionId, now)) ??
        (await this.scoreView(tx, score.id))!
      );
    });
  }

  /**
   * Finishes the manual review of a shift the rules could not score (spec 7.6): the master
   * either sets the score or excludes the shift from the month. Both are audited and the
   * employee is told.
   */
  async review(
    scoreId: string,
    cmd: ReviewScoreCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftScoreView> {
    return this.db.transaction(async (tx) => {
      const score = await this.requireMutableScoreWithin(tx, scoreId);
      if (score.status === 'CONFIRMED') {
        throw new DomainError('PERIOD_CLOSED', 409, 'The period is closed; the score is confirmed');
      }
      if (score.status !== 'MANUAL_REVIEW' && score.reviewDecision === null) {
        throw new DomainError('REVIEW_NOT_NEEDED', 409, 'The shift is scored by the rules');
      }

      await tx
        .update(bonusShiftScores)
        .set({
          reviewDecision: cmd.decision,
          manualScore: cmd.decision === 'SCORE' ? (cmd.score ?? null) : null,
          reviewedBy: actor.id,
          reviewedAt: now,
          reviewComment: cmd.comment,
        })
        .where(eq(bonusShiftScores.id, scoreId));
      await this.events.append(tx, {
        type: 'BONUS_SCORE_REVIEWED',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId: score.employeeId,
        shiftSessionId: score.shiftSessionId,
        comment: cmd.comment,
        payload: { scoreId, decision: cmd.decision, score: cmd.score ?? null },
      });
      await this.audit.record(tx, {
        actor,
        action: 'bonus.review',
        objectType: 'bonus_shift_score',
        objectId: scoreId,
        before: { status: score.status, score: score.score },
        after: { decision: cmd.decision, score: cmd.score ?? null },
        reason: cmd.comment,
      });
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: score.employeeId,
        template: 'BONUS_REVIEWED',
        payload: (t) => ({
          text: format(
            cmd.decision === 'SCORE' ? t.bonus.reviewedNotification : t.bonus.excludedNotification,
            { date: score.businessDate, score: cmd.score ?? 0, comment: cmd.comment },
          ),
        }),
        dedupeKey: `bonus-reviewed:${scoreId}:${now.getTime()}`,
      });
      return (
        (await this.evaluateWithin(tx, score.shiftSessionId, now)) ??
        (await this.scoreView(tx, scoreId))!
      );
    });
  }

  private async requireMutableScoreWithin(tx: Transaction, scoreId: string): Promise<ScoreRow> {
    const [target] = await tx
      .select({ sessionId: bonusShiftScores.shiftSessionId, date: bonusShiftScores.businessDate })
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.id, scoreId));
    if (!target) throw new DomainError('SCORE_NOT_FOUND', 404, 'Score not found');
    await lockBonusMonthWithin(tx, target.date.slice(0, 7));
    const [session] = await tx
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, target.sessionId))
      .for('no key update');
    if (!session) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Shift not found');
    const place = session.assignmentId ? await this.placeOf(tx, session.assignmentId) : null;
    const closed = await this.periodClosed(tx, place?.siteId ?? null, target.date.slice(0, 7));
    const [score] = await tx
      .select()
      .from(bonusShiftScores)
      .where(eq(bonusShiftScores.id, scoreId))
      .for('no key update');
    if (!score) throw new DomainError('SCORE_NOT_FOUND', 404, 'Score not found');
    if (closed || score.status === 'CONFIRMED')
      throw new DomainError('PERIOD_CLOSED', 409, 'The score belongs to a closed period');
    return score;
  }

  private async requireOpenAdjustment(tx: Transaction, adjustmentId: string) {
    const [target] = await tx
      .select({ scoreId: bonusAdjustments.scoreId })
      .from(bonusAdjustments)
      .where(eq(bonusAdjustments.id, adjustmentId));
    if (!target) throw new DomainError('ADJUSTMENT_NOT_FOUND', 404, 'Adjustment not found');
    const score = await this.requireMutableScoreWithin(tx, target.scoreId);
    const [adjustment] = await tx
      .select()
      .from(bonusAdjustments)
      .where(eq(bonusAdjustments.id, adjustmentId))
      .for('no key update');
    if (!adjustment) throw new DomainError('ADJUSTMENT_NOT_FOUND', 404, 'Adjustment not found');
    if (adjustment.status === 'CANCELLED' || adjustment.status === 'REJECTED')
      throw new DomainError('ADJUSTMENT_DECIDED', 409, 'The adjustment is already withdrawn');
    return { adjustment, score };
  }

  async secondApprove(
    adjustmentId: string,
    cmd: SecondApprovalCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<ShiftScoreView> {
    return this.db.transaction(async (tx) => {
      const { adjustment, score } = await this.requireOpenAdjustment(tx, adjustmentId);
      if (adjustment.status !== 'PENDING_SECOND')
        throw new DomainError('ADJUSTMENT_DECIDED', 409, 'Коригування вже вирішене');
      if (adjustment.authorId && adjustment.authorId === actor.id)
        throw new DomainError('SECOND_APPROVER_SAME', 403, 'Друге підтвердження дає інша особа');

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
      await this.events.append(tx, {
        type: 'BONUS_ADJUSTMENT_SECOND_DECIDED',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId: score.employeeId,
        shiftSessionId: score.shiftSessionId,
        payload: { adjustmentId, decision: cmd.decision },
        comment: cmd.comment,
      });
      return (
        (await this.evaluateWithin(tx, score.shiftSessionId, now)) ??
        (await this.scoreView(tx, score.id))!
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* Період (ТЗ 7.6, матриця 2.1)                                        */
  /* ------------------------------------------------------------------ */

  /**
   * The read-only points view (2026-09-08): points come only from approved checklists, one each.
   * Per employee for the month: closed shifts, checklists submitted, checklists the master approved
   * or returned with a remark, and the points earned. Computed from the shift and handover tables;
   * nothing here writes or scores.
   */
  async points(
    siteId: string | null,
    month: string,
    now: Date = new Date(),
  ): Promise<BonusPointsView> {
    // `business_date` is a real date column: LIKE has no operator for it, so the value is cast.
    const inMonth = sql`${shiftSessions.businessDate}::text like ${`${month}-%`}`;
    const shiftRows = await this.db
      .select({
        employeeId: shiftSessions.employeeId,
        name: employees.fullName,
        personnelNumber: employees.personnelNumber,
        shifts: sql<number>`count(*)::int`,
      })
      .from(shiftSessions)
      .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
      .where(and(inArray(shiftSessions.state, ['SHIFT_CLOSED', 'EMERGENCY_EXIT']), inMonth))
      .groupBy(shiftSessions.employeeId, employees.fullName, employees.personnelNumber);

    const handoverRows = await this.db
      .select({
        employeeId: handoverRecords.submittedBy,
        name: employees.fullName,
        personnelNumber: employees.personnelNumber,
        checklists: sql<number>`count(*) filter (where ${handoverRecords.status} not in ('DRAFT','SUPERSEDED'))::int`,
        approved: sql<number>`count(*) filter (where ${handoverRecords.status} in ('ACCEPTED','RESOLVED_ACCEPTED'))::int`,
        remarks: sql<number>`count(*) filter (where ${handoverRecords.status} = 'RESOLVED_ISSUE_CONFIRMED')::int`,
      })
      .from(handoverRecords)
      .innerJoin(shiftSessions, eq(handoverRecords.shiftSessionId, shiftSessions.id))
      .innerJoin(employees, eq(handoverRecords.submittedBy, employees.id))
      .where(inMonth)
      .groupBy(handoverRecords.submittedBy, employees.fullName, employees.personnelNumber);

    const byId = new Map<string, EmployeePointsView>();
    for (const r of shiftRows) {
      byId.set(r.employeeId, {
        employeeId: r.employeeId,
        employeeName: r.name,
        personnelNumber: r.personnelNumber,
        orgUnitId: null,
        orgUnitName: null,
        shifts: Number(r.shifts),
        checklists: 0,
        approved: 0,
        remarks: 0,
        points: 0,
      });
    }
    for (const r of handoverRows) {
      const row = byId.get(r.employeeId) ?? {
        employeeId: r.employeeId,
        employeeName: r.name,
        personnelNumber: r.personnelNumber,
        orgUnitId: null,
        orgUnitName: null,
        shifts: 0,
        checklists: 0,
        approved: 0,
        remarks: 0,
        points: 0,
      };
      row.checklists = Number(r.checklists);
      row.approved = Number(r.approved);
      row.remarks = Number(r.remarks);
      byId.set(r.employeeId, row);
    }
    // Points come from the ledger, not from counting handovers: month-end awards live there too and
    // the month's total resets by itself because every row carries its month.
    const pointRows = await this.db
      .select({
        employeeId: bonusPointAwards.employeeId,
        points: sql<number>`sum(${bonusPointAwards.points})::int`,
      })
      .from(bonusPointAwards)
      .where(eq(bonusPointAwards.month, month))
      .groupBy(bonusPointAwards.employeeId);
    for (const r of pointRows) {
      const row = byId.get(r.employeeId);
      if (row) byId.set(r.employeeId, { ...row, points: Number(r.points) });
    }

    // Each employee's current unit, so points can be filtered and rolled up per unit. The unit also
    // says which site the person belongs to: a site view keeps only the people who work there.
    const unitRows = await this.db
      .select({
        employeeId: employeePositions.employeeId,
        orgUnitId: employeePositions.orgUnitId,
        orgUnitName: orgUnits.name,
        siteId: orgUnits.siteId,
      })
      .from(employeePositions)
      .innerJoin(orgUnits, eq(employeePositions.orgUnitId, orgUnits.id))
      .where(isNull(employeePositions.validTo));
    if (siteId) {
      // Only people who clearly belong somewhere else are hidden: an employee without a current
      // position has no site of their own, and dropping them would lose their points entirely.
      const elsewhere = new Set(
        unitRows.filter((r) => r.siteId !== siteId).map((r) => r.employeeId),
      );
      const here = new Set(unitRows.filter((r) => r.siteId === siteId).map((r) => r.employeeId));
      for (const id of [...byId.keys()]) if (elsewhere.has(id) && !here.has(id)) byId.delete(id);
    }
    const unitOf = new Map<string, { id: string; name: string }>();
    for (const r of unitRows) {
      if (!unitOf.has(r.employeeId))
        unitOf.set(r.employeeId, { id: r.orgUnitId, name: r.orgUnitName });
    }
    for (const [id, row] of byId) {
      const unit = unitOf.get(id);
      byId.set(id, {
        ...row,
        orgUnitId: unit?.id ?? null,
        orgUnitName: unit?.name ?? null,
      });
    }

    // Shift masters per unit, to show who is responsible for the unit's points.
    const masterRows = await this.db
      .select({ scopeId: webUserRoles.scopeId, name: authUser.name })
      .from(webUserRoles)
      .innerJoin(authUser, eq(webUserRoles.userId, authUser.id))
      .where(and(eq(webUserRoles.role, 'SHIFT_MASTER'), eq(webUserRoles.scopeType, 'ORG_UNIT')))
      .orderBy(asc(authUser.name));
    const mastersByUnit = new Map<string, string[]>();
    for (const m of masterRows) {
      if (!m.scopeId) continue;
      mastersByUnit.set(m.scopeId, [...(mastersByUnit.get(m.scopeId) ?? []), m.name]);
    }

    const employeesView = [...byId.values()].sort(
      (a, b) => b.points - a.points || a.employeeName.localeCompare(b.employeeName),
    );
    const unitAgg = new Map<string, UnitPointsView>();
    for (const e of employeesView) {
      const key = e.orgUnitId ?? '';
      const row =
        unitAgg.get(key) ??
        ({
          orgUnitId: e.orgUnitId,
          orgUnitName: e.orgUnitName,
          masters: e.orgUnitId ? (mastersByUnit.get(e.orgUnitId) ?? []) : [],
          employees: 0,
          approved: 0,
          remarks: 0,
          points: 0,
        } satisfies UnitPointsView);
      unitAgg.set(key, {
        ...row,
        employees: row.employees + 1,
        approved: row.approved + e.approved,
        remarks: row.remarks + e.remarks,
        points: row.points + e.points,
      });
    }
    const units = [...unitAgg.values()].sort(
      (a, b) => b.points - a.points || (a.orgUnitName ?? '').localeCompare(b.orgUnitName ?? ''),
    );
    const nominations = await readMonthNominations(this.db, siteId, month);
    return {
      siteId,
      month,
      employees: employeesView,
      units,
      ...nominations,
      serverTime: now.toISOString(),
    };
  }

  /**
   * Points history for the "History" tab: totals per day, month or year from the ledger, split into
   * checklist points and month-end awards so the shape of a period is readable at a glance.
   */
  async history(q: BonusHistoryQuery, now: Date = new Date()): Promise<BonusHistoryView> {
    // The pattern is written into the statement, not bound: a bound parameter makes the select and
    // the group-by two different expressions and Postgres refuses the query. The value comes from a
    // closed enum, never from the caller's text.
    const fmt = sql.raw(
      q.groupBy === 'day' ? `'YYYY-MM-DD'` : q.groupBy === 'month' ? `'YYYY-MM'` : `'YYYY'`,
    );
    const day = this.awardDay();
    const where = and(...this.historyConditions(q));
    const rows = await this.db
      .select({
        key: sql<string>`to_char(${day}::date, ${fmt})`,
        points: sql<number>`sum(${bonusPointAwards.points})::int`,
        checklistPoints: sql<number>`sum(${bonusPointAwards.points}) filter (where ${bonusPointAwards.kind} = 'CHECKLIST_APPROVED')::int`,
        awardPoints: sql<number>`sum(${bonusPointAwards.points}) filter (where ${bonusPointAwards.kind} <> 'CHECKLIST_APPROVED')::int`,
        employees: sql<number>`count(distinct ${bonusPointAwards.employeeId})::int`,
        units: sql<
          string[]
        >`coalesce(array_agg(distinct ${orgUnits.name}) filter (where ${orgUnits.name} is not null), '{}')`,
      })
      .from(bonusPointAwards)
      .innerJoin(employees, eq(bonusPointAwards.employeeId, employees.id))
      .leftJoin(orgUnits, eq(bonusPointAwards.orgUnitId, orgUnits.id))
      .where(where)
      // Grouping by the output column keeps the two expressions provably identical.
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const entries = await this.historyEntries(q, q.limit);
    const [counted] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(bonusPointAwards)
      .innerJoin(employees, eq(bonusPointAwards.employeeId, employees.id))
      .leftJoin(orgUnits, eq(bonusPointAwards.orgUnitId, orgUnits.id))
      .where(where);

    return {
      groupBy: q.groupBy,
      buckets: rows.map((r) => ({
        key: r.key,
        points: Number(r.points ?? 0),
        checklistPoints: Number(r.checklistPoints ?? 0),
        awardPoints: Number(r.awardPoints ?? 0),
        employees: Number(r.employees ?? 0),
        units: r.units ?? [],
      })),
      entries,
      total: Number(counted?.total ?? 0),
      serverTime: now.toISOString(),
    };
  }

  /** Month-end awards carry no business date; they belong to the first day of their month. */
  private awardDay() {
    return sql<string>`coalesce(${bonusPointAwards.businessDate}::text, ${bonusPointAwards.month} || '-01')`;
  }

  private historyConditions(q: BonusHistoryQuery) {
    const day = this.awardDay();
    const conditions = [sql`${day} >= ${q.from}`, sql`${day} <= ${q.to}`];
    if (q.siteId) conditions.push(eq(orgUnits.siteId, q.siteId));
    if (q.employeeId) conditions.push(eq(bonusPointAwards.employeeId, q.employeeId));
    if (q.orgUnitId) conditions.push(eq(bonusPointAwards.orgUnitId, q.orgUnitId));
    if (q.kind) conditions.push(eq(bonusPointAwards.kind, q.kind));
    if (q.search) {
      const like = `%${q.search.toLowerCase()}%`;
      conditions.push(
        sql`(lower(${employees.fullName}) like ${like} or lower(${employees.personnelNumber}) like ${like})`,
      );
    }
    return conditions;
  }

  /** The awards behind the totals, named and newest first, for reading and for the export. */
  private async historyEntries(q: BonusHistoryQuery, limit: number): Promise<BonusHistoryEntry[]> {
    const day = this.awardDay();
    const rows = await this.db
      .select({
        id: bonusPointAwards.id,
        businessDate: bonusPointAwards.businessDate,
        month: bonusPointAwards.month,
        employeeId: bonusPointAwards.employeeId,
        employeeName: employees.fullName,
        personnelNumber: employees.personnelNumber,
        orgUnitId: bonusPointAwards.orgUnitId,
        orgUnitName: orgUnits.name,
        kind: bonusPointAwards.kind,
        points: bonusPointAwards.points,
      })
      .from(bonusPointAwards)
      .innerJoin(employees, eq(bonusPointAwards.employeeId, employees.id))
      .leftJoin(orgUnits, eq(bonusPointAwards.orgUnitId, orgUnits.id))
      .where(and(...this.historyConditions(q)))
      .orderBy(sql`${day} desc`, asc(employees.fullName))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      businessDate: r.businessDate,
      month: r.month,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      personnelNumber: r.personnelNumber,
      orgUnitId: r.orgUnitId,
      orgUnitName: r.orgUnitName,
      kind: r.kind,
      points: r.points,
    }));
  }

  /** The same rows as the History tab, as a file. Every download is audited, like a report. */
  async exportHistory(
    q: BonusHistoryQuery,
    format: 'csv' | 'xlsx',
    actor: Actor,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const t = messages(locale).admin.bonus;
    const entries = await this.historyEntries(q, 20_000);
    const header = [
      t.historyDate,
      t.month,
      t.employee,
      t.personnelNumber,
      t.unit,
      t.historyReason,
      t.points,
    ];
    const matrix = entries.map((e) => [
      e.businessDate ?? '',
      e.month,
      e.employeeName,
      e.personnelNumber,
      e.orgUnitName ?? '',
      t.historyKinds[e.kind],
      e.points,
    ]);
    await this.audit.record(this.db, {
      actor,
      action: 'bonus.history.export',
      objectType: 'bonus',
      objectId: 'history',
      after: {
        format,
        from: q.from,
        to: q.to,
        siteId: q.siteId ?? null,
        orgUnitId: q.orgUnitId ?? null,
        kind: q.kind ?? null,
        rows: entries.length,
      },
    });
    const filename = `vakhta-bonus-history-${q.from}-${q.to}.${format}`;
    if (format === 'csv') {
      const cell = (v: string | number | undefined) => {
        const text = String(v);
        return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      };
      const lines = [header.map(cell).join(';'), ...matrix.map((r) => r.map(cell).join(';'))];
      return {
        body: Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename,
      };
    }
    const sheet = XLSX.utils.aoa_to_sheet([header, ...matrix]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'history');
    return {
      body: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
    };
  }

  async period(
    siteId: string,
    month: string,
    employeeId?: string,
    now: Date = new Date(),
  ): Promise<BonusPeriodView> {
    return this.db.transaction((tx) => this.periodWithin(tx, siteId, month, employeeId, now), {
      isolationLevel: 'repeatable read',
    });
  }

  async periodWithin(
    tx: Transaction,
    siteId: string,
    month: string,
    employeeId?: string,
    now: Date = new Date(),
  ): Promise<BonusPeriodView> {
    const [period] = await tx
      .select()
      .from(bonusPeriods)
      .where(and(eq(bonusPeriods.siteId, siteId), eq(bonusPeriods.month, month)))
      .limit(1);
    const scoreRows = await tx
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
      ? await tx.select().from(bonusPeriodResults).where(eq(bonusPeriodResults.periodId, period.id))
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
    if (period?.status === 'CLOSED') {
      for (const result of results) {
        if (byEmployee.has(result.employeeId) || (employeeId && employeeId !== result.employeeId))
          continue;
        const [employee] = await tx
          .select()
          .from(employees)
          .where(eq(employees.id, result.employeeId));
        if (employee)
          byEmployee.set(employee.id, {
            name: employee.fullName,
            personnelNumber: employee.personnelNumber,
            scores: [],
          });
      }
    }
    const employeesView: EmployeeMonthView[] = [];
    for (const [id, e] of byEmployee) {
      const views = [];
      for (const s of e.scores) views.push((await this.scoreView(tx, s.id))!);
      const stored = results.find((r) => r.employeeId === id);
      if (period?.status === 'CLOSED' && !stored) continue;
      const agg =
        period?.status === 'CLOSED' && stored
          ? {
              shifts: stored.shifts,
              evaluatedShifts: stored.evaluatedShifts,
              pendingShifts: stored.pendingShifts,
              sMonth: stored.sMonth === null ? null : Number(stored.sMonth),
              weightSum: Number(stored.weightSum),
            }
          : aggregate(e.scores);
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
    const pendingRows = await tx
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
      ? await tx
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
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.closePeriodOnce(siteId, month, cmd, actor, now);
      } catch (error) {
        if (!isSerializationFailure(error) || attempt >= 3) throw error;
      }
    }
  }

  private async closePeriodOnce(
    siteId: string,
    month: string,
    cmd: ClosePeriodCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<BonusPeriodView> {
    return this.db.transaction(
      async (tx) => {
        await lockBonusMonthWithin(tx, month);
        const sessions = await this.periodSessionsWithin(tx, siteId, month);
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
              .set({ status: 'OPEN', ruleVersionId: rule.id })
              .where(eq(bonusPeriods.id, existing.id))
              .returning()
          : await tx
              .insert(bonusPeriods)
              .values({
                siteId,
                month,
                status: 'OPEN',
                ruleVersionId: rule.id,
                closedBy: actor.id,
                closedAt: now,
              })
              .returning();
        if (!period) throw new Error('bonus_periods: запис не створено');
        for (const session of sessions) await this.evaluateWithin(tx, session.id, now);
        const view = await this.periodWithin(tx, siteId, month, undefined, now);
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
          const bonus =
            base !== null && e.sMonth !== null ? Math.round(base * e.sMonth) / 100 : null;
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
        await tx
          .update(bonusPeriods)
          .set({ status: 'CLOSED', closedBy: actor.id, closedAt: now })
          .where(eq(bonusPeriods.id, period.id));
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
        return this.periodWithin(tx, siteId, month, undefined, now);
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  /**
   * Reopen a closed period: confirmed scores return to PRELIMINARY so reviews, points and
   * adjustments can change again; stored results (base amounts) are kept for the next close.
   */
  async reopenPeriod(
    periodId: string,
    cmd: ReopenPeriodCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<BonusPeriodView> {
    return this.db.transaction(async (tx) => {
      const [target] = await tx.select().from(bonusPeriods).where(eq(bonusPeriods.id, periodId));
      if (!target) throw new DomainError('PERIOD_NOT_FOUND', 404, 'Period not found');
      await lockBonusMonthWithin(tx, target.month);
      await this.periodSessionsWithin(tx, target.siteId, target.month);
      const [existing] = await tx
        .select()
        .from(bonusPeriods)
        .where(eq(bonusPeriods.id, periodId))
        .for('update');
      if (!existing) throw new DomainError('PERIOD_NOT_FOUND', 404, 'Period not found');
      if (existing.status !== 'CLOSED')
        throw new DomainError('PERIOD_NOT_CLOSED', 409, 'Only a closed period can be reopened');
      await tx
        .update(bonusPeriods)
        .set({ status: 'OPEN', closedBy: null, closedAt: null })
        .where(eq(bonusPeriods.id, existing.id));
      const view = await this.periodWithin(tx, existing.siteId, existing.month, undefined, now);
      const confirmed: string[] = [];
      for (const score of view.employees.flatMap((employee) => employee.scores)) {
        if (score.status !== 'CONFIRMED') continue;
        const [session] = await tx
          .select({ assignmentId: shiftSessions.assignmentId })
          .from(shiftSessions)
          .where(eq(shiftSessions.id, score.shiftSessionId));
        if (!session) continue;
        const place = session.assignmentId ? await this.placeOf(tx, session.assignmentId) : null;
        if (!(await this.periodClosed(tx, place?.siteId ?? null, existing.month)))
          confirmed.push(score.id);
      }
      if (confirmed.length > 0) {
        await tx
          .update(bonusShiftScores)
          .set({ status: 'PRELIMINARY', confirmedBy: null, confirmedAt: null })
          .where(inArray(bonusShiftScores.id, confirmed));
      }
      await this.events.append(tx, {
        type: 'BONUS_PERIOD_REOPENED',
        source: 'WEB',
        actor,
        occurredAt: now,
        bonusRuleVersionId: existing.ruleVersionId,
        comment: cmd.comment,
        payload: {
          periodId: existing.id,
          siteId: existing.siteId,
          month: existing.month,
          scores: confirmed.length,
        },
      });
      await this.audit.record(tx, {
        actor,
        action: 'bonus.period.reopen',
        objectType: 'bonus_period',
        objectId: existing.id,
        before: { status: 'CLOSED', closedBy: existing.closedBy, closedAt: existing.closedAt },
        after: { status: 'OPEN' },
        reason: cmd.comment,
      });
      return this.periodWithin(tx, existing.siteId, existing.month, undefined, now);
    });
  }

  /** Бонусну базу передає HR; сума рахується лише для закритих оцінок (ТЗ 7.6). */
  async setBaseAmounts(
    periodId: string,
    cmd: SetBaseAmountsCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<BonusPeriodView> {
    return this.db.transaction(async (tx) => {
      const [period] = await tx
        .select()
        .from(bonusPeriods)
        .where(eq(bonusPeriods.id, periodId))
        .limit(1);
      if (!period) throw new DomainError('PERIOD_NOT_FOUND', 404, 'Період не знайдено');
      await lockBonusMonthWithin(tx, period.month);
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
      return this.periodWithin(tx, period.siteId, period.month, undefined, now);
    });
  }

  /** Вивантаження для бухгалтерії: лише підтверджені агрегати, кожне вивантаження в аудиті (FR-WEB-04/05). */
  async exportCsv(periodId: string, actor: Actor, now: Date = new Date()): Promise<string> {
    return this.db.transaction(
      async (tx) => {
        const [period] = await tx
          .select()
          .from(bonusPeriods)
          .where(eq(bonusPeriods.id, periodId))
          .limit(1);
        if (!period) throw new DomainError('PERIOD_NOT_FOUND', 404, 'Період не знайдено');
        if (period.status !== 'CLOSED')
          throw new DomainError(
            'PERIOD_OPEN',
            409,
            'Вивантаження доступне лише для закритого періоду',
          );
        const view = await this.periodWithin(tx, period.siteId, period.month, undefined, now);
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
        await this.audit.record(tx, {
          actor,
          action: 'bonus.export',
          objectType: 'bonus_period',
          objectId: periodId,
          after: { rows: view.employees.length, generatedAt: now.toISOString() },
        });
        return lines.join('\n');
      },
      { isolationLevel: 'repeatable read' },
    );
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
      reviewDecision: row.s.reviewDecision as ShiftScoreView['reviewDecision'],
      manualScore: row.s.manualScore,
      reviewComment: row.s.reviewComment,
      reviewedAt: row.s.reviewedAt?.toISOString() ?? null,
      reviewSuggestedScore:
        row.s.status === 'MANUAL_REVIEW'
          ? reviewSuggestion(row.s.earned, row.s.applicableMax)
          : null,
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

  private periodSessionsWithin(tx: Transaction, siteId: string, month: string) {
    return tx
      .select({ id: shiftSessions.id })
      .from(shiftSessions)
      .where(
        and(
          inArray(shiftSessions.state, ['SHIFT_CLOSED', 'EMERGENCY_EXIT']),
          sql`left(${shiftSessions.businessDate}::text, 7) = ${month}`,
          sql`exists (select 1 from shift_sessions member left join shift_assignments a on a.id = member.assignment_id
        left join org_units u on u.id = a.org_unit_id where member.id = ${shiftSessions.id} and (u.site_id = ${siteId} or u.site_id is null))`,
        ),
      )
      .orderBy(asc(shiftSessions.id))
      .for('no key update');
  }

  private async periodClosed(tx: DbOrTx, siteId: string | null, month: string): Promise<boolean> {
    const [row] = await tx
      .select({ status: bonusPeriods.status })
      .from(bonusPeriods)
      .where(
        and(
          siteId === null ? undefined : eq(bonusPeriods.siteId, siteId),
          eq(bonusPeriods.month, month),
          eq(bonusPeriods.status, 'CLOSED'),
        ),
      )
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
    criterion: (a.criterion as BonusCriterion | null) ?? null,
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
