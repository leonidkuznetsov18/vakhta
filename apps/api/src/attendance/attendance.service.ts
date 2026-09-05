import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  employees,
  eq,
  gte,
  lte,
  presenceSessions,
  qrChallengeUses,
  qrChallenges,
  qrTerminals,
  scheduleVersions,
  shiftAssignments,
  type Database,
  type DbOrTx,
} from '@vakhta/db';
import {
  isChallengeExpired,
  pickArrivalAssignment,
  type AttendanceWindow,
  type CheckAction,
  type CheckInFailure,
} from '@vakhta/domain';
import { hashChallengeToken } from '@vakhta/domain/node';
import type {
  CheckInResult,
  OpenPresenceView,
  PresenceView,
  ReserveCheckInCommand,
} from '@vakhta/contracts';
import { employeeActor, type Actor } from '../common/actor.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';

export interface AttendanceOptions {
  readonly window: AttendanceWindow;
}

export const ATTENDANCE_OPTIONS = Symbol('ATTENDANCE_OPTIONS');

type PresenceRow = typeof presenceSessions.$inferSelect;
type ChallengeRow = typeof qrChallenges.$inferSelect;
type TerminalRow = typeof qrTerminals.$inferSelect;

export type ChallengePreview =
  | { readonly ok: true; readonly terminal: TerminalRow; readonly challenge: ChallengeRow }
  | {
      readonly ok: false;
      readonly reason: Extract<
        CheckInFailure,
        'CHALLENGE_INVALID' | 'CHALLENGE_EXPIRED' | 'TERMINAL_DISABLED'
      >;
    };

interface MarkInput {
  readonly employeeId: string;
  readonly now: Date;
  readonly method: 'QR' | 'TERMINAL' | 'MASTER' | 'WEB';
  readonly actor: Actor;
  readonly challenge?: ChallengeRow;
  readonly terminal?: TerminalRow;
  /** Резервна відмітка майстром може відкрити присутність без призначення (FR-QR-05, FR-QR-06). */
  readonly requireAssignment: boolean;
  readonly confirmedBy?: string | null;
  readonly reasonCode?: string;
  readonly comment?: string;
}

