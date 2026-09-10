import { auditLog, domainEvents } from './schema/events.js';
import { sql, type SQL } from 'drizzle-orm';
import type { Transaction } from './client.js';
import { enqueueBonusRecalculation } from './media-tasks.js';

/** Actual writes fence RR snapshots; a lock without a row change cannot provide this guarantee. */
export async function lockBonusMonthWithin(tx: Transaction, month: string): Promise<void> {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid bonus month');
  await tx.execute(sql`INSERT INTO bonus_month_guards(month, revision) VALUES (${month}, 1)
    ON CONFLICT(month) DO UPDATE SET revision = bonus_month_guards.revision + 1`);
}

const DIRECT_SOURCES = [
  'SHIFT_CLOSED',
  'EMERGENCY_EXIT',
  'SHIFT_AUTO_CLOSED',
  'SHIFT_CORRECTED',
  'SHIFT_SUMMARY_COMPUTED',
  'SHIFT_FLAGGED_FOR_REVIEW',
  'SHIFT_AUTO_CLOSE_PROJECTED',
  'SHIFT_PLAN_RECOVERED',
  'SHIFT_PLAN_INVALID',
  'SHIFT_PLAN_UNRECOVERABLE',
  'DOWNTIME_UNREGISTERED_CONFIRMED',
  'SYSTEM_INCIDENT_APPLIED',
  'BONUS_ADJUSTED',
  'BONUS_ADJUSTMENT_UPDATED',
  'BONUS_ADJUSTMENT_CANCELLED',
  'BONUS_SCORE_REVIEWED',
  'BONUS_ADJUSTMENT_SECOND_DECIDED',
  'BONUS_RECALCULATION_RECOVERED',
] as const;

const HANDOVER_SOURCES = [
  'CHECKLIST_ANSWERED',
  'HANDOVER_PHOTO_ATTACHED',
  'CLEANING_NOT_COMPLETED',
  'HANDOVER_SUBMITTED',
  'HANDOVER_ACCEPTED',
  'HANDOVER_DISPUTED',
  'HANDOVER_RESOLVED',
] as const;
const REQUEST_SOURCES = ['REQUEST_SUBMITTED', 'REQUEST_CANCELLED', 'REQUEST_DECIDED'] as const;
const INCIDENT_SOURCES = [
  'INCIDENT_REPORTED',
  'INCIDENT_STATUS_CHANGED',
  'INCIDENT_UPDATED',
] as const;
const PRESENCE_SOURCES = [
  'PRESENCE_ARRIVED',
  'PRESENCE_DEPARTED',
  'PRESENCE_DEPARTURE_UNKNOWN',
] as const;
const SOURCE_TYPES = [
  ...DIRECT_SOURCES,
  ...HANDOVER_SOURCES,
  ...REQUEST_SOURCES,
  ...INCIDENT_SOURCES,
  ...PRESENCE_SOURCES,
  'MEDIA_PROCESSED',
  'BONUS_PERIOD_REOPENED',
] as const;
const list = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

/** Exact collector fallback; a stable identifier breaks equal arrival-time ties in both paths. */
export function bonusPresenceId(presenceId: SQL, employeeId: SQL, anchor: SQL): SQL<string> {
  return sql<string>`coalesce(${presenceId}::uuid, (select p.id from presence_sessions p
    where p.employee_id = ${employeeId} and p.arrived_at <= ${anchor}
    order by p.arrived_at desc, p.id desc limit 1))`;
}

/** Same relational meaning in live admission and recovery; JSON identifiers compare as text. */
function sourceTargets() {
  return sql`FROM (SELECT * FROM domain_events WHERE type IN (${list(SOURCE_TYPES)})) e JOIN shift_sessions s ON (
    (e.type IN (${list(DIRECT_SOURCES)}) AND s.id = e.shift_session_id)
    OR (e.type IN (${list(HANDOVER_SOURCES)}) AND EXISTS (
      SELECT 1 FROM handover_records h WHERE h.id::text = e.payload->>'handoverId' AND h.shift_session_id = s.id))
    OR (e.type = 'HANDOVER_SUBMITTED' AND NOT (e.payload ? 'handoverId') AND s.id = e.shift_session_id)
    OR (e.type IN (${list(REQUEST_SOURCES)}) AND EXISTS (
      SELECT 1 FROM requests r WHERE r.id::text = e.payload->>'requestId' AND (
        r.shift_session_id = s.id OR r.assignment_id = s.assignment_id OR
        (r.employee_id = s.employee_id AND s.business_date BETWEEN r.period_from AND r.period_to))))
    OR (e.type IN (${list(INCIDENT_SOURCES)}) AND EXISTS (
      SELECT 1 FROM downtime_reports r WHERE r.incident_id = e.incident_id AND r.shift_session_id = s.id))
    OR (e.type IN (${list(PRESENCE_SOURCES)}) AND ${bonusPresenceId(sql`s.presence_id`, sql`s.employee_id`, sql`coalesce(s.started_at, s.created_at)`)}::text = e.payload->>'presenceId')
    OR (e.type = 'MEDIA_PROCESSED' AND EXISTS (
      SELECT 1 FROM handover_media m JOIN handover_records h ON h.id = m.handover_id
      WHERE m.media_object_id::text = e.payload->>'mediaObjectId' AND h.shift_session_id = s.id AND h.status <> 'SUPERSEDED'))
    OR (e.type = 'BONUS_PERIOD_REOPENED' AND EXISTS (
      SELECT 1 FROM bonus_periods p WHERE p.id::text = e.payload->>'periodId'
      AND left(s.business_date::text, 7) = p.month AND EXISTS (
        SELECT 1 FROM shift_sessions member LEFT JOIN shift_assignments a ON a.id = member.assignment_id
        LEFT JOIN org_units u ON u.id = a.org_unit_id WHERE member.id = s.id AND (u.site_id = p.site_id OR u.site_id IS NULL))))
  )`;
}
export type BonusSourceTarget = {
  readonly event_id: string;
  readonly session_id: string;
  readonly occurred_at: Date;
};

