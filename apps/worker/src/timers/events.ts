import {
  and,
  asc,
  employeeLocale,
  employeePositions,
  employees,
  enqueueBackgroundTask,
  eq,
  gt,
  isNull,
  notificationOutbox,
  orgUnits,
  requests,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  telegramAccounts,
  type Transaction,
} from '@vakhta/db';
import type { AbsenceCheckinJob, AbsenceReturnJob, BirthdayGreetingJob } from '@vakhta/contracts';
import { timerTaskIntent } from '@vakhta/contracts';
import { businessDateOf, formatLocal, nextAnniversary, planInstants } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';
import { timerNow } from './time.js';
import type { ReminderOutcome } from './reminders.js';

/**
 * Calendar-event timers (birthdays, sick leave, vacations). Every handler re-reads the committed
 * state when it fires: a dismissed employee, a cancelled request or an unlinked Telegram account
 * silences the message. Effects go to the outbox on the task's own transaction (ADR-8).
 */

async function linked(tx: Transaction, employeeId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: telegramAccounts.id })
    .from(telegramAccounts)
    .where(eq(telegramAccounts.employeeId, employeeId))
    .limit(1);
  return !!row;
}

async function siteTimezone(tx: Transaction, employeeId: string): Promise<string> {
  const [row] = await tx
    .select({ timezone: sites.timezone })
    .from(employeePositions)
    .innerJoin(orgUnits, eq(orgUnits.id, employeePositions.orgUnitId))
    .innerJoin(sites, eq(sites.id, orgUnits.siteId))
    .where(and(eq(employeePositions.employeeId, employeeId), isNull(employeePositions.validTo)))
    .limit(1);
  return row?.timezone ?? 'Europe/Kyiv';
}

/** Greets on the birthday and admits next year's greeting; a stale fire time greets nobody. */
export async function handleBirthdayGreetingWithin(
  tx: Transaction,
  data: BirthdayGreetingJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  const [employee] = await tx
    .select({ id: employees.id, fullName: employees.fullName, birthDate: employees.birthDate })
    .from(employees)
    .where(and(eq(employees.id, data.employeeId), eq(employees.status, 'ACTIVE')))
    .for('no key update');
  if (!employee?.birthDate) return 'stale';
  const now = await timerNow(tx, testTime);
  if (new Date(data.fireAt) > now) return 'stale';
  const timezone = await siteTimezone(tx, employee.id);
  const today = businessDateOf(now, timezone);
  const expected = nextAnniversary(employee.birthDate, data.fireAt.slice(0, 10));
  // The greeting belongs to the day it was planned for; a much later run only re-plans.
  const greetToday = expected === today;
  const nextDate = nextAnniversary(employee.birthDate, shift(today, 1));
  const nextFireAt = planInstants(
    nextDate,
    { localStart: '09:00', localEnd: '09:01' },
    timezone,
  ).planStartAt;
  await enqueueBackgroundTask(
    tx,
    timerTaskIntent({
      kind: 'BIRTHDAY_GREETING',
      payload: { employeeId: employee.id, fireAt: nextFireAt.toISOString() },
    }),
  );
  if (!greetToday || !(await linked(tx, employee.id))) return 'stale';
  const t = messages(await employeeLocale(tx, employee.id));
  const inserted = await tx
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: employee.id,
      template: 'BIRTHDAY_GREETING',
      payload: {
        text: format(t.schedule.birthdayGreeting, {
          name: employee.fullName.split(' ')[1] ?? employee.fullName,
        }),
      },
      dedupeKey: `birthday:${employee.id}:${today.slice(0, 4)}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length > 0 ? 'queued' : 'duplicate';
}

/** Daily "how are you" while the sick leave is still approved and covers the day. */
export async function handleAbsenceCheckinWithin(
  tx: Transaction,
  data: AbsenceCheckinJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  const [row] = await tx
    .select()
    .from(requests)
    .where(eq(requests.id, data.requestId))
    .for('no key update');
  if (
    !row ||
    row.type !== 'SICK' ||
    row.status !== 'APPROVED' ||
    !row.periodFrom ||
    !row.periodTo ||
    data.businessDate < row.periodFrom ||
    data.businessDate > row.periodTo
  )
    return 'stale';
  const now = await timerNow(tx, testTime);
  if (new Date(data.fireAt) > now) return 'stale';
  if (!(await linked(tx, row.employeeId))) return 'stale';
  const t = messages(await employeeLocale(tx, row.employeeId));
  const inserted = await tx
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: row.employeeId,
      template: 'ABSENCE_CHECKIN',
      payload: {
        text: t.schedule.checkinQuestion,
        buttons: [
          [
            { text: t.schedule.checkinGood, callbackData: `well:${row.id}:GOOD` },
            { text: t.schedule.checkinSame, callbackData: `well:${row.id}:SAME` },
            { text: t.schedule.checkinWorse, callbackData: `well:${row.id}:WORSE` },
          ],
        ],
      },
      dedupeKey: `absence-checkin:${row.id}:${data.businessDate}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length > 0 ? 'queued' : 'duplicate';
}

