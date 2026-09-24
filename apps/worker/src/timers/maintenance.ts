import {
  and,
  domainEvents,
  employeeLocale,
  employees,
  eq,
  gte,
  inArray,
  lte,
  notificationOutbox,
  requests,
  sql,
  telegramAccounts,
  workOrders,
  loadWorkNotice,
  type Transaction,
  type WorkNoticeContext,
} from '@vakhta/db';
import type {
  EmergencyAckJob,
  EmergencyEscalationJob,
  MaintenanceReminderJob,
} from '@vakhta/contracts';
import {
  PERIOD_TYPES,
  WorkStatus,
  WorkType,
  isOpenWork,
  type NotificationPayload,
  type NotificationTemplate,
  MaintenanceTemplate,
} from '@vakhta/domain';
import {
  EmergencyNoticeKind,
  MaintenanceNoticeKind,
  emergencyNotice,
  maintenanceNotice,
  messages,
  type Messages,
} from '@vakhta/i18n';
import { timerNow } from './time.js';
import type { ReminderOutcome } from './reminders.js';

/**
 * Maintenance timers (spec 014). Each handler re-reads the work order when it fires: closed,
 * re-planned, reassigned or accepted work silences it (FR-042). Messages go to the outbox on the
 * task's own transaction, rendered in the recipient's language.
 */

type WorkOrderRow = typeof workOrders.$inferSelect;

interface Notice {
  readonly recipientId: string;
  readonly template: NotificationTemplate;
  readonly payload: (t: Messages) => NotificationPayload;
  readonly dedupeKey: string;
}

async function enqueue(tx: Transaction, notice: Notice): Promise<boolean> {
  const locale = await employeeLocale(tx, notice.recipientId);
  const rows = await tx
    .insert(notificationOutbox)
    .values({
      recipientType: 'EMPLOYEE',
      recipientId: notice.recipientId,
      template: notice.template,
      payload: notice.payload(messages(locale)),
      dedupeKey: notice.dedupeKey,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey })
    .returning({ id: notificationOutbox.id });
  return rows.length > 0;
}

async function lockOrder(tx: Transaction, id: string): Promise<WorkOrderRow | null> {
  const [order] = await tx
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, id))
    .for('no key update');
  return order ?? null;
}

/** Employees among the given ones who can be reached on the date: linked and not on leave. */
async function reachableOn(
  tx: Transaction,
  input: { readonly ids: readonly string[]; readonly date: string },
): Promise<Set<string>> {
  if (!input.ids.length) return new Set();
  const [linked, away] = await Promise.all([
    tx
      .select({ id: telegramAccounts.employeeId })
      .from(telegramAccounts)
      .where(
        and(
          inArray(telegramAccounts.employeeId, [...input.ids]),
          eq(telegramAccounts.status, 'ACTIVE'),
        ),
      ),
    tx
      .select({ id: requests.employeeId })
      .from(requests)
      .where(
        and(
          inArray(requests.employeeId, [...input.ids]),
          inArray(requests.type, [...PERIOD_TYPES]),
          eq(requests.status, 'APPROVED'),
          lte(requests.periodFrom, input.date),
          gte(requests.periodTo, input.date),
        ),
      ),
  ]);
  const absent = new Set(away.map((row) => row.id));
  return new Set(linked.map((row) => row.id).filter((id) => !absent.has(id)));
}

async function fullName(tx: Transaction, id: string): Promise<string> {
  const [row] = await tx
    .select({ fullName: employees.fullName })
    .from(employees)
    .where(eq(employees.id, id));
  return row?.fullName ?? '';
}

/**
 * Who gets a planned-maintenance reminder: the assigned mechanic, or, when they are on leave or
 * have no Telegram, the backup mechanic and otherwise the unit master with a note (FR-043, FR-045).
 */
async function reminderRecipient(
  tx: Transaction,
  notice: WorkNoticeContext & { readonly plannedOn: string },
): Promise<{ id: string; absentMechanic: string | null } | null> {
  const candidates = [notice.assigneeId, notice.backupId, notice.masterId].filter(
    (id): id is string => id !== null,
  );
  const reachable = await reachableOn(tx, { ids: candidates, date: notice.plannedOn });
  if (reachable.has(notice.assigneeId)) return { id: notice.assigneeId, absentMechanic: null };
  const substitute = candidates.slice(1).find((id) => reachable.has(id));
  if (!substitute) return null;
  return { id: substitute, absentMechanic: await fullName(tx, notice.assigneeId) };
}

/** A 7/3/1-day reminder of planned maintenance (FR-040 – FR-044). */
export async function handleMaintenanceReminderWithin(
  tx: Transaction,
  data: MaintenanceReminderJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  const order = await lockOrder(tx, data.workOrderId);
  if (order?.status !== WorkStatus.ASSIGNED) return 'stale';
  const now = await timerNow(tx, testTime);
  if (new Date(data.fireAt) > now || order.plannedOn !== data.plannedOn) return 'stale';
  const notice = await loadWorkNotice(tx, order.id);
  if (!notice?.plannedOn) return 'stale';
  const recipient = await reminderRecipient(tx, { ...notice, plannedOn: notice.plannedOn });
  if (!recipient) return 'stale';
  const queued = await enqueue(tx, {
    recipientId: recipient.id,
    template: MaintenanceTemplate.MAINTENANCE_REMINDER,
    payload: (t) =>
      maintenanceNotice(t, notice.data, {
        kind: MaintenanceNoticeKind.REMINDER,
        offsetDays: data.offsetDays,
        absentMechanic: recipient.absentMechanic,
      }),
    dedupeKey: `maintenance-reminder:${order.id}:${data.plannedOn}:${data.offsetDays}:${recipient.id}`,
  });
  return queued ? 'queued' : 'duplicate';
}

