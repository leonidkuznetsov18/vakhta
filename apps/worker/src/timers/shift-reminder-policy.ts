import {
  and,
  employees,
  employeeLocale,
  eq,
  gte,
  inArray,
  lte,
  notExists,
  or,
  requests,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
  sql,
  type Transaction,
} from '@vakhta/db';
import { formatLocal, PERIOD_TYPES, SHIFT_REMINDER_LEAD_MINUTES } from '@vakhta/domain';
import { format, messages } from '@vakhta/i18n';

/** Re-read committed eligibility both when admitting a reminder and immediately before delivery. */
export async function readShiftReminder(db: Transaction, assignmentId: string, now: Date) {
  const [row] = await db
    .select({
      assignment: shiftAssignments,
      isNight: shiftTemplates.isNight,
      timezone: sites.timezone,
      zoneName: responsibilityZones.name,
    })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
    .innerJoin(employees, eq(shiftAssignments.employeeId, employees.id))
    .innerJoin(shiftTemplates, eq(shiftAssignments.templateId, shiftTemplates.id))
    .innerJoin(sites, eq(scheduleVersions.siteId, sites.id))
    .leftJoin(responsibilityZones, eq(shiftAssignments.zoneId, responsibilityZones.id))
    .where(
      and(
        eq(shiftAssignments.id, assignmentId),
        eq(shiftAssignments.status, 'PLANNED'),
        eq(scheduleVersions.status, 'PUBLISHED'),
        eq(employees.status, 'ACTIVE'),
        notExists(
          db
            .select({ one: sql`1` })
            .from(requests)
            .where(
              and(
                eq(requests.employeeId, shiftAssignments.employeeId),
                eq(requests.status, 'APPROVED'),
                or(
                  and(
                    inArray(requests.type, [...PERIOD_TYPES]),
                    lte(requests.periodFrom, shiftAssignments.businessDate),
                    gte(requests.periodTo, shiftAssignments.businessDate),
                  ),
                  and(
                    eq(requests.type, 'CANNOT_ATTEND'),
                    eq(requests.assignmentId, shiftAssignments.id),
                  ),
                ),
              ),
            ),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(shiftSessions)
            .where(eq(shiftSessions.assignmentId, shiftAssignments.id)),
        ),
      ),
    )
    .limit(1);
  if (!row || row.assignment.planStartAt <= now) return null;

  const local = formatLocal(row.assignment.planStartAt, row.timezone).local;
  const t = messages(await employeeLocale(db, row.assignment.employeeId));
  return {
    employeeId: row.assignment.employeeId,
    sendAt: new Date(row.assignment.planStartAt.getTime() - SHIFT_REMINDER_LEAD_MINUTES * 60_000),
    payload: {
      text: format(t.schedule.shiftReminder, {
        kind: t.schedule.kindNames[row.isNight ? 'NIGHT' : 'DAY'],
        date: `${local.slice(8, 10)}.${local.slice(5, 7)}`,
        start: local.slice(11, 16),
        zone: row.zoneName ? ` · ${row.zoneName}` : '',
      }),
    },
  };
}
