import {
  and,
  assignmentAcknowledgements,
  eq,
  isNull,
  notificationOutbox,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  type Database,
} from '@vakhta/db';
import { formatLocal } from '@vakhta/domain';
import type { AckReminderJob, ShiftReminderJob } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';

export type ReminderOutcome = 'queued' | 'duplicate' | 'stale';

const t = messages('ru');

/**
 * Нагадування «зміна скоро» (ТЗ 10). Таймер лише читає стан: якщо зміну скасовано,
 * версію замінено або час минув, нічого не робить (ADR-8).
 */
export async function handleShiftReminder(
  db: Database,
  data: ShiftReminderJob,
  now: Date = new Date(),
): Promise<ReminderOutcome> {
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

/** Повторне нагадування про ознайомлення, доки хоч одна зміна версії не підтверджена. */
export async function handleAckReminder(
  db: Database,
  data: AckReminderJob,
): Promise<ReminderOutcome> {
  const [version] = await db
    .select({
      id: scheduleVersions.id,
      periodMonth: scheduleVersions.periodMonth,
      status: scheduleVersions.status,
    })
    .from(scheduleVersions)
    .where(eq(scheduleVersions.id, data.versionId))
    .limit(1);
  if (!version || version.status !== 'PUBLISHED') return 'stale';

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
        eq(shiftAssignments.status, 'PLANNED'),
        isNull(assignmentAcknowledgements.id),
      ),
    )
    .limit(1);
  if (!pending) return 'stale';

  const [year, m] = version.periodMonth.split('-');
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