/** The day before a vacation ends: the next published shift, or a pointer to "My plan". */
export async function handleAbsenceReturnWithin(
  tx: Transaction,
  data: AbsenceReturnJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  const [row] = await tx
    .select()
    .from(requests)
    .where(eq(requests.id, data.requestId))
    .for('no key update');
  if (!row || row.status !== 'APPROVED' || !row.periodTo) return 'stale';
  const now = await timerNow(tx, testTime);
  if (new Date(data.fireAt) > now) return 'stale';
  if (!(await linked(tx, row.employeeId))) return 'stale';
  const [next] = await tx
    .select({
      businessDate: shiftAssignments.businessDate,
      planStartAt: shiftAssignments.planStartAt,
      planEndAt: shiftAssignments.planEndAt,
      isNight: shiftTemplates.isNight,
      zoneName: responsibilityZones.name,
      timezone: sites.timezone,
    })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
    .innerJoin(shiftTemplates, eq(shiftTemplates.id, shiftAssignments.templateId))
    .innerJoin(sites, eq(sites.id, scheduleVersions.siteId))
    .leftJoin(responsibilityZones, eq(responsibilityZones.id, shiftAssignments.zoneId))
    .where(
      and(
        eq(shiftAssignments.employeeId, row.employeeId),
        eq(shiftAssignments.status, 'PLANNED'),
        eq(scheduleVersions.status, 'PUBLISHED'),
        gt(shiftAssignments.businessDate, row.periodTo),
      ),
    )
    .orderBy(asc(shiftAssignments.planStartAt))
    .limit(1);
  const t = messages(await employeeLocale(tx, row.employeeId));
  let text = t.schedule.returnReminderNoShift;
  if (next) {
    const local = formatLocal(next.planStartAt, next.timezone).local;
    const end = formatLocal(next.planEndAt, next.timezone).local;
    const weekday = new Date(`${next.businessDate}T00:00:00Z`).getUTCDay();
    text = format(t.schedule.returnReminder, {
      date: `${local.slice(8, 10)}.${local.slice(5, 7)}`,
      weekday: t.schedule.weekdaysShort[(weekday + 6) % 7] ?? '',
      kind: t.schedule.kindNames[next.isNight ? 'NIGHT' : 'DAY'],
      start: local.slice(11, 16),
      end: end.slice(11, 16),
      zone: next.zoneName ? ` · ${next.zoneName}` : '',
    });
  }
  const inserted = await tx
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: row.employeeId,
      template: 'ABSENCE_RETURN',
      payload: { text },
      dedupeKey: `absence-return:${row.id}`,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return inserted.length > 0 ? 'queued' : 'duplicate';
}

function shift(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
