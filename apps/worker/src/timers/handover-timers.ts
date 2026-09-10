import { timerNow } from './time.js';
import {
  domainEvents,
  eq,
  handoverRecords,
  notificationOutbox,
  responsibilityZones,
  shiftAssignments,
  shiftSessions,
  sql,
  employeeLocale,
  type Database,
  type Transaction,
} from '@vakhta/db';
import type { CleaningReminderJob, HandoverTimeoutJob } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import type { ReminderOutcome } from './reminders.js';

export function handleHandoverTimeout(
  db: Database,
  data: HandoverTimeoutJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  return db.transaction((tx) => handleHandoverTimeoutWithin(tx, data, testTime));
}

/** Legacy acceptance only. Modern reports already escalate in their submit transaction. */
export async function handleHandoverTimeoutWithin(
  tx: Transaction,
  data: HandoverTimeoutJob,
  testTime: Date | undefined,
): Promise<ReminderOutcome> {
  const [row] = await tx
    .select()
    .from(handoverRecords)
    .where(eq(handoverRecords.id, data.handoverId))
    .for('no key update');
  if (!row) return 'stale';
  const now = await timerNow(tx, testTime);
  const [previous] = await tx
    .select({ occurredAt: domainEvents.occurredAt, type: domainEvents.type })
    .from(domainEvents)
    .where(eq(domainEvents.idempotencyKey, `handover-timeout:${row.id}`));
  if (previous && previous.type !== 'HANDOVER_TIMEOUT')
    throw new Error('Timer event identity mismatch');
  if (previous && !row.escalatedToMasterAt)
    await tx
      .update(handoverRecords)
      .set({ escalatedToMasterAt: previous.occurredAt })
      .where(eq(handoverRecords.id, row.id));
  if (row.status !== 'SUBMITTED') return 'stale';
  if (
    !previous &&
    (row.escalatedToMasterAt ||
      !row.acceptDeadlineAt ||
      row.acceptDeadlineAt > now ||
      row.acceptDeadlineAt.toISOString() !== data.fireAt)
  )
    return 'stale';
  if (!previous) {
    await tx
      .insert(domainEvents)
      .values({
        type: 'HANDOVER_TIMEOUT',
        occurredAt: now,
        source: 'SYSTEM',
        actingRole: 'SYSTEM',
        employeeId: row.submittedBy,
        shiftSessionId: row.shiftSessionId,
        zoneId: row.zoneId,
        idempotencyKey: `handover-timeout:${row.id}`,
        payload: {
          handoverId: row.id,
          acceptDeadlineAt: row.acceptDeadlineAt?.toISOString() ?? null,
        },
      })
      .onConflictDoNothing({
        target: domainEvents.idempotencyKey,
        where: sql`${domainEvents.idempotencyKey} IS NOT NULL`,
      });
    await tx
      .update(handoverRecords)
      .set({ escalatedToMasterAt: now, updatedAt: now })
      .where(eq(handoverRecords.id, row.id));
  }
  const [zone] = row.zoneId
    ? await tx
        .select({ name: responsibilityZones.name })
        .from(responsibilityZones)
        .where(eq(responsibilityZones.id, row.zoneId))
    : [];
  const t = messages(await employeeLocale(tx, row.submittedBy));
  const inserted = await tx
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: row.submittedBy,
      template: 'HANDOVER_PENDING',
      payload: {
        text: zone
          ? format(t.handover.timeoutNotification, { zone: zone.name })
          : t.handover.timeoutNotificationNoZone,
      },
      dedupeKey: `handover-timeout:${row.id}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length ? 'queued' : 'duplicate';
}

export function handleCleaningReminder(
  db: Database,
  data: CleaningReminderJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  return db.transaction((tx) => handleCleaningReminderWithin(tx, data, testTime));
}

/** Prefer the shift's frozen plan. An overdue reminder never asks a worker to clean retroactively. */
export async function handleCleaningReminderWithin(
  tx: Transaction,
  data: CleaningReminderJob,
  testTime: Date | undefined,
): Promise<ReminderOutcome> {
  const [s] = await tx
    .select()
    .from(shiftSessions)
    .where(eq(shiftSessions.id, data.sessionId))
    .for('no key update');
  const now = await timerNow(tx, testTime);
  if (
    !s ||
    !['PREPARATION', 'WORKING', 'BREAK', 'MEAL', 'SERVICE_TIME', 'DOWNTIME'].includes(s.state) ||
    new Date(data.fireAt) > now
  )
    return 'stale';
  const [assignment] =
    !s.planEndAt && s.assignmentId
      ? await tx
          .select({ planEndAt: shiftAssignments.planEndAt })
          .from(shiftAssignments)
          .where(eq(shiftAssignments.id, s.assignmentId))
      : [];
  const planEndAt = s.planEndAt ?? assignment?.planEndAt;
  if (!planEndAt || planEndAt <= now) return 'stale';
  const minutes = Math.round((planEndAt.getTime() - now.getTime()) / 60_000);
  const t = messages(await employeeLocale(tx, s.employeeId));
  const buttons =
    s.state === 'WORKING'
      ? [[{ text: t.actions.START_CLEANING, callbackData: `sh:START_CLEANING:${s.version}` }]]
      : undefined;
  const inserted = await tx
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: s.employeeId,
      template: 'CLEANING_REMINDER',
      payload: {
        text: format(t.handover.cleaningReminder, { minutes }),
        ...(buttons ? { buttons } : {}),
      },
      dedupeKey: `cleaning-reminder:${s.id}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length ? 'queued' : 'duplicate';
}
