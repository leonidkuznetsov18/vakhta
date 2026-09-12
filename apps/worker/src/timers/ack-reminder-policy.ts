import {
  and,
  assignmentAcknowledgements,
  employeeLocale,
  eq,
  gt,
  isNull,
  scheduleVersions,
  shiftAssignments,
  type Transaction,
} from '@vakhta/db';
import { BusinessDate, Uuid, type AckReminderJob } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { z } from 'zod';

const ReminderKey = z.union([
  z.tuple([z.literal('ack-reminder'), Uuid, Uuid]),
  z.tuple([z.literal('ack-reminder'), z.literal('manual'), Uuid, Uuid, BusinessDate]),
]);
type AckTarget = Pick<AckReminderJob, 'versionId' | 'employeeId'>;

/** Existing timer and manual keys identify the publication and employee independently of text. */
export function ackReminderTarget(key: string): AckTarget | null {
  const parsed = ReminderKey.safeParse(key.split(':'));
  if (!parsed.success) return null;
  const parts = parsed.data;
  return parts.length === 3
    ? { versionId: parts[1], employeeId: parts[2] }
    : { versionId: parts[2], employeeId: parts[3] };
}

/** The same eligibility at admission and delivery: only a current future unconfirmed assignment. */
export async function readAckReminder(db: Transaction, target: AckTarget, now: Date) {
  const [pending] = await db
    .select({ periodMonth: scheduleVersions.periodMonth })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
    .leftJoin(
      assignmentAcknowledgements,
      eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
    )
    .where(
      and(
        eq(scheduleVersions.id, target.versionId),
        eq(scheduleVersions.status, 'PUBLISHED'),
        eq(shiftAssignments.employeeId, target.employeeId),
        gt(shiftAssignments.planStartAt, now),
        eq(shiftAssignments.status, 'PLANNED'),
        isNull(assignmentAcknowledgements.id),
      ),
    )
    .limit(1);
  if (!pending) return null;
  const [year, month] = pending.periodMonth.split('-');
  const t = messages(await employeeLocale(db, target.employeeId));
  return {
    text: format(t.schedule.ackReminder, {
      month: t.schedule.months[Number(month) - 1] ?? pending.periodMonth,
      year: year ?? '',
    }),
    buttons: [[{ text: t.schedule.ackButton, callbackData: `ack:${target.versionId}` }]],
  };
}
