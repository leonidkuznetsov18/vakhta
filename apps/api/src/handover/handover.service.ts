import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  checklistAnswers,
  checklistDefinitions,
  desc,
  employees,
  eq,
  gte,
  handoverMedia,
  handoverRecords,
  handoverResolutions,
  handoverReviews,
  idempotencyKeys,
  inArray,
  lte,
  mediaObjects,
  ne,
  orgUnits,
  reasonCodes,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  acceptDeadline,
  canReview,
  canTransitionHandover,
  handoverTimeoutJobId,
  itemKind,
  validateHandoverDraft,
  type ChecklistItemDefinition,
  type HandoverStatus,
} from '@vakhta/domain';
import type {
  AnswerChecklistCommand,
  AttachHandoverPhotoCommand,
  CannotCompleteCommand,
  ChecklistItemView,
  HandoverDetailView,
  HandoverListItemView,
  HandoverListQuery,
  HandoverPhotoView,
  HandoverResolutionView,
  HandoverReviewView,
  HandoverView,
  PendingHandoverView,
  ResolveHandoverCommand,
  ReviewHandoverCommand,
  SubmitHandoverCommand,
  TransitionResponse,
} from '@vakhta/contracts';
import { format } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore, type EventSource } from '../events/event-store.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { DATABASE } from '../infra/database.module.js';
import { TIMER_SCHEDULER, type TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShiftService, type DeferredTimer } from '../shift/shift.service.js';
import { HandoverChanges } from './handover-changes.js';
import { HandoverRepository } from './handover.repository.js';
import { MediaService } from './media.service.js';

export interface HandoverOptions {
  readonly reviewWindowMinutes: number;
}
export const HANDOVER_OPTIONS = Symbol('HANDOVER_OPTIONS');

type RecordRow = typeof handoverRecords.$inferSelect;
type AnswerRow = typeof checklistAnswers.$inferSelect;
type MediaRow = typeof mediaObjects.$inferSelect;

export type SubmitResult =
  | { readonly ok: true; readonly handover: HandoverView; readonly transition: TransitionResponse }
  | { readonly ok: false; readonly handover: HandoverView };

/**
 * Прибирання, чек-лист, фото і передача зони (ТЗ 5.6–5.9, FR-CLN/FR-PHO/FR-HND). Здавач заповнює
 * чернетку в стані HANDOVER, подає звіт і може йти (FR-HND-02); приймаюча зміна перевіряє зону до
 * основної роботи; спори й прострочення вирішує майстер формалізованим рішенням.
 */
