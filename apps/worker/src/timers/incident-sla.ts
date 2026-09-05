import {
  and,
  domainEvents,
  downtimeIncidents,
  eq,
  inArray,
  isNull,
  sql,
  type Database,
} from '@vakhta/db';
import { OPEN_INCIDENT_STATUSES } from '@vakhta/domain';
import type { IncidentSlaJob } from '@vakhta/contracts';
import type { ReminderOutcome } from './reminders.js';

/**
 * SLA інциденту (FR-DWN-03): якщо майстер не відреагував до строку, інцидент позначається
 * ескальованим і в журнал пише INCIDENT_SLA_BREACHED. Закриті або підтверджені інциденти пропускаються.
 */
export async function handleIncidentSla(
  db: Database,
  data: IncidentSlaJob,
  now: Date = new Date(),
): Promise<ReminderOutcome> {
  const [incident] = await db
    .select()
    .from(downtimeIncidents)
    .where(
      and(
        eq(downtimeIncidents.id, data.incidentId),
        inArray(downtimeIncidents.status, [...OPEN_INCIDENT_STATUSES]),
        isNull(downtimeIncidents.acknowledgedAt),
      ),
    )
    .limit(1);
  if (!incident || incident.slaDueAt.getTime() > now.getTime()) return 'stale';

  const inserted = await db
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
    })
    .returning({ id: domainEvents.id });
  if (inserted.length === 0) return 'duplicate';

  await db
    .update(downtimeIncidents)
    .set({ escalatedAt: incident.escalatedAt ?? now, updatedAt: now })
    .where(eq(downtimeIncidents.id, incident.id));
  return 'queued';
}
