import { timerNow } from './time.js';
import {
  domainEvents,
  downtimeIncidents,
  eq,
  sql,
  type Database,
  type Transaction,
} from '@vakhta/db';
import { OPEN_INCIDENT_STATUSES } from '@vakhta/domain';
import type { IncidentSlaJob } from '@vakhta/contracts';
import type { ReminderOutcome } from './reminders.js';

export function handleIncidentSla(
  db: Database,
  data: IncidentSlaJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  return db.transaction((tx) => handleIncidentSlaWithin(tx, data, testTime));
}

/** The event and projection commit together; old event-only failures retain their original time. */
export async function handleIncidentSlaWithin(
  tx: Transaction,
  data: IncidentSlaJob,
  testTime: Date | undefined,
): Promise<ReminderOutcome> {
  const [incident] = await tx
    .select()
    .from(downtimeIncidents)
    .where(eq(downtimeIncidents.id, data.incidentId))
    .for('no key update');
  if (!incident) return 'stale';
  const now = await timerNow(tx, testTime);
  const [previous] = await tx
    .select({ occurredAt: domainEvents.occurredAt, type: domainEvents.type })
    .from(domainEvents)
    .where(eq(domainEvents.idempotencyKey, `incident-sla:${incident.id}`));
  if (previous && previous.type !== 'INCIDENT_SLA_BREACHED')
    throw new Error('Timer event identity mismatch');
  if (previous) {
    if (!incident.escalatedAt)
      await tx
        .update(downtimeIncidents)
        .set({ escalatedAt: previous.occurredAt })
        .where(eq(downtimeIncidents.id, incident.id));
    return 'duplicate';
  }
  if (
    !OPEN_INCIDENT_STATUSES.some((status) => status === incident.status) ||
    incident.acknowledgedAt ||
    incident.slaDueAt > now ||
    incident.slaDueAt.toISOString() !== data.fireAt
  )
    return 'stale';
  await tx
    .insert(domainEvents)
    .values({
      type: 'INCIDENT_SLA_BREACHED',
      occurredAt: now,
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      incidentId: incident.id,
      zoneId: incident.zoneId,
      reasonCode: incident.reasonCode,
      idempotencyKey: `incident-sla:${incident.id}`,
      payload: {
        slaDueAt: incident.slaDueAt.toISOString(),
        severity: incident.severity,
        overdueMinutes: Math.round((now.getTime() - incident.slaDueAt.getTime()) / 60_000),
      },
    })
    .onConflictDoNothing({
      target: domainEvents.idempotencyKey,
      where: sql`${domainEvents.idempotencyKey} IS NOT NULL`,
    });
  await tx
    .update(downtimeIncidents)
    .set({ escalatedAt: incident.escalatedAt ?? now, updatedAt: now })
    .where(eq(downtimeIncidents.id, incident.id));
  return 'queued';
}
