import { z } from 'zod';
import { TimerTask, timerTaskIntent, timerTaskKey } from '@vakhta/contracts';
import {
  activityIntervals,
  and,
  asc,
  assignmentAcknowledgements,
  backgroundTasks,
  domainEvents,
  downtimeIncidents,
  enqueueBackgroundTask,
  eq,
  gt,
  handoverRecords,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  or,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  sql,
  type Database,
  type SQL,
} from '@vakhta/db';
import { OPEN_INCIDENT_STATUSES } from '@vakhta/domain';

export const TimerRecoveryOptions = z.object({
  limit: z.number().int().min(1).max(100).default(100),
  shiftReminderMinutes: z.number().int().positive().default(120),
  ackReminderHours: z.number().int().positive().default(24),
  breakMinutes: z.number().int().positive().default(15),
  mealMinutes: z.number().int().positive().default(60),
  serviceTimeMinutes: z.number().int().positive().default(30),
  downtimeEscalationMinutes: z.number().int().positive().default(15),
  cleaningReminderMinutes: z.number().int().positive().default(30),
  autoCloseGraceMinutes: z.number().int().positive().default(120),
});
export type TimerRecoveryOptions = z.infer<typeof TimerRecoveryOptions>;
export interface LegacyTimerReader {
  read(jobId: string): Promise<unknown | null>;
}

