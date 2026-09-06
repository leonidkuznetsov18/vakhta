import {
  activityIntervals,
  and,
  domainEvents,
  employees,
  eq,
  isNull,
  notificationOutbox,
  reasonCodes,
  shiftSessions,
  sql,
  employeeLocale,
  type Database,
} from '@vakhta/db';
import type { DowntimeEscalationJob, ReturnReminderJob } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import type { ReminderOutcome } from './reminders.js';

/**
 * Return reminder (spec 4.4, FR-BRK-01): fires only if the same interval is still open.
 * The button encodes the current session version.
 */
export async function handleReturnReminder(
  db: Database,
  data: ReturnReminderJob,
): Promise<ReminderOutcome> {
  const [row] = await db
    .select({ session: shiftSessions, interval: activityIntervals })
    .from(activityIntervals)
    .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
    .where(and(eq(activityIntervals.id, data.intervalId), isNull(activityIntervals.endedAt)))
    .limit(1);
  if (!row || row.session.state !== data.state) return 'stale';

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
 * Downtime escalation (spec 18 item 9, FR-DWN-04): an event in the log and a line for the
 * shift master; the live screen shows it over SSE. Does nothing if the downtime is already closed.
 * The text is in the default language: the reader is the master, not the employee.
 */
export async function handleDowntimeEscalation(
  db: Database,
  data: DowntimeEscalationJob,
  now: Date = new Date(),
): Promise<ReminderOutcome> {
  const [row] = await db
    .select({
      session: shiftSessions,
      interval: activityIntervals,
      fullName: employees.fullName,
    })
    .from(activityIntervals)
    .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
    .innerJoin(employees, eq(shiftSessions.employeeId, employees.id))
    .where(and(eq(activityIntervals.id, data.intervalId), isNull(activityIntervals.endedAt)))
    .limit(1);
  if (!row || row.session.state !== 'DOWNTIME') return 'stale';

  const [reason] = row.interval.reasonCode
    ? await db
        .select({ label: reasonCodes.label })
        .from(reasonCodes)
        .where(and(eq(reasonCodes.kind, 'DOWNTIME'), eq(reasonCodes.code, row.interval.reasonCode)))
        .limit(1)
    : [];
  const minutes = Math.round((now.getTime() - row.interval.startedAt.getTime()) / 60_000);
  const text = format(messages().shift.downtimeEscalation, {
    name: row.fullName,
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