/** Anti-join precedes LIMIT: irrelevant/completed events cannot starve newer missing pairs. */
export async function pendingBonusSourceTargets(
  tx: Transaction,
  limit = 100,
): Promise<BonusSourceTarget[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid bonus recovery limit');
  return tx.execute<BonusSourceTarget>(sql`SELECT e.id AS event_id, s.id AS session_id, e.occurred_at ${sourceTargets()}
    WHERE NOT EXISTS (SELECT 1 FROM background_tasks t WHERE t.kind = 'BONUS_RECALCULATE' AND t.source_event_id = e.id AND t.target_session_id = s.id)
    ORDER BY e.received_at, e.id, s.id LIMIT ${limit}`);
}

/** Resolve recorded source identity, never a transient notification or an invented current actor. */
export async function enqueueEventBonusRecalculations(
  tx: Transaction,
  eventId: string,
): Promise<number> {
  const targets = await tx.execute<BonusSourceTarget>(sql`
    SELECT e.id AS event_id, s.id AS session_id, e.occurred_at ${sourceTargets()} WHERE e.id = ${eventId}`);
  for (const target of targets)
    await enqueueBonusRecalculation(tx, {
      sourceEventId: target.event_id,
      targetSessionId: target.session_id,
      dueAt: new Date(target.occurred_at),
    });
  return targets.length;
}

/** Repeated bounded anti-joins recover older commits without advancing an unsafe time cursor. */
export async function recoverBonusTasks(tx: Transaction, limit = 100) {
  const pending = await pendingBonusSourceTargets(tx, limit);
  let admitted = 0;
  for (const target of pending) {
    const result = await enqueueBonusRecalculation(tx, {
      sourceEventId: target.event_id,
      targetSessionId: target.session_id,
      dueAt: new Date(target.occurred_at),
    });
    if (result.created) admitted += 1;
  }
  const remaining = limit - pending.length;
  let markers = 0;
  if (remaining === 0) return { admitted, markers };
  const missing = await tx.execute<{ id: string; employee_id: string }>(sql`
    SELECT ss.id, ss.employee_id FROM shift_sessions ss
    WHERE ss.state IN ('SHIFT_CLOSED', 'EMERGENCY_EXIT')
    AND NOT EXISTS (SELECT 1 FROM bonus_shift_scores score WHERE score.shift_session_id = ss.id)
    AND NOT EXISTS (SELECT 1 ${sourceTargets()} WHERE s.id = ss.id)
    ORDER BY ss.created_at, ss.id LIMIT ${remaining}`);
  for (const session of missing) {
    const now = new Date();
    const [event] = await tx
      .insert(domainEvents)
      .values({
        type: 'BONUS_RECALCULATION_RECOVERED',
        source: 'SYSTEM',
        actingRole: 'SYSTEM',
        occurredAt: now,
        employeeId: session.employee_id,
        shiftSessionId: session.id,
        idempotencyKey: `bonus-recovery:${session.id}`,
        payload: { reason: 'TERMINAL_SCORE_MISSING_WITHOUT_SOURCE' },
      })
      .onConflictDoNothing({
        target: domainEvents.idempotencyKey,
        where: sql`${domainEvents.idempotencyKey} IS NOT NULL`,
      })
      .returning({ id: domainEvents.id, occurredAt: domainEvents.occurredAt });
    if (!event) continue;
    await tx
      .insert(auditLog)
      .values({
        actorType: 'SYSTEM',
        action: 'bonus.recover',
        objectType: 'shift_session',
        objectId: session.id,
        after: { sourceEventId: event.id },
        reason: 'Terminal score missing without a recoverable source',
        at: now,
      });
    const result = await enqueueBonusRecalculation(tx, {
      sourceEventId: event.id,
      targetSessionId: session.id,
      dueAt: event.occurredAt,
    });
    markers += 1;
    if (result.created) admitted += 1;
  }
  return { admitted, markers };
}