/**
 * Присутність (ТЗ 4.1): «Я на роботі» відкриває presence_session, «Я пішов» закриває.
 * Робочий час не відкривається (FR-TIME-01); це робить «Почати зміну» у фазі 2.
 */
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    @Inject(ATTENDANCE_OPTIONS) private readonly options: AttendanceOptions,
  ) {}

  async openPresence(employeeId: string, tx: DbOrTx = this.db): Promise<PresenceRow | null> {
    const [row] = await tx
      .select()
      .from(presenceSessions)
      .where(and(eq(presenceSessions.employeeId, employeeId), eq(presenceSessions.status, 'OPEN')))
      .limit(1);
    return row ?? null;
  }

  /** Що запропонувати після сканування: відкрита присутність означає відхід. */
  async intent(employeeId: string): Promise<CheckAction> {
    return (await this.openPresence(employeeId)) ? 'DEPART' : 'ARRIVE';
  }

  /** Перевірка QR без побічних ефектів, щоб показати назву терміналу перед підтвердженням. */
  async previewChallenge(token: string, now: Date = new Date()): Promise<ChallengePreview> {
    const [row] = await this.db
      .select({ challenge: qrChallenges, terminal: qrTerminals })
      .from(qrChallenges)
      .innerJoin(qrTerminals, eq(qrChallenges.terminalId, qrTerminals.id))
      .where(eq(qrChallenges.tokenHash, hashChallengeToken(token)))
      .limit(1);
    if (!row) return { ok: false, reason: 'CHALLENGE_INVALID' };
    if (isChallengeExpired(row.challenge.expiresAt, now))
      return { ok: false, reason: 'CHALLENGE_EXPIRED' };
    if (row.terminal.status !== 'ACTIVE') return { ok: false, reason: 'TERMINAL_DISABLED' };
    return { ok: true, terminal: row.terminal, challenge: row.challenge };
  }

  /** Відмітка за динамічним QR (FR-QR-03, T-02…T-05). */
  async checkInByQr(
    employeeId: string,
    token: string,
    action: CheckAction,
    now: Date = new Date(),
  ): Promise<CheckInResult> {
    const actor = employeeActor(employeeId);
    const preview = await this.previewChallenge(token, now);
    if (!preview.ok) {
      if (preview.reason === 'CHALLENGE_INVALID') {
        // T-05: підмінений токен є подією безпеки, не просто відмовою.
        await this.events.append(this.db, {
          type: 'QR_CHALLENGE_REJECTED',
          source: 'TELEGRAM',
          actor,
          employeeId,
          payload: { reason: 'INVALID', action },
        });
      }
      return { ok: false, action, reason: preview.reason, serverTime: now.toISOString() };
    }
    const input: MarkInput = {
      employeeId,
      now,
      method: 'QR',
      actor,
      challenge: preview.challenge,
      terminal: preview.terminal,
      requireAssignment: true,
    };
    return this.db.transaction((tx) =>
      action === 'ARRIVE' ? this.arrive(tx, input) : this.depart(tx, input),
    );
  }

  /** Резервна відмітка (FR-QR-06): спосіб, підстава і підтверджувач зберігаються. */
  async reserveCheckIn(cmd: ReserveCheckInCommand, actor: Actor): Promise<CheckInResult> {
    const now = cmd.at ? new Date(cmd.at) : new Date();
    const input: MarkInput = {
      employeeId: cmd.employeeId,
      now,
      method: 'MASTER',
      actor,
      requireAssignment: false,
      confirmedBy: actor.id,
      reasonCode: cmd.reasonCode,
      ...(cmd.comment !== undefined ? { comment: cmd.comment } : {}),
    };
    const result = await this.db.transaction((tx) =>
      cmd.action === 'ARRIVE' ? this.arrive(tx, input) : this.depart(tx, input),
    );
    if (result.ok) {
      await this.audit.record(this.db, {
        actor,
        action: `presence.reserve.${cmd.action.toLowerCase()}`,
        objectType: 'employee',
        objectId: cmd.employeeId,
        after: {
          presenceId: result.presence.id,
          at: now.toISOString(),
          reasonCode: cmd.reasonCode,
        },
        reason: cmd.comment ?? cmd.reasonCode,
      });
    }
    return result;
  }

  async listOpen(): Promise<OpenPresenceView[]> {
    const rows = await this.db
      .select({
        p: presenceSessions,
        fullName: employees.fullName,
        personnelNumber: employees.personnelNumber,
      })
      .from(presenceSessions)
      .innerJoin(employees, eq(presenceSessions.employeeId, employees.id))
      .where(eq(presenceSessions.status, 'OPEN'))
      .orderBy(asc(presenceSessions.arrivedAt));
    return rows.map((r) => ({
      ...this.toView(r.p),
      fullName: r.fullName,
      personnelNumber: r.personnelNumber,
    }));
  }

  private async arrive(tx: DbOrTx, input: MarkInput): Promise<CheckInResult> {
    const serverTime = input.now.toISOString();
    const fail = (reason: CheckInFailure): CheckInResult => ({
      ok: false,
      action: 'ARRIVE',
      reason,
      serverTime,
    });

    if (await this.openPresence(input.employeeId, tx)) return fail('ALREADY_ARRIVED');

    const assignment = await this.findArrivalAssignment(tx, input.employeeId, input.now);
    if (!assignment && input.requireAssignment) {
      await this.events.append(tx, {
        type: 'PRESENCE_ARRIVAL_NO_ASSIGNMENT',
        source: input.method === 'QR' ? 'TELEGRAM' : 'WEB',
        actor: input.actor,
        employeeId: input.employeeId,
        payload: { terminalId: input.terminal?.id ?? null },
      });
      return fail('NO_ASSIGNMENT');
    }

    // FR-QR-03: пара працівник + зміна застосовується один раз; повтор повертає перший результат.
    if (input.challenge && assignment) {
      const claimed = await this.claimUse(
        tx,
        input.challenge.id,
        input.employeeId,
        assignment.id,
        'ARRIVE',
      );
      if (!claimed) {
        const previous = await this.latestPresence(tx, input.employeeId, assignment.id);
        if (previous) {
          return {
            ok: true,
            action: 'ARRIVE',
            presence: this.toView(previous),
            alreadyRecorded: true,
            serverTime,
            terminalName: input.terminal?.name ?? null,
          };
        }
      }
    }

    try {
      const [row] = await tx
        .insert(presenceSessions)
        .values({
          employeeId: input.employeeId,
          assignmentId: assignment?.id ?? null,
          arrivedAt: input.now,
          arrivalMethod: input.method,
          arrivalTerminalId: input.terminal?.id ?? null,
          confirmedBy: input.confirmedBy ?? null,
          reasonCode: input.reasonCode ?? null,
        })
        .returning();
      if (!row) throw new Error('presence_sessions: insert не повернув рядок');
      await this.events.append(tx, {
        type: 'PRESENCE_ARRIVED',
        source: input.method === 'QR' ? 'TELEGRAM' : 'WEB',
        actor: input.actor,
        employeeId: input.employeeId,
        occurredAt: input.now,
        reasonCode: input.reasonCode ?? null,
        comment: input.comment ?? null,
        payload: {
          presenceId: row.id,
          assignmentId: assignment?.id ?? null,
          method: input.method,
          terminalId: input.terminal?.id ?? null,
        },
      });
      return {
        ok: true,
        action: 'ARRIVE',
        presence: this.toView(row),
        alreadyRecorded: false,
        serverTime,
        terminalName: input.terminal?.name ?? null,
      };
    } catch (error) {
      // Гонка двох натискань: частковий унікальний індекс на OPEN пропускає лише перше (AC-05).
      if (isUniqueViolation(error)) return fail('ALREADY_ARRIVED');
      throw error;
    }
  }

  private async depart(tx: DbOrTx, input: MarkInput): Promise<CheckInResult> {
    const serverTime = input.now.toISOString();
    const fail = (reason: CheckInFailure): CheckInResult => ({
      ok: false,
      action: 'DEPART',
      reason,
      serverTime,
    });

    const [open] = await tx
      .select()
      .from(presenceSessions)
      .where(
        and(eq(presenceSessions.employeeId, input.employeeId), eq(presenceSessions.status, 'OPEN')),
      )
      .for('update');
    if (!open) return fail('NOT_ARRIVED');

    if (input.challenge && open.assignmentId) {
      await this.claimUse(tx, input.challenge.id, input.employeeId, open.assignmentId, 'DEPART');
    }

    const [row] = await tx
      .update(presenceSessions)
      .set({
        departedAt: input.now,
        departureMethod: input.method,
        departureTerminalId: input.terminal?.id ?? null,
        status: 'CLOSED',
        ...(input.confirmedBy ? { confirmedBy: input.confirmedBy } : {}),
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      })
      .where(eq(presenceSessions.id, open.id))
      .returning();
    if (!row) throw new Error('presence_sessions: update не повернув рядок');
    await this.events.append(tx, {
      type: 'PRESENCE_DEPARTED',
      source: input.method === 'QR' ? 'TELEGRAM' : 'WEB',
      actor: input.actor,
      employeeId: input.employeeId,
      occurredAt: input.now,
      reasonCode: input.reasonCode ?? null,
      comment: input.comment ?? null,
      payload: {
        presenceId: row.id,
        assignmentId: row.assignmentId,
        method: input.method,
        terminalId: input.terminal?.id ?? null,
        presenceMinutes: Math.round((input.now.getTime() - row.arrivedAt.getTime()) / 60_000),
      },
    });
    return {
      ok: true,
      action: 'DEPART',
      presence: this.toView(row),
      alreadyRecorded: false,
      serverTime,
      terminalName: input.terminal?.name ?? null,
    };
  }

  /** Заплановані зміни працівника довкола моменту; вибір робить домен (FR-QR-04). */
  private async findArrivalAssignment(tx: DbOrTx, employeeId: string, now: Date) {
    const from = new Date(now.getTime() - 36 * 3_600_000);
    const to = new Date(now.getTime() + this.options.window.arriveBeforeMinutes * 60_000);
    const rows = await tx
      .select({
        id: shiftAssignments.id,
        planStartAt: shiftAssignments.planStartAt,
        planEndAt: shiftAssignments.planEndAt,
      })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
      .where(
        and(
          eq(shiftAssignments.employeeId, employeeId),
          eq(shiftAssignments.status, 'PLANNED'),
          eq(scheduleVersions.status, 'PUBLISHED'),
          gte(shiftAssignments.planStartAt, from),
          lte(shiftAssignments.planStartAt, to),
        ),
      );
    return pickArrivalAssignment(rows, now, this.options.window);
  }

  /** true, якщо це перше використання пари працівник + зміна для дії. */
  private async claimUse(
    tx: DbOrTx,
    challengeId: string,
    employeeId: string,
    assignmentId: string,
    action: CheckAction,
  ): Promise<boolean> {
    const rows = await tx
      .insert(qrChallengeUses)
      .values({ challengeId, employeeId, assignmentId, action })
      .onConflictDoNothing()
      .returning({ id: qrChallengeUses.id });
    return rows.length > 0;
  }

  private async latestPresence(
    tx: DbOrTx,
    employeeId: string,
    assignmentId: string,
  ): Promise<PresenceRow | null> {
    const [row] = await tx
      .select()
      .from(presenceSessions)
      .where(
        and(
          eq(presenceSessions.employeeId, employeeId),
          eq(presenceSessions.assignmentId, assignmentId),
        ),
      )
      .orderBy(desc(presenceSessions.arrivedAt))
      .limit(1);
    return row ?? null;
  }

  toView(row: PresenceRow): PresenceView {
    return {
      id: row.id,
      employeeId: row.employeeId,
      assignmentId: row.assignmentId,
      arrivedAt: row.arrivedAt.toISOString(),
      departedAt: row.departedAt?.toISOString() ?? null,
      arrivalMethod: row.arrivalMethod,
      departureMethod: row.departureMethod,
      status: row.status,
    };
  }
}