/** An unaccepted emergency repair whose deadline this timer still guards. */
async function unacceptedRepair(
  tx: Transaction,
  input: {
    readonly workOrderId: string;
    readonly fireAt: string;
    readonly testTime: Date | undefined;
  },
): Promise<{ order: WorkOrderRow; now: Date } | null> {
  const order = await lockOrder(tx, input.workOrderId);
  if (order?.type !== WorkType.EMERGENCY_REPAIR) return null;
  if (order.acceptedAt || !isOpenWork(order.status)) return null;
  const now = await timerNow(tx, input.testTime);
  if (new Date(input.fireAt) > now) return null;
  return { order, now };
}

/** Records the escalation once; a retried task finds the event and sends nothing new. */
async function recordEscalation(
  tx: Transaction,
  input: { readonly order: WorkOrderRow; readonly now: Date; readonly type: string },
): Promise<boolean> {
  const rows = await tx
    .insert(domainEvents)
    .values({
      type: input.type,
      occurredAt: input.now,
      source: 'SYSTEM',
      actingRole: 'SYSTEM',
      incidentId: input.order.incidentId,
      idempotencyKey: `${input.type}:${input.order.id}`,
      payload: {
        workOrderId: input.order.id,
        equipmentId: input.order.equipmentId,
        priority: input.order.priority,
        assigneeEmployeeId: input.order.assigneeEmployeeId,
      },
    })
    .onConflictDoNothing({
      target: domainEvents.idempotencyKey,
      where: sql`${domainEvents.idempotencyKey} IS NOT NULL`,
    })
    .returning({ id: domainEvents.id });
  return rows.length > 0;
}

/**
 * Nobody accepted the repair in time: the backup mechanic gets it with accept buttons, the master a
 * copy, and the order is marked escalated (FR-063, AC-043).
 */
export async function handleEmergencyAckWithin(
  tx: Transaction,
  data: EmergencyAckJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  const repair = await unacceptedRepair(tx, { ...data, testTime });
  if (repair?.order.ackDueAt?.toISOString() !== data.fireAt) return 'stale';
  const { order, now } = repair;
  const recorded = await recordEscalation(tx, { order, now, type: 'WORK_ORDER_ACK_ESCALATED' });
  if (!recorded) return 'duplicate';
  await tx
    .update(workOrders)
    .set({ escalatedAt: order.escalatedAt ?? now, updatedAt: now })
    .where(eq(workOrders.id, order.id));
  const notice = await loadWorkNotice(tx, order.id);
  if (!notice) return 'queued';
  const backup = notice.backupId === order.assigneeEmployeeId ? null : notice.backupId;
  if (backup)
    await enqueue(tx, {
      recipientId: backup,
      template: MaintenanceTemplate.EMERGENCY_ESCALATION,
      payload: (t) => emergencyNotice(t, notice.data, EmergencyNoticeKind.ESCALATION),
      dedupeKey: `emergency-escalation:${order.id}:ack:${backup}`,
    });
  if (notice.masterId)
    await enqueue(tx, {
      recipientId: notice.masterId,
      template: MaintenanceTemplate.EMERGENCY_ESCALATION,
      payload: (t) => emergencyNotice(t, notice.data, EmergencyNoticeKind.MASTER_COPY),
      dedupeKey: `emergency-escalation:${order.id}:ack:${notice.masterId}`,
    });
  return 'queued';
}

/**
 * Still unaccepted after the escalation gap: the panel shows the repair as escalated and the master
 * is told again (FR-063).
 */
export async function handleEmergencyEscalationWithin(
  tx: Transaction,
  data: EmergencyEscalationJob,
  testTime?: Date,
): Promise<ReminderOutcome> {
  const repair = await unacceptedRepair(tx, { ...data, testTime });
  if (!repair) return 'stale';
  const { order, now } = repair;
  const recorded = await recordEscalation(tx, { order, now, type: 'WORK_ORDER_ESCALATED' });
  if (!recorded) return 'duplicate';
  await tx
    .update(workOrders)
    .set({ escalatedAt: order.escalatedAt ?? now, updatedAt: now })
    .where(eq(workOrders.id, order.id));
  const notice = await loadWorkNotice(tx, order.id);
  if (!notice?.masterId) return 'queued';
  await enqueue(tx, {
    recipientId: notice.masterId,
    template: MaintenanceTemplate.EMERGENCY_ESCALATION,
    payload: (t) => emergencyNotice(t, notice.data, EmergencyNoticeKind.MASTER_COPY),
    dedupeKey: `emergency-escalation:${order.id}:late:${notice.masterId}`,
  });
  return 'queued';
}