@Injectable()
export class HandoverService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    private readonly shift: ShiftService,
    private readonly incidents: IncidentsService,
    private readonly media: MediaService,
    private readonly repository: HandoverRepository,
    private readonly changes: HandoverChanges,
    @Inject(TIMER_SCHEDULER) private readonly timers: TimerScheduler,
    @Inject(HANDOVER_OPTIONS) private readonly options: HandoverOptions,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Здавач                                                              */
  /* ------------------------------------------------------------------ */

  /** Поточний звіт здавача: чернетка створюється лише в стані HANDOVER (після CLEANING_DONE). */
  async current(employeeId: string, now: Date = new Date()): Promise<HandoverView | null> {
    const session = await this.shift.activeSession(employeeId);
    if (!session) return null;
    const record =
      session.state === 'HANDOVER'
        ? await this.db.transaction((tx) => this.repository.ensureDraft(tx, session, now))
        : await this.repository.current(this.db, session.id);
    return record ? this.view(this.db, record.id) : null;
  }

  async answer(
    employeeId: string,
    cmd: AnswerChecklistCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<HandoverView> {
    return this.db.transaction(async (tx) => {
      const draft = await this.requireDraft(tx, employeeId, now);
      const definition = await this.definition(tx, draft.checklistDefinitionId);
      const item = definition.items.find((i) => i.key === cmd.itemKey);
      if (!item) throw new DomainError('CHECKLIST_ITEM_UNKNOWN', 422, 'Невідомий пункт чек-листа');
      const isNote = item.kind === 'NOTE';
      await tx
        .insert(checklistAnswers)
        .values({
          handoverId: draft.id,
          itemKey: cmd.itemKey,
          ok: isNote ? true : cmd.ok,
          remarkCategory: cmd.ok ? null : (cmd.remarkCategory ?? null),
          remarkText: cmd.ok ? null : (cmd.remarkText ?? null),
          safeToWork: cmd.ok ? null : (cmd.safeToWork ?? null),
          needs: cmd.ok ? [] : [...(cmd.needs ?? [])],
          note: cmd.note ?? null,
          answeredAt: now,
        })
        .onConflictDoUpdate({
          target: [checklistAnswers.handoverId, checklistAnswers.itemKey],
          set: {
            ok: isNote ? true : cmd.ok,
            remarkCategory: cmd.ok ? null : (cmd.remarkCategory ?? null),
            remarkText: cmd.ok ? null : (cmd.remarkText ?? null),
            safeToWork: cmd.ok ? null : (cmd.safeToWork ?? null),
            needs: cmd.ok ? [] : [...(cmd.needs ?? [])],
            note: cmd.note ?? null,
            answeredAt: now,
          },
        });
      await this.events.append(tx, {
        type: 'CHECKLIST_ANSWERED',
        source: actor.type === 'EMPLOYEE' ? 'TELEGRAM' : 'WEB',
        actor,
        occurredAt: now,
        employeeId,
        shiftSessionId: draft.shiftSessionId,
        zoneId: draft.zoneId,
        checklistVersionId: draft.checklistDefinitionId,
        payload: { handoverId: draft.id, itemKey: cmd.itemKey, ok: isNote ? true : cmd.ok },
      });
      await this.touch(tx, draft.id, now);
      return this.view(tx, draft.id);
    });
  }

  /** A photo for one PHOTO item; a repeated photo of the same item replaces the previous (FR-PHO-05). */
  async attachPhoto(
    employeeId: string,
    cmd: AttachHandoverPhotoCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<HandoverView> {
    const { view, mediaId } = await this.db.transaction(async (tx) => {
      const draft = await this.requireDraft(tx, employeeId, now);
      const definition = await this.definition(tx, draft.checklistDefinitionId);
      const item = definition.items.find((i) => i.key === cmd.itemKey);
      if (!item || itemKind(item) !== 'PHOTO') {
        throw new DomainError('CHECKLIST_ITEM_UNKNOWN', 422, 'Unknown photo item of the checklist');
      }
      const media = await this.media.register(tx, {
        telegramFileId: cmd.telegramFileId,
        telegramFileUniqueId: cmd.telegramFileUniqueId,
        uploadedBy: employeeId,
        purpose: 'handover',
        sizeBytes: cmd.sizeBytes,
        width: cmd.width,
        height: cmd.height,
        now,
      });
      await tx
        .insert(handoverMedia)
        .values({
          handoverId: draft.id,
          itemKey: cmd.itemKey,
          mediaObjectId: media.id,
          attachedAt: now,
        })
        .onConflictDoUpdate({
          target: [handoverMedia.handoverId, handoverMedia.itemKey],
          set: { mediaObjectId: media.id, attachedAt: now },
        });
      await this.events.append(tx, {
        type: 'HANDOVER_PHOTO_ATTACHED',
        source: 'TELEGRAM',
        actor,
        occurredAt: now,
        employeeId,
        shiftSessionId: draft.shiftSessionId,
        zoneId: draft.zoneId,
        checklistVersionId: draft.checklistDefinitionId,
        payload: { handoverId: draft.id, itemKey: cmd.itemKey, mediaObjectId: media.id },
      });
      await this.touch(tx, draft.id, now);
      return { view: await this.view(tx, draft.id), mediaId: media.id };
    });
    await this.media.enqueue(mediaId);
    return view;
  }

  /** FR-CLN-05: причина, з якою прибирання не завершене; подання дозволяється з наявним. */
  async cannotComplete(
    employeeId: string,
    cmd: CannotCompleteCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<HandoverView> {
    return this.db.transaction(async (tx) => {
      const draft = await this.requireDraft(tx, employeeId, now);
      const [reason] = await tx
        .select()
        .from(reasonCodes)
        .where(
          and(
            eq(reasonCodes.kind, 'HANDOVER'),
            eq(reasonCodes.code, cmd.reasonCode),
            eq(reasonCodes.isActive, true),
          ),
        )
        .limit(1);
      if (!reason) throw new DomainError('REASON_UNKNOWN', 422, 'Невідома причина');
      if (reason.requiresComment && !cmd.comment?.trim()) {
        throw new DomainError('COMMENT_REQUIRED', 422, 'Для цієї причини потрібен коментар');
      }
      await tx
        .update(handoverRecords)
        .set({
          cannotCompleteReason: cmd.reasonCode,
          cannotCompleteComment: cmd.comment ?? null,
          updatedAt: now,
        })
        .where(eq(handoverRecords.id, draft.id));
      await this.events.append(tx, {
        type: 'CLEANING_NOT_COMPLETED',
        source: 'TELEGRAM',
        actor,
        occurredAt: now,
        employeeId,
        shiftSessionId: draft.shiftSessionId,
        zoneId: draft.zoneId,
        reasonCode: cmd.reasonCode,
        comment: cmd.comment ?? null,
        payload: { handoverId: draft.id },
      });
      return this.view(tx, draft.id);
    });
  }

  /**
   * Подання звіту (FR-HND-01/02): валідація чернетки, SUBMITTED з дедлайном приймання, перехід
   * SUBMIT_HANDOVER тією ж транзакцією. Після коміту: тайм-аут приймання і сповіщення наступній зміні.
   */
  async submit(
    employeeId: string,
    cmd: SubmitHandoverCommand,
    actor: Actor,
    source: EventSource = 'TELEGRAM',
    now: Date = new Date(),
  ): Promise<SubmitResult> {
    const deferred: DeferredTimer[] = [];
    let scheduled: { id: string; deadline: Date } | null = null;
    const result = await this.db.transaction(async (tx): Promise<SubmitResult> => {
      const draft = await this.requireDraft(tx, employeeId, now, true);
      const view = await this.view(tx, draft.id);
      if (draft.status !== 'DRAFT') {
        // Повторне натискання після подання: стан не змінюється, відповідь та сама (FR-UI-02).
        const session = await this.shift.activeSession(employeeId, tx);
        if (!session) throw new DomainError('NO_ACTIVE_SHIFT', 409, 'No active shift');
        return {
          ok: true,
          handover: view,
          transition: {
            ok: true,
            session: await this.shift.sessionView(tx, session.id),
            summary: null,
            replayed: true,
            serverTime: now.toISOString(),
          },
        };
      }
      if (view.issues.length > 0) return { ok: false, handover: view };

      const plan = await this.planEnd(tx, draft.shiftSessionId);
      const deadline = acceptDeadline(now, plan, this.options.reviewWindowMinutes);
      // Without a zone nobody accepts the report: it is the master's to review from the start.
      await tx
        .update(handoverRecords)
        .set({
          status: 'SUBMITTED',
          submittedAt: now,
          acceptDeadlineAt: deadline,
          escalatedToMasterAt: draft.zoneId ? null : now,
          version: draft.version + 1,
          updatedAt: now,
        })
        .where(eq(handoverRecords.id, draft.id));
      await this.events.append(tx, {
        type: 'HANDOVER_SUBMITTED',
        source,
        actor,
        occurredAt: now,
        employeeId,
        shiftSessionId: draft.shiftSessionId,
        zoneId: draft.zoneId,
        checklistVersionId: draft.checklistDefinitionId,
        idempotencyKey: `handover-submit:${draft.id}`,
        payload: {
          handoverId: draft.id,
          remarks: view.items.filter((i) => i.answered && i.ok === false).length,
          photos: view.photos.length,
          cannotComplete: draft.cannotCompleteReason !== null,
          acceptDeadlineAt: deadline.toISOString(),
        },
      });

      const session = await this.shift.activeSession(employeeId, tx);
      const transition = await this.shift.transitionWithin(
        tx,
        employeeId,
        {
          action: 'SUBMIT_HANDOVER',
          expectedVersion: session?.version ?? 0,
          idempotencyKey: `${cmd.idempotencyKey}:submit`,
        },
        { actor, source, now },
        deferred,
      );
      if (!transition.ok) {
        throw new DomainError(
          'HANDOVER_TRANSITION_FAILED',
          409,
          `Shift transition failed: ${transition.error}`,
        );
      }

      // The next shift in this zone is told about the handover (FR-HND-03).
      const receivers = draft.zoneId
        ? await this.nextShiftEmployees(tx, draft.zoneId, employeeId, now)
        : [];
      for (const receiver of receivers) {
        await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: receiver,
          template: 'HANDOVER_PENDING',
          payload: (t) => ({
            text: format(t.handover.pendingNotification, { zone: view.zoneName ?? '' }),
          }),
          dedupeKey: `handover-pending:${draft.id}:${receiver}`,
        });
      }
      if (draft.zoneId) scheduled = { id: draft.id, deadline };
      return { ok: true, handover: await this.view(tx, draft.id), transition };
    });
    if (result.ok) {
      await this.shift.settle(result.transition, deferred, source);
      if (scheduled) {
        const { id, deadline } = scheduled;
        await this.timers.scheduleHandoverTimeout(id, deadline);
      }
      this.changes.publish({
        handoverId: result.handover.id,
        status: result.handover.status,
        at: now.toISOString(),
      });
    }
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Приймаюча зміна                                                     */
  /* ------------------------------------------------------------------ */

  /** Передачі, що чекають приймання у зоні активної зміни працівника (FR-HND-03). */
  async pendingForReceiver(
    employeeId: string,
    tx: DbOrTx = this.db,
  ): Promise<PendingHandoverView[]> {
    const session = await this.shift.activeSession(employeeId, tx);
    if (!session?.zoneId) return [];
    const rows = await tx
      .select({
        r: handoverRecords,
        zoneName: responsibilityZones.name,
        submitterName: employees.fullName,
        remarks:
          sql<number>`(SELECT COUNT(*) FROM ${checklistAnswers} WHERE ${checklistAnswers.handoverId} = ${handoverRecords.id} AND ${checklistAnswers.ok} = false)`.mapWith(
            Number,
          ),
        photos:
          sql<number>`(SELECT COUNT(*) FROM ${handoverMedia} WHERE ${handoverMedia.handoverId} = ${handoverRecords.id})`.mapWith(
            Number,
          ),
        note: sql<
          string | null
        >`(SELECT ${checklistAnswers.note} FROM ${checklistAnswers} WHERE ${checklistAnswers.handoverId} = ${handoverRecords.id} AND ${checklistAnswers.note} IS NOT NULL LIMIT 1)`,
      })
      .from(handoverRecords)
      .innerJoin(responsibilityZones, eq(handoverRecords.zoneId, responsibilityZones.id))
      .innerJoin(employees, eq(handoverRecords.submittedBy, employees.id))
      .where(
        and(
          eq(handoverRecords.zoneId, session.zoneId),
          eq(handoverRecords.status, 'SUBMITTED'),
          ne(handoverRecords.submittedBy, employeeId),
        ),
      )
      .orderBy(asc(handoverRecords.submittedAt));
    const zoneId = session.zoneId;
    return rows.map((row) => ({
      id: row.r.id,
      zoneId,
      zoneName: row.zoneName,
      submittedBy: row.r.submittedBy,
      submittedByName: row.submitterName,
      submittedAt: (row.r.submittedAt ?? row.r.createdAt).toISOString(),
      remarks: row.remarks,
      cannotComplete: row.r.cannotCompleteReason !== null,
      notes: row.note ? [row.note] : [],
      photos: row.photos,
    }));
  }

  /**
   * Приймання (FR-HND-03/04, T-28…T-30, T-32): «Принять без замечаний» закриває передачу і
   * приймає зону; «Есть проблема» вимагає категорію, коментар і нове фото та відкриває спір.
   */
  async review(
    employeeId: string,
    handoverId: string,
    cmd: ReviewHandoverCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<HandoverView> {
    let mediaId: string | null = null;
    let incidentId: string | null = null;
    const view = await this.db.transaction(async (tx) => {
      const replay = await this.replay(tx, `handover-review:${employeeId}`, cmd.idempotencyKey);
      if (replay) return this.view(tx, replay);
      const [record] = await tx
        .select()
        .from(handoverRecords)
        .where(eq(handoverRecords.id, handoverId))
        .for('update');
      if (!record) throw new DomainError('HANDOVER_NOT_FOUND', 404, 'Звіт передачі не знайдено');
      if (!canReview(employeeId, record.submittedBy)) {
        throw new DomainError(
          'REVIEW_OWN_HANDOVER',
          409,
          'An employee cannot accept their own handover',
        );
      }
      if (record.status !== 'SUBMITTED') {
        throw new DomainError(
          'HANDOVER_NOT_PENDING',
          409,
          'The report is already accepted or resolved',
        );
      }
      const reportZoneId = record.zoneId;
      if (!reportZoneId) {
        throw new DomainError(
          'HANDOVER_NOT_REVIEWABLE',
          409,
          'A report without a zone is reviewed by the master',
        );
      }
      const session = await this.shift.activeSession(employeeId, tx);
      if (!session) throw new DomainError('NO_ACTIVE_SHIFT', 409, 'No active shift');

      if (cmd.decision === 'ISSUE') {
        if (
          !cmd.category ||
          !cmd.comment?.trim() ||
          !cmd.telegramFileId ||
          !cmd.telegramFileUniqueId
        ) {
          throw new DomainError(
            'REVIEW_INCOMPLETE',
            422,
            'Для зауваження потрібні категорія, коментар і нове фото',
          );
        }
        const [reason] = await tx
          .select()
          .from(reasonCodes)
          .where(
            and(
              eq(reasonCodes.kind, 'HANDOVER'),
              eq(reasonCodes.code, cmd.category),
              eq(reasonCodes.isActive, true),
            ),
          )
          .limit(1);
        if (!reason) throw new DomainError('REASON_UNKNOWN', 422, 'Невідома категорія зауваження');
        const media = await this.media.register(tx, {
          telegramFileId: cmd.telegramFileId,
          telegramFileUniqueId: cmd.telegramFileUniqueId,
          uploadedBy: employeeId,
          purpose: 'handover-review',
          now,
        });
        mediaId = media.id;
        if (reason.severity !== 'NORMAL') {
          const place = await this.placeOf(tx, session.assignmentId);
          incidentId = await this.incidents.openFromReview(tx, {
            employeeId,
            shiftSessionId: session.id,
            zoneId: reportZoneId,
            reasonCode: reason.code,
            severity: reason.severity,
            comment: cmd.comment,
            siteId: place?.siteId ?? null,
            orgUnitId: place?.orgUnitId ?? null,
            actor,
            now,
          });
        }
        await tx.insert(handoverReviews).values({
          handoverId,
          reviewerEmployeeId: employeeId,
          reviewerShiftSessionId: session.id,
          decision: 'ISSUE',
          category: cmd.category,
          comment: cmd.comment,
          mediaObjectId: media.id,
          incidentId,
          reviewedAt: now,
        });
        await tx
          .update(handoverRecords)
          .set({ status: 'DISPUTED', version: record.version + 1, updatedAt: now })
          .where(eq(handoverRecords.id, handoverId));
        await this.events.append(tx, {
          type: 'HANDOVER_DISPUTED',
          source: 'TELEGRAM',
          actor,
          occurredAt: now,
          employeeId,
          shiftSessionId: session.id,
          zoneId: record.zoneId,
          incidentId,
          reasonCode: cmd.category,
          comment: cmd.comment,
          payload: { handoverId, submittedBy: record.submittedBy, mediaObjectId: media.id },
        });
        const zoneName = await this.zoneName(tx, record.zoneId);
        await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: record.submittedBy,
          template: 'HANDOVER_REVIEWED',
          payload: (t) => ({
            text: format(t.handover.reviewedNotification, { zone: zoneName ?? '' }),
          }),
          dedupeKey: `handover-reviewed:${handoverId}`,
        });
      } else {
        await tx.insert(handoverReviews).values({
          handoverId,
          reviewerEmployeeId: employeeId,
          reviewerShiftSessionId: session.id,
          decision: 'ACCEPTED',
          comment: cmd.comment ?? null,
          reviewedAt: now,
        });
        await tx
          .update(handoverRecords)
          .set({ status: 'ACCEPTED', version: record.version + 1, updatedAt: now })
          .where(eq(handoverRecords.id, handoverId));
        await this.events.append(tx, {
          type: 'HANDOVER_ACCEPTED',
          source: 'TELEGRAM',
          actor,
          occurredAt: now,
          employeeId,
          shiftSessionId: session.id,
          zoneId: record.zoneId,
          payload: { handoverId, submittedBy: record.submittedBy },
        });
        // Перевірка зони і є її прийманням для нової зміни (ТЗ 4.4).
        if (session.zoneId === record.zoneId && !session.zoneAcceptedAt) {
          await tx
            .update(shiftSessions)
            .set({ zoneAcceptedAt: now, updatedAt: now })
            .where(eq(shiftSessions.id, session.id));
          await this.events.append(tx, {
            type: 'ZONE_ACCEPTED',
            source: 'TELEGRAM',
            actor,
            occurredAt: now,
            employeeId,
            shiftSessionId: session.id,
            zoneId: record.zoneId,
            payload: { viaHandover: handoverId },
          });
        }
      }
      await tx.insert(idempotencyKeys).values({
        scope: `handover-review:${employeeId}`,
        key: cmd.idempotencyKey,
        requestHash: cmd.decision,
        response: { handoverId },
      });
      return this.view(tx, handoverId);
    });
    if (mediaId) await this.media.enqueue(mediaId);
    await this.timers.cancel(handoverTimeoutJobId(handoverId));
    this.changes.publish({ handoverId, status: view.status, at: now.toISOString() });
    return view;
  }

  /* ------------------------------------------------------------------ */
  /* Майстер                                                             */
  /* ------------------------------------------------------------------ */

  /** Формалізоване рішення (FR-HND-05/06): спір або прострочена приймання. */
  async resolve(
    handoverId: string,
    cmd: ResolveHandoverCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<HandoverView> {
    if (cmd.comment.trim().length < 3) {
      throw new DomainError('COMMENT_REQUIRED', 422, 'Рішення потребує коментаря');
    }
    const view = await this.db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(handoverRecords)
        .where(eq(handoverRecords.id, handoverId))
        .for('update');
      if (!record) throw new DomainError('HANDOVER_NOT_FOUND', 404, 'Звіт передачі не знайдено');
      if (!canTransitionHandover(record.status, cmd.decision)) {
        throw new DomainError(
          'HANDOVER_TRANSITION_NOT_ALLOWED',
          409,
          `Перехід ${record.status} → ${cmd.decision} не дозволений`,
        );
      }
      await tx.insert(handoverResolutions).values({
        handoverId,
        resolvedBy: actor.id,
        decision: cmd.decision,
        reasonCode: cmd.reasonCode ?? null,
        comment: cmd.comment,
        at: now,
      });
      await tx
        .update(handoverRecords)
        .set({ status: cmd.decision, version: record.version + 1, updatedAt: now })
        .where(eq(handoverRecords.id, handoverId));
      await this.events.append(tx, {
        type: 'HANDOVER_RESOLVED',
        source: 'WEB',
        actor,
        occurredAt: now,
        employeeId: record.submittedBy,
        shiftSessionId: record.shiftSessionId,
        zoneId: record.zoneId,
        reasonCode: cmd.reasonCode ?? null,
        comment: cmd.comment,
        payload: { handoverId, from: record.status, decision: cmd.decision },
      });
      await this.audit.record(tx, {
        actor,
        action: `handover.${cmd.decision.toLowerCase()}`,
        objectType: 'handover_record',
        objectId: handoverId,
        before: { status: record.status },
        after: { status: cmd.decision },
        reason: cmd.comment,
      });
      const zoneName = await this.zoneName(tx, record.zoneId);
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: record.submittedBy,
        template: 'HANDOVER_RESOLVED',
        payload: (t) => ({
          text: zoneName
            ? format(t.handover.resolvedNotification, {
                zone: zoneName,
                decision: t.handover.resolutions[cmd.decision],
              })
            : format(t.handover.resolvedNotificationNoZone, {
                decision: t.handover.resolutions[cmd.decision],
              }),
        }),
        dedupeKey: `handover-resolved:${handoverId}:${cmd.decision}`,
      });
      return this.view(tx, handoverId);
    });
    await this.timers.cancel(handoverTimeoutJobId(handoverId));
    this.changes.publish({ handoverId, status: view.status, at: now.toISOString() });
    return view;
  }

  async list(q: HandoverListQuery, now: Date = new Date()): Promise<HandoverListItemView[]> {
    const scope = q.scope ?? 'pending';
    const conditions = [];
    if (scope === 'pending')
      conditions.push(inArray(handoverRecords.status, ['SUBMITTED', 'DISPUTED']));
    if (scope === 'overdue')
      conditions.push(
        eq(handoverRecords.status, 'SUBMITTED'),
        lte(handoverRecords.acceptDeadlineAt, now),
      );
    if (scope === 'all') conditions.push(ne(handoverRecords.status, 'DRAFT'));
    if (q.zoneId) conditions.push(eq(handoverRecords.zoneId, q.zoneId));
    if (q.siteId) conditions.push(eq(responsibilityZones.siteId, q.siteId));
    const rows = await tx_list(this.db, conditions);
    const out: HandoverListItemView[] = [];
    for (const row of rows) {
      const base = await this.view(this.db, row.id);
      const { items, issues, ...rest } = base;
      const review = await this.db
        .select({ decision: handoverReviews.decision })
        .from(handoverReviews)
        .where(eq(handoverReviews.handoverId, row.id))
        .orderBy(desc(handoverReviews.reviewedAt))
        .limit(1);
      out.push({
        ...rest,
        remarks: items.filter((i) => i.answered && i.ok === false).length,
        overdue:
          base.status === 'SUBMITTED' &&
          base.acceptDeadlineAt !== null &&
          new Date(base.acceptDeadlineAt).getTime() <= now.getTime(),
        reviewDecision: review[0]?.decision ?? null,
      });
      void issues;
    }
    return out;
  }

  async detail(handoverId: string, now: Date = new Date()): Promise<HandoverDetailView> {
    const handover = await this.view(this.db, handoverId);
    const [reviews, resolutions] = await Promise.all([
      this.db
        .select({ r: handoverReviews, name: employees.fullName, media: mediaObjects })
        .from(handoverReviews)
        .innerJoin(employees, eq(handoverReviews.reviewerEmployeeId, employees.id))
        .leftJoin(mediaObjects, eq(handoverReviews.mediaObjectId, mediaObjects.id))
        .where(eq(handoverReviews.handoverId, handoverId))
        .orderBy(asc(handoverReviews.reviewedAt)),
      this.db
        .select()
        .from(handoverResolutions)
        .where(eq(handoverResolutions.handoverId, handoverId))
        .orderBy(asc(handoverResolutions.at)),
    ]);
    return {
      handover,
      reviews: reviews.map(({ r, name, media }): HandoverReviewView => ({
        id: r.id,
        reviewerEmployeeId: r.reviewerEmployeeId,
        reviewerName: name,
        decision: r.decision,
        category: r.category,
        comment: r.comment,
        media: media ? this.media.toView(media) : null,
        reviewedAt: r.reviewedAt.toISOString(),
        incidentId: r.incidentId,
      })),
      resolutions: resolutions.map((r): HandoverResolutionView => ({
        id: r.id,
        resolvedBy: r.resolvedBy,
        decision: r.decision,
        reasonCode: r.reasonCode,
        comment: r.comment,
        at: r.at.toISOString(),
      })),
      serverTime: now.toISOString(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Допоміжне                                                           */
  /* ------------------------------------------------------------------ */

  async view(tx: DbOrTx, handoverId: string): Promise<HandoverView> {
    const [row] = await tx
      .select({
        r: handoverRecords,
        zoneName: responsibilityZones.name,
        submitterName: employees.fullName,
        definition: checklistDefinitions,
      })
      .from(handoverRecords)
      .leftJoin(responsibilityZones, eq(handoverRecords.zoneId, responsibilityZones.id))
      .innerJoin(employees, eq(handoverRecords.submittedBy, employees.id))
      .innerJoin(
        checklistDefinitions,
        eq(handoverRecords.checklistDefinitionId, checklistDefinitions.id),
      )
      .where(eq(handoverRecords.id, handoverId))
      .limit(1);
    if (!row) throw new DomainError('HANDOVER_NOT_FOUND', 404, 'Handover report not found');
    const [answers, photos] = await Promise.all([
      tx.select().from(checklistAnswers).where(eq(checklistAnswers.handoverId, handoverId)),
      tx
        .select({ itemKey: handoverMedia.itemKey, media: mediaObjects })
        .from(handoverMedia)
        .innerJoin(mediaObjects, eq(handoverMedia.mediaObjectId, mediaObjects.id))
        .where(eq(handoverMedia.handoverId, handoverId)),
    ]);
    const byKey = new Map(answers.map((a) => [a.itemKey, a]));
    const items: ChecklistItemView[] = row.definition.items.map((item) =>
      toItemView(item, byKey.get(item.key)),
    );
    const issues = validateHandoverDraft(
      row.definition.items,
      answers.map((a) => ({
        itemKey: a.itemKey,
        ok: a.ok,
        remarkCategory: a.remarkCategory,
        remarkText: a.remarkText,
        safeToWork: a.safeToWork,
        needs: a.needs,
      })),
      photos.map((p) => ({ itemKey: p.itemKey, mediaObjectId: p.media.id })),
      { cannotComplete: row.r.cannotCompleteReason !== null },
    );
    const r = row.r;
    return {
      id: r.id,
      shiftSessionId: r.shiftSessionId,
      zoneId: r.zoneId,
      zoneName: row.zoneName ?? null,
      submittedBy: r.submittedBy,
      submittedByName: row.submitterName,
      checklistDefinitionId: r.checklistDefinitionId,
      checklistVersion: row.definition.version,
      status: r.status,
      version: r.version,
      items,
      photos: photos.map((p): HandoverPhotoView => ({
        itemKey: p.itemKey,
        label: row.definition.items.find((i) => i.key === p.itemKey)?.label ?? p.itemKey,
        media: this.media.toView(p.media),
      })),
      issues: issues.map((i) => ({
        code: i.code,
        ...(i.itemKey ? { itemKey: i.itemKey } : {}),
      })),
      cannotCompleteReason: r.cannotCompleteReason,
      cannotCompleteComment: r.cannotCompleteComment,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      acceptDeadlineAt: r.acceptDeadlineAt?.toISOString() ?? null,
      escalatedToMasterAt: r.escalatedToMasterAt?.toISOString() ?? null,
      supersededById: r.supersededById,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async requireDraft(
    tx: DbOrTx,
    employeeId: string,
    now: Date,
    allowSubmitted = false,
  ): Promise<RecordRow> {
    const session = await this.shift.activeSession(employeeId, tx);
    if (!session) throw new DomainError('NO_ACTIVE_SHIFT', 409, 'No active shift');
    if (session.state !== 'HANDOVER' && !(allowSubmitted && session.state === 'READY_TO_CLOSE')) {
      throw new DomainError('HANDOVER_NOT_OPEN', 409, 'The shift is not in the handover state');
    }
    const record = await this.repository.ensureDraft(tx, session, now);
    if (!record) throw new DomainError('HANDOVER_NOT_OPEN', 409, 'The handover draft is not open');
    if (record.status !== 'DRAFT' && !allowSubmitted) {
      throw new DomainError(
        'HANDOVER_ALREADY_SUBMITTED',
        409,
        'The handover report is already submitted',
      );
    }
    return record;
  }

  private async definition(tx: DbOrTx, id: string) {
    const [row] = await tx
      .select()
      .from(checklistDefinitions)
      .where(eq(checklistDefinitions.id, id))
      .limit(1);
    if (!row) throw new DomainError('CHECKLIST_NOT_FOUND', 404, 'Шаблон чек-листа не знайдено');
    return row;
  }

  private async touch(tx: DbOrTx, id: string, now: Date): Promise<void> {
    await tx.update(handoverRecords).set({ updatedAt: now }).where(eq(handoverRecords.id, id));
  }

  private async planEnd(tx: DbOrTx, sessionId: string): Promise<Date | null> {
    const [row] = await tx
      .select({ planEndAt: shiftAssignments.planEndAt })
      .from(shiftSessions)
      .innerJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
      .where(eq(shiftSessions.id, sessionId))
      .limit(1);
    return row?.planEndAt ?? null;
  }

  private async zoneName(tx: DbOrTx, zoneId: string | null): Promise<string | null> {
    if (!zoneId) return null;
    const [row] = await tx
      .select({ name: responsibilityZones.name })
      .from(responsibilityZones)
      .where(eq(responsibilityZones.id, zoneId))
      .limit(1);
    return row?.name ?? null;
  }

  private async placeOf(
    tx: DbOrTx,
    assignmentId: string | null,
  ): Promise<{ siteId: string; orgUnitId: string } | null> {
    if (!assignmentId) return null;
    const [row] = await tx
      .select({ orgUnitId: shiftAssignments.orgUnitId, siteId: orgUnits.siteId })
      .from(shiftAssignments)
      .innerJoin(orgUnits, eq(shiftAssignments.orgUnitId, orgUnits.id))
      .where(eq(shiftAssignments.id, assignmentId))
      .limit(1);
    return row ?? null;
  }

  /** Працівники з опублікованою зміною в цій зоні, що починається в найближчі 14 годин. */
  private async nextShiftEmployees(
    tx: DbOrTx,
    zoneId: string,
    exclude: string,
    now: Date,
  ): Promise<string[]> {
    const rows = await tx
      .selectDistinct({ employeeId: shiftAssignments.employeeId })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .where(
        and(
          eq(shiftAssignments.zoneId, zoneId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          ne(shiftAssignments.employeeId, exclude),
          gte(shiftAssignments.planStartAt, new Date(now.getTime() - 2 * 3_600_000)),
          lte(shiftAssignments.planStartAt, new Date(now.getTime() + 14 * 3_600_000)),
        ),
      );
    return rows.map((r) => r.employeeId);
  }

  private async replay(tx: DbOrTx, scope: string, key: string): Promise<string | null> {
    const [row] = await tx
      .select({ response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
      .limit(1);
    return row ? String((row.response as { handoverId: string }).handoverId) : null;
  }
}

function tx_list(db: Database, conditions: ReturnType<typeof eq>[]) {
  return db
    .select({ id: handoverRecords.id })
    .from(handoverRecords)
    .leftJoin(responsibilityZones, eq(handoverRecords.zoneId, responsibilityZones.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(handoverRecords.submittedAt), desc(handoverRecords.createdAt));
}

function toItemView(
  item: ChecklistItemDefinition,
  answer: AnswerRow | undefined,
): ChecklistItemView {
  return {
    key: item.key,
    label: item.label,
    kind: itemKind(item),
    answered: answer !== undefined,
    ok: answer ? answer.ok : null,
    remarkCategory: answer?.remarkCategory ?? null,
    remarkText: answer?.remarkText ?? null,
    safeToWork: answer?.safeToWork ?? null,
    needs: answer?.needs ?? [],
  };
}

export type { HandoverStatus, MediaRow };
