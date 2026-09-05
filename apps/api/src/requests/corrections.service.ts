import { Inject, Injectable } from '@nestjs/common';
import {
  activityIntervals,
  and,
  asc,
  domainEvents,
  eq,
  shiftSessions,
  sql,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import { applyCorrection, type CorrectionProposal } from '@vakhta/domain';
import type {
  ApplyCorrectionCommand,
  CorrectionProposalCommand,
  CorrectionResultView,
} from '@vakhta/contracts';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { ShiftService } from '../shift/shift.service.js';

/**
 * Корекції як компенсуючі події (FR-COR-03/04, T-38, T-39): вихідні події лишаються,
 * проєкція інтервалів оновлюється, підсумок перераховується, кожна корекція має причину й автора.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly shift: ShiftService,
  ) {}

  async apply(
    sessionId: string,
    cmd: ApplyCorrectionCommand,
    actor: Actor,
    now: Date = new Date(),
  ): Promise<CorrectionResultView> {
    return this.db.transaction((tx) => this.applyWithin(tx, sessionId, cmd, actor, now));
  }

  async applyWithin(
    tx: DbOrTx,
    sessionId: string,
    cmd: ApplyCorrectionCommand,
    actor: Actor,
    now: Date,
  ): Promise<CorrectionResultView> {
    if (!cmd.reasonCode)
      throw new DomainError('REASON_REQUIRED', 422, 'Корекція без причини заборонена');
    const [session] = await tx
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId))
      .for('update');
    if (!session) throw new DomainError('SHIFT_NOT_FOUND', 404, 'Зміну не знайдено');
    const rows = await tx
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId))
      .orderBy(asc(activityIntervals.startedAt));
    const intervals = rows.map((r) => ({
      id: r.id,
      state: r.state,
      startedAt: r.startedAt.getTime(),
      endedAt: r.endedAt?.getTime() ?? null,
      resumeState: r.resumeState,
    }));
    const proposal = toDomainProposal(cmd.proposal);
    const result = applyCorrection(intervals, proposal, {
      startedAt: session.startedAt?.getTime() ?? now.getTime(),
      endedAt: session.endedAt?.getTime() ?? null,
      now: now.getTime(),
    });
    if (!result.ok) {
      throw new DomainError(
        'CORRECTION_INVALID',
        422,
        `Корекція порушує інваріанти: ${result.violations.map((v) => `${v.code} (${v.detail})`).join('; ')}`,
      );
    }

    for (const change of result.changes) {
      await tx
        .update(activityIntervals)
        .set({
          state: change.after.state,
          startedAt: new Date(change.after.startedAt),
          endedAt: change.after.endedAt === null ? null : new Date(change.after.endedAt),
        })
        .where(eq(activityIntervals.id, change.intervalId));
    }
    const sessionPatch: Partial<typeof shiftSessions.$inferInsert> = {
      updatedAt: now,
      needsClarification: false,
      clarificationReason: null,
    };
    if (proposal.kind === 'CLOSE_SHIFT_AT') {
      sessionPatch.endedAt = new Date(proposal.endedAt);
      if (session.state !== 'SHIFT_CLOSED' && session.state !== 'EMERGENCY_EXIT') {
        sessionPatch.state = 'SHIFT_CLOSED';
        sessionPatch.resumeState = null;
        sessionPatch.version = session.version + 1;
      }
    }
    if (proposal.kind === 'MOVE_BOUNDARY' && result.intervals[0]?.id === proposal.intervalId) {
      sessionPatch.startedAt = new Date(proposal.newStartedAt);
    }
    await tx.update(shiftSessions).set(sessionPatch).where(eq(shiftSessions.id, sessionId));

    // Компенсуюча подія посилається на подію, що відкрила виправлений інтервал (FR-COR-03).
    const firstChanged = result.changes[0]?.intervalId ?? null;
    const [original] = firstChanged
      ? await tx
          .select({ id: domainEvents.id })
          .from(domainEvents)
          .where(
            and(
              eq(domainEvents.shiftSessionId, sessionId),
              sql`${domainEvents.payload} ->> 'intervalId' = ${firstChanged}`,
            ),
          )
          .limit(1)
      : [];
    const event = await this.events.append(tx, {
      type: 'SHIFT_CORRECTED',
      source: actor.type === 'EMPLOYEE' ? 'TELEGRAM' : 'WEB',
      actor,
      occurredAt: now,
      employeeId: session.employeeId,
      shiftSessionId: sessionId,
      reasonCode: cmd.reasonCode,
      comment: cmd.comment,
      correctsEventId: original?.id ?? null,
      payload: {
        proposal: cmd.proposal,
        requestId: cmd.requestId ?? null,
        changes: result.changes.map((c) => ({
          intervalId: c.intervalId,
          before: {
            state: c.before.state,
            startedAt: new Date(c.before.startedAt).toISOString(),
            endedAt: c.before.endedAt === null ? null : new Date(c.before.endedAt).toISOString(),
          },
          after: {
            state: c.after.state,
            startedAt: new Date(c.after.startedAt).toISOString(),
            endedAt: c.after.endedAt === null ? null : new Date(c.after.endedAt).toISOString(),
          },
        })),
      },
    });
    await this.audit.record(tx, {
      actor,
      action: 'shift.correction',
      objectType: 'shift_session',
      objectId: sessionId,
      before: { intervals: result.changes.map((c) => ({ id: c.intervalId, ...c.before })) },
      after: { intervals: result.changes.map((c) => ({ id: c.intervalId, ...c.after })) },
      reason: `${cmd.reasonCode}: ${cmd.comment}`,
    });
    const closed =
      sessionPatch.state === 'SHIFT_CLOSED' ||
      session.state === 'SHIFT_CLOSED' ||
      session.state === 'EMERGENCY_EXIT';
    if (closed) await this.shift.recomputeSummary(tx, sessionId, now);

    return {
      compensatingEventId: event.id,
      changes: result.changes.map((c) => ({
        intervalId: c.intervalId,
        before: {
          state: c.before.state,
          startedAt: new Date(c.before.startedAt).toISOString(),
          endedAt: c.before.endedAt === null ? null : new Date(c.before.endedAt).toISOString(),
        },
        after: {
          state: c.after.state,
          startedAt: new Date(c.after.startedAt).toISOString(),
          endedAt: c.after.endedAt === null ? null : new Date(c.after.endedAt).toISOString(),
        },
      })),
    };
  }
}

function toDomainProposal(p: CorrectionProposalCommand): CorrectionProposal {
  switch (p.kind) {
    case 'MOVE_BOUNDARY':
      return {
        kind: 'MOVE_BOUNDARY',
        intervalId: p.intervalId,
        newStartedAt: new Date(p.newStartedAt).getTime(),
      };
    case 'RECLASSIFY':
      return { kind: 'RECLASSIFY', intervalId: p.intervalId, newState: p.newState };
    case 'CLOSE_SHIFT_AT':
      return { kind: 'CLOSE_SHIFT_AT', endedAt: new Date(p.endedAt).getTime() };
  }
}
