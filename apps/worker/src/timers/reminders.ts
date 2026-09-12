import { readAckReminder } from './ack-reminder-policy.js';
import { readShiftReminder } from './shift-reminder-policy.js';
import { timerNow } from './time.js';
import {
  eq,
  notificationOutbox,
  scheduleVersions,
  shiftAssignments,
  type Database,
  type Transaction,
} from '@vakhta/db';
import type { AckReminderJob, ShiftReminderJob } from '@vakhta/contracts';

export type ReminderOutcome = 'queued' | 'duplicate' | 'stale';

/**
 * "Shift soon" reminder (spec 10). The timer only reads state: if the shift was cancelled,
 * the version replaced or the time has passed, it does nothing (ADR-8).
 */
export async function handleShiftReminderWithin(
  db: Transaction,
  data: ShiftReminderJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  const [target] = await db
    .select({ versionId: shiftAssignments.scheduleVersionId })
    .from(shiftAssignments)
    .where(eq(shiftAssignments.id, data.assignmentId));
  if (!target) return 'stale';
  await db
    .select({ id: scheduleVersions.id })
    .from(scheduleVersions)
    .where(eq(scheduleVersions.id, target.versionId))
    .for('no key update');
  await db
    .select({ id: shiftAssignments.id })
    .from(shiftAssignments)
    .where(eq(shiftAssignments.id, data.assignmentId))
    .for('no key update');
  const now = await timerNow(db, testTime);
  if (new Date(data.fireAt) > now) return 'stale';

  const reminder = await readShiftReminder(db, data.assignmentId, now);
  if (!reminder) return 'stale';

  const inserted = await db
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: reminder.employeeId,
      template: 'SHIFT_REMINDER',
      payload: reminder.payload,
      nextAttemptAt: new Date(Math.max(now.getTime(), reminder.sendAt.getTime())),
      dedupeKey: `shift-reminder:${data.assignmentId}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length > 0 ? 'queued' : 'duplicate';
}

/** One acknowledgement reminder while a future shift of this version remains unconfirmed. */
export async function handleAckReminderWithin(
  db: Transaction,
  data: AckReminderJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  await db
    .select({ id: scheduleVersions.id })
    .from(scheduleVersions)
    .where(eq(scheduleVersions.id, data.versionId))
    .for('no key update');
  const now = await timerNow(db, testTime);
  if (new Date(data.fireAt) > now) return 'stale';
  const payload = await readAckReminder(db, data, now);
  if (!payload) return 'stale';

  const inserted = await db
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: data.employeeId,
      template: 'ACK_REMINDER',
      payload,
      dedupeKey: `ack-reminder:${data.versionId}:${data.employeeId}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length > 0 ? 'queued' : 'duplicate';
}

export function handleShiftReminder(
  db: Database,
  data: ShiftReminderJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  return db.transaction((tx) => handleShiftReminderWithin(tx, data, testTime));
}
export function handleAckReminder(
  db: Database,
  data: AckReminderJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  return db.transaction((tx) => handleAckReminderWithin(tx, data, testTime));
}