/** Each kind has a bounded anti-join. Old receipt dates and delayed commits are never skipped. */
export async function recoverTimerTasks(
  db: Database,
  input: Partial<TimerRecoveryOptions> = {},
  legacy?: LegacyTimerReader,
  now = new Date(),
) {
  const options = TimerRecoveryOptions.parse(input);
  const absent = (key: SQL) =>
    notExists(
      db
        .select({ one: sql`1` })
        .from(backgroundTasks)
        .where(eq(backgroundTasks.dedupeKey, key)),
    );
  const candidates: TimerTask[] = [];
  const shifts = await db
    .select({ id: shiftAssignments.id, start: shiftAssignments.planStartAt })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
    .where(
      and(
        eq(scheduleVersions.status, 'PUBLISHED'),
        eq(shiftAssignments.status, 'PLANNED'),
        gt(shiftAssignments.planStartAt, now),
        absent(sql`'shift-reminder.' || ${shiftAssignments.id}::text`),
      ),
    )
    .orderBy(asc(shiftAssignments.planStartAt), asc(shiftAssignments.id))
    .limit(options.limit);
  for (const row of shifts)
    candidates.push({
      kind: 'SHIFT_REMINDER',
      payload: {
        assignmentId: row.id,
        fireAt: new Date(row.start.getTime() - options.shiftReminderMinutes * 60_000).toISOString(),
      },
    });

  const acknowledgements = await db
    .selectDistinct({
      versionId: scheduleVersions.id,
      employeeId: shiftAssignments.employeeId,
      publishedAt: scheduleVersions.publishedAt,
    })
    .from(shiftAssignments)
    .innerJoin(scheduleVersions, eq(shiftAssignments.scheduleVersionId, scheduleVersions.id))
    .leftJoin(
      assignmentAcknowledgements,
      eq(assignmentAcknowledgements.assignmentId, shiftAssignments.id),
    )
    .where(
      and(
        eq(scheduleVersions.status, 'PUBLISHED'),
        isNotNull(scheduleVersions.publishedAt),
        eq(shiftAssignments.status, 'PLANNED'),
        gt(shiftAssignments.planStartAt, now),
        isNull(assignmentAcknowledgements.id),
        absent(
          sql`'ack-reminder.' || ${scheduleVersions.id}::text || '.' || ${shiftAssignments.employeeId}::text`,
        ),
      ),
    )
    .orderBy(
      asc(scheduleVersions.id),
      asc(shiftAssignments.employeeId),
      asc(scheduleVersions.publishedAt),
    )
    .limit(options.limit);
  for (const row of acknowledgements)
    if (row.publishedAt)
      candidates.push({
        kind: 'ACK_REMINDER',
        payload: {
          versionId: row.versionId,
          employeeId: row.employeeId,
          fireAt: new Date(
            row.publishedAt.getTime() + options.ackReminderHours * 3_600_000,
          ).toISOString(),
        },
      });

  const intervals = await db
    .select({ interval: activityIntervals, session: shiftSessions })
    .from(activityIntervals)
    .innerJoin(shiftSessions, eq(activityIntervals.shiftSessionId, shiftSessions.id))
    .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
    .where(
      and(
        isNull(activityIntervals.endedAt),
        inArray(activityIntervals.state, ['BREAK', 'MEAL', 'SERVICE_TIME', 'DOWNTIME']),
        eq(activityIntervals.state, shiftSessions.state),
        sql`coalesce(${shiftSessions.planEndAt}, ${shiftAssignments.planEndAt}) + ${options.autoCloseGraceMinutes} * interval '1 minute' > ${now.toISOString()}::timestamptz`,
        absent(
          sql`case when ${activityIntervals.state} = 'DOWNTIME' then 'downtime-escalation.' else 'return-reminder.' end || ${shiftSessions.id}::text || '.' || ${activityIntervals.id}::text`,
        ),
      ),
    )
    .orderBy(asc(activityIntervals.startedAt), asc(activityIntervals.id))
    .limit(options.limit);
  for (const { interval, session } of intervals) {
    if (interval.state === 'DOWNTIME')
      candidates.push({
        kind: 'DOWNTIME_ESCALATION',
        payload: {
          sessionId: session.id,
          intervalId: interval.id,
          thresholdMinutes: options.downtimeEscalationMinutes,
          fireAt: new Date(
            interval.startedAt.getTime() + options.downtimeEscalationMinutes * 60_000,
          ).toISOString(),
        },
      });
    else if (
      interval.state === 'BREAK' ||
      interval.state === 'MEAL' ||
      interval.state === 'SERVICE_TIME'
    ) {
      const limitMinutes =
        interval.state === 'BREAK'
          ? options.breakMinutes
          : interval.state === 'MEAL'
            ? options.mealMinutes
            : options.serviceTimeMinutes;
      candidates.push({
        kind: 'RETURN_REMINDER',
        payload: {
          sessionId: session.id,
          intervalId: interval.id,
          state: interval.state,
          limitMinutes,
          fireAt: new Date(interval.startedAt.getTime() + limitMinutes * 60_000).toISOString(),
        },
      });
    }
  }
  const cleaning = await db
    .select({
      id: shiftSessions.id,
      planEndAt:
        sql<Date>`coalesce(${shiftSessions.planEndAt}, ${shiftAssignments.planEndAt})`.mapWith(
          shiftSessions.planEndAt,
        ),
    })
    .from(shiftSessions)
    .leftJoin(shiftAssignments, eq(shiftSessions.assignmentId, shiftAssignments.id))
    .where(
      and(
        inArray(shiftSessions.state, [
          'PREPARATION',
          'WORKING',
          'BREAK',
          'MEAL',
          'SERVICE_TIME',
          'DOWNTIME',
        ]),
        sql`coalesce(${shiftSessions.planEndAt}, ${shiftAssignments.planEndAt}) > ${now.toISOString()}::timestamptz`,
        absent(sql`'cleaning-reminder.' || ${shiftSessions.id}::text`),
      ),
    )
    .orderBy(asc(shiftSessions.id))
    .limit(options.limit);
  for (const row of cleaning)
    candidates.push({
      kind: 'CLEANING_REMINDER',
      payload: {
        sessionId: row.id,
        fireAt: new Date(
          row.planEndAt.getTime() - options.cleaningReminderMinutes * 60_000,
        ).toISOString(),
      },
    });

  const incidents = await db
    .select()
    .from(downtimeIncidents)
    .where(
      and(
        absent(sql`'incident-sla.' || ${downtimeIncidents.id}::text`),
        or(
          and(
            inArray(downtimeIncidents.status, [...OPEN_INCIDENT_STATUSES]),
            isNull(downtimeIncidents.acknowledgedAt),
            ne(downtimeIncidents.severity, 'SAFETY'),
          ),
          and(
            isNull(downtimeIncidents.escalatedAt),
            sql`exists (select 1 from ${domainEvents} where ${domainEvents.idempotencyKey} = 'incident-sla:' || ${downtimeIncidents.id}::text)`,
          ),
        ),
      ),
    )
    .orderBy(asc(downtimeIncidents.slaDueAt), asc(downtimeIncidents.id))
    .limit(options.limit);
  for (const row of incidents)
    candidates.push({
      kind: 'INCIDENT_SLA',
      payload: { incidentId: row.id, fireAt: row.slaDueAt.toISOString() },
    });

  const handovers = await db
    .select()
    .from(handoverRecords)
    .where(
      and(
        isNotNull(handoverRecords.acceptDeadlineAt),
        absent(sql`'handover-timeout.' || ${handoverRecords.id}::text`),
        or(
          and(eq(handoverRecords.status, 'SUBMITTED'), isNull(handoverRecords.escalatedToMasterAt)),
          sql`exists (select 1 from ${domainEvents} where ${domainEvents.idempotencyKey} = 'handover-timeout:' || ${handoverRecords.id}::text) and (${handoverRecords.escalatedToMasterAt} is null or (${handoverRecords.status} = 'SUBMITTED' and not exists (select 1 from notification_outbox n where n.dedupe_key = 'handover-timeout:' || ${handoverRecords.id}::text)))`,
        ),
      ),
    )
    .orderBy(asc(handoverRecords.acceptDeadlineAt), asc(handoverRecords.id))
    .limit(options.limit);
  for (const row of handovers)
    if (row.acceptDeadlineAt)
      candidates.push({
        kind: 'HANDOVER_TIMEOUT',
        payload: { handoverId: row.id, fireAt: row.acceptDeadlineAt.toISOString() },
      });

  let admitted = 0;
  let legacyUsed = 0;
  let currentConfigFallback = 0;
  let failed = 0;
  let legacyUnavailable = false;
  for (const candidate of candidates) {
    let task = candidate;
    if (legacy && !legacyUnavailable) {
      try {
        const payload = await readLegacy(legacy, timerTaskKey(candidate));
        const parsed = TimerTask.safeParse({ kind: candidate.kind, payload });
        if (
          parsed.success &&
          timerTaskKey(parsed.data) === timerTaskKey(candidate) &&
          (candidate.kind !== 'RETURN_REMINDER' ||
            (parsed.data.kind === 'RETURN_REMINDER' &&
              parsed.data.payload.state === candidate.payload.state)) &&
          (!(candidate.kind === 'INCIDENT_SLA' || candidate.kind === 'HANDOVER_TIMEOUT') ||
            parsed.data.payload.fireAt === candidate.payload.fireAt)
        ) {
          task = parsed.data;
          legacyUsed++;
        }
      } catch {
        legacyUnavailable = true;
      }
    }
    if (task === candidate && !['INCIDENT_SLA', 'HANDOVER_TIMEOUT'].includes(candidate.kind))
      currentConfigFallback++;
    try {
      const intent = timerTaskIntent(task);
      const created = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: backgroundTasks.id })
          .from(backgroundTasks)
          .where(eq(backgroundTasks.dedupeKey, intent.dedupeKey));
        if (existing) return false;
        return (await enqueueBackgroundTask(tx, intent)).created;
      });
      if (created) admitted++;
    } catch {
      failed++;
    }
  }
  return { admitted, legacyUsed, currentConfigFallback, failed, legacyUnavailable };
}

/** Optional Redis evidence never holds a DB transaction or blocks correctness on availability. */
async function readLegacy(reader: LegacyTimerReader, key: string): Promise<unknown | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(key),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Legacy timer lookup timed out')), 500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
