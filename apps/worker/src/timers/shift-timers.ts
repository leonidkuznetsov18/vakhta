import { timerNow } from './time.js';
import {
  activityIntervals,
  and,
  domainEvents,
  employees,
  eq,
  notificationOutbox,
  reasonCodes,
  shiftSessions,
  shiftAssignments,
  sql,
  employeeLocale,
  type Database,
  type Transaction,
} from '@vakhta/db';
import type { DowntimeEscalationJob, ReturnReminderJob } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import type { ReminderOutcome } from './reminders.js';

/**
 * Return reminder (spec 4.4, FR-BRK-01): fires only if the same interval is still open.
 * The button encodes the current session version.
 */
export async function handleReturnReminderWithin(
  db: Transaction,
  data: ReturnReminderJob,
  testTime?: Date,
  autoCloseGraceMinutes = 120,
): Promise<ReminderOutcome> {
  const row = await lockInterval(db, data, testTime, autoCloseGraceMinutes);
  if (!row || row.session.state !== data.state || row.interval.state !== data.state) return 'stale';

  const t = messages(await employeeLocale(db, row.session.employeeId));
  const text = format(t.shift.returnReminder, {
    state: t.states[data.state],
    limit: data.limitMinutes,
  });
  const inserted = await db
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: row.session.employeeId,
      template: 'RETURN_REMINDER',
      payload: {
        text,
        buttons: [[{ text: t.actions.RESUME, callbackData: `sh:RESUME:${row.session.version}` }]],
      },
      dedupeKey: `return-reminder:${data.intervalId}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length > 0 ? 'queued' : 'duplicate';
}

/**
 * Downtime escalation (spec 18 item 9, FR-DWN-04): records an event for the shift master
 * while this exact downtime interval remains open.
 * The text is in the default language: the reader is the master, not the employee.
 */
export async function handleDowntimeEscalationWithin(
  db: Transaction,
  data: DowntimeEscalationJob,
  testTime?: Date,
  autoCloseGraceMinutes = 120,
): Promise<ReminderOutcome> {
  const row = await lockInterval(db, data, testTime, autoCloseGraceMinutes);
  if (!row || row.session.state !== 'DOWNTIME' || row.interval.state !== 'DOWNTIME') return 'stale';
  const now = row.now;
  const [employee] = await db
    .select({ fullName: employees.fullName })
    .from(employees)
    .where(eq(employees.id, row.session.employeeId));
  if (!employee) return 'stale';

  const [reason] = row.interval.reasonCode
    ? await db
        .select({ label: reasonCodes.label })
        .from(reasonCodes)
        .where(and(eq(reasonCodes.kind, 'DOWNTIME'), eq(reasonCodes.code, row.interval.reasonCode)))
        .limit(1)
    : [];
  const minutes = Math.round((now.getTime() - row.interval.startedAt.getTime()) / 60_000);
  const text = format(messages().shift.downtimeEscalation, {
    name: employee.fullName,
    minutes,
    reason: reason?.label ?? row.interval.reasonCode ?? '—',
  });

  const inserted = await db
    .insert(domainEvents)
    .values({
      type: 'DOWNTIME_ESCALATED',
      occurredAt: now,
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      employeeId: row.session.employeeId,
      shiftSessionId: row.session.id,
      zoneId: row.session.zoneId,
      reasonCode: row.interval.reasonCode,
      idempotencyKey: `downtime-escalation:${data.intervalId}`,
      payload: {
        intervalId: data.intervalId,
        minutes,
        thresholdMinutes: data.thresholdMinutes,
        text,
      },
    })
    .onConflictDoNothing({
      target: domainEvents.idempotencyKey,
      where: sql`${domainEvents.idempotencyKey} IS NOT NULL`,
    })
    .returning({ id: domainEvents.id });
  return inserted.length > 0 ? 'queued' : 'duplicate';
}

export function handleReturnReminder(
  db: Database,
  data: ReturnReminderJob,
  testTime?: Date,
  autoCloseGraceMinutes = 120,
): Promise<ReminderOutcome> {
  return db.transaction((tx) =>
    handleReturnReminderWithin(tx, data, testTime, autoCloseGraceMinutes),
  );
}
export function handleDowntimeEscalation(
  db: Database,
  data: DowntimeEscalationJob,
  testTime?: Date,
  autoCloseGraceMinutes = 120,
): Promise<ReminderOutcome> {
  return db.transaction((tx) =>
    handleDowntimeEscalationWithin(tx, data, testTime, autoCloseGraceMinutes),
  );
}

/** The same lock order as a shift transition; unknown plan evidence cannot authorize a late reminder. */
async function lockInterval(
  tx: Transaction,
  data: { sessionId: string; intervalId: string; fireAt: string },
  testTime: Date | undefined,
  graceMinutes: number,
) {
  const [session] = await tx
    .select()
    .from(shiftSessions)
    .where(eq(shiftSessions.id, data.sessionId))
    .for('no key update');
  if (!session) return null;
  const [assignment] =
    !session.planEndAt && session.assignmentId
      ? await tx
          .select({ planEndAt: shiftAssignments.planEndAt })
          .from(shiftAssignments)
          .where(eq(shiftAssignments.id, session.assignmentId))
      : [];
  const planEndAt = session.planEndAt ?? assignment?.planEndAt;
  const [interval] = await tx
    .select()
    .from(activityIntervals)
    .where(
      and(
        eq(activityIntervals.id, data.intervalId),
        eq(activityIntervals.shiftSessionId, data.sessionId),
      ),
    )
    .for('no key update');
  const now = await timerNow(tx, testTime);
  if (
    new Date(data.fireAt) > now ||
    !planEndAt ||
    now.getTime() >= planEndAt.getTime() + graceMinutes * 60_000
  )
    return null;
  return interval && interval.endedAt === null ? { session, interval, now } : null;
}
