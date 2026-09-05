import {
  and,
  domainEvents,
  eq,
  handoverRecords,
  isNull,
  lte,
  notificationOutbox,
  responsibilityZones,
  shiftAssignments,
  shiftSessions,
  sql,
  type Database,
} from '@vakhta/db';
import type { CleaningReminderJob, HandoverTimeoutJob } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import type { ReminderOutcome } from './reminders.js';

const t = messages('ru');

/**
 * Тайм-аут приймання (FR-HND-06): якщо приймаючий не відповів до дедлайну, зона переходить
 * майстру; здавач отримує повідомлення, що це не впливає на його бали.
 */
export async function handleHandoverTimeout(
  db: Database,
  data: HandoverTimeoutJob,
  now: Date = new Date(),
): Promise<ReminderOutcome> {
  const [row] = await db
    .select({ r: handoverRecords, zoneName: responsibilityZones.name })
    .from(handoverRecords)
    .innerJoin(responsibilityZones, eq(handoverRecords.zoneId, responsibilityZones.id))
    .where(
      and(
        eq(handoverRecords.id, data.handoverId),
        eq(handoverRecords.status, 'SUBMITTED'),
        isNull(handoverRecords.escalatedToMasterAt),
        lte(handoverRecords.acceptDeadlineAt, now),
      ),
    )
    .limit(1);
  if (!row) return 'stale';

  const inserted = await db
    .insert(domainEvents)
    .values({
      type: 'HANDOVER_TIMEOUT',
      occurredAt: now,
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      employeeId: row.r.submittedBy,
      shiftSessionId: row.r.shiftSessionId,
      zoneId: row.r.zoneId,
      idempotencyKey: `handover-timeout:${row.r.id}`,
      payload: {
        handoverId: row.r.id,
        acceptDeadlineAt: row.r.acceptDeadlineAt?.toISOString() ?? null,
      },
    })
    .onConflictDoNothing({
      target: domainEvents.idempotencyKey,
      where: sql`${domainEvents.idempotencyKey} IS NOT NULL`,
    })
    .returning({ id: domainEvents.id });
  if (inserted.length === 0) return 'duplicate';

  await db
    .update(handoverRecords)
    .set({ escalatedToMasterAt: now, updatedAt: now })
    .where(eq(handoverRecords.id, row.r.id));
  await db
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: row.r.submittedBy,
      template: 'HANDOVER_PENDING',
      payload: { text: format(t.handover.timeoutNotification, { zone: row.zoneName }) },
      dedupeKey: `handover-timeout:${row.r.id}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
  return 'queued';
}

/** Нагадування про прибирання за N хвилин до планового кінця (FR-CLN-01). Мовчить, якщо прибирання вже йде. */
export async function handleCleaningReminder(
  db: Database,
  data: CleaningReminderJob,
  now: Date = new Date(),
): Promise<ReminderOutcome> {
  const [row] = await db
    .select({ s: shiftSessions, planEndAt: shiftAssignments.planEndAt })
    .from(shiftSessions)
    .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
    .where(eq(shiftSessions.id, data.sessionId))
    .limit(1);
  if (!row) return 'stale';
  const s = row.s;
  const active = ['PREPARATION', 'WORKING', 'BREAK', 'MEAL', 'SERVICE_TIME', 'DOWNTIME'];
  if (!active.includes(s.state)) return 'stale';

  const minutes = row.planEndAt
    ? Math.max(0, Math.round((row.planEndAt.getTime() - now.getTime()) / 60_000))
    : 0;
  const buttons =
    s.state === 'WORKING'
      ? [[{ text: t.actions.START_CLEANING, callbackData: `sh:START_CLEANING:${s.version}` }]]
      : undefined;
  const inserted = await db
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
  return inserted.length > 0 ? 'queued' : 'duplicate';
}
