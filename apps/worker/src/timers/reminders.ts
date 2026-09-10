import { timerNow } from './time.js';
import {
  and,
  assignmentAcknowledgements,
  eq,
  isNull,
  gt,
  notificationOutbox,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  employeeLocale,
  type Database,
  type Transaction,
} from '@vakhta/db';
import { formatLocal } from '@vakhta/domain';
import type { AckReminderJob, ShiftReminderJob } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';

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

  const [row] = await db
    .select({
      a: shiftAssignments,
      isNight: shiftTemplates.isNight,
      timezone: sites.timezone,
      zoneName: responsibilityZones.name,
    })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
    .innerJoin(shiftTemplates, eq(shiftAssignments.templateId, shiftTemplates.id))
    .innerJoin(sites, eq(scheduleVersions.siteId, sites.id))
    .leftJoin(responsibilityZones, eq(shiftAssignments.zoneId, responsibilityZones.id))
    .where(
      and(
        eq(shiftAssignments.id, data.assignmentId),
        eq(shiftAssignments.status, 'PLANNED'),
        eq(scheduleVersions.status, 'PUBLISHED'),
      ),
    )
    .limit(1);
  if (!row || row.a.planStartAt.getTime() <= now.getTime()) return 'stale';

  const local = formatLocal(row.a.planStartAt, row.timezone).local;
  const t = messages(await employeeLocale(db, row.a.employeeId));
  const text = format(t.schedule.shiftReminder, {
    kind: t.schedule.kindNames[row.isNight ? 'NIGHT' : 'DAY'],
    date: `${local.slice(8, 10)}.${local.slice(5, 7)}`,
    start: local.slice(11, 16),
    zone: row.zoneName ? ` · ${row.zoneName}` : '',
  });
  const inserted = await db
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: row.a.employeeId,
      template: 'SHIFT_REMINDER',
      payload: { text },
      dedupeKey: `shift-reminder:${row.a.id}`,
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
  const [version] = await db
    .select({
      id: scheduleVersions.id,
      periodMonth: scheduleVersions.periodMonth,
      status: scheduleVersions.status,
    })
    .from(scheduleVersions)
    .where(eq(scheduleVersions.id, data.versionId))
    .for('no key update');
  const now = await timerNow(db, testTime);
  if (!version || version.status !== 'PUBLISHED' || new Date(data.fireAt) > now) return 'stale';

  const [pending] = await db
    .select({ id: shiftAssignments.id })
    .from(shiftAssignments)
    .leftJoin(
      assignmentAcknowledgements,
      eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
    )
    .where(
      and(
        eq(shiftAssignments.scheduleVersionId, data.versionId),
        eq(shiftAssignments.employeeId, data.employeeId),
        gt(shiftAssignments.planStartAt, now),
        eq(shiftAssignments.status, 'PLANNED'),
        isNull(assignmentAcknowledgements.id),
      ),
    )
    .limit(1);
  if (!pending) return 'stale';

  const [year, m] = version.periodMonth.split('-');
  const t = messages(await employeeLocale(db, data.employeeId));
  const text = format(t.schedule.ackReminder, {
    month: t.schedule.months[Number(m) - 1] ?? version.periodMonth,
    year: year ?? '',
  });
  const inserted = await db
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: data.employeeId,
      template: 'ACK_REMINDER',
      payload: {
        text,
        buttons: [[{ text: t.schedule.ackButton, callbackData: `ack:${version.id}` }]],
      },
      dedupeKey: `ack-reminder:${version.id}:${data.employeeId}`,
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
