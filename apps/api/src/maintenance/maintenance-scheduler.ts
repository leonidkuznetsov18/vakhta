import { Inject, Injectable } from '@nestjs/common';
import { loadWorkNotice, workOrders, type Transaction } from '@vakhta/db';
import {
  DEFAULT_MAINTENANCE_REMINDER_OFFSETS,
  DEFAULT_MAINTENANCE_REMINDER_TIME,
  WorkPriority,
  WorkStatus,
  WorkType,
  reminderPlan,
} from '@vakhta/domain';
import { MaintenanceNoticeKind, maintenanceNotice } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { EventStore, type EventSource } from '../events/event-store.js';
import { TIMER_SCHEDULER, type TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export interface PlannedCycle {
  readonly planId: string;
  readonly versionId: string;
  readonly equipmentId: string;
  readonly title: string;
  readonly assigneeId: string;
  readonly dueOn: string;
}

export interface SchedulingContext {
  readonly actor: Actor;
  readonly source: EventSource;
  readonly now: Date;
}

/**
 * Creates one work order per plan cycle and plans its reminders (FR-024, FR-040). A repeated call
 * for the same cycle returns the existing order and schedules nothing twice.
 */
@Injectable()
export class MaintenanceScheduler {
  constructor(
    private readonly events: EventStore,
    private readonly notifications: NotificationsService,
    @Inject(TIMER_SCHEDULER) private readonly timers: TimerScheduler,
  ) {}

  async createCycleWithin(
    tx: Transaction,
    cycle: PlannedCycle,
    context: SchedulingContext,
  ): Promise<string | null> {
    const [created] = await tx
      .insert(workOrders)
      .values({
        type: WorkType.PLANNED_MAINTENANCE,
        priority: WorkPriority.P3,
        equipmentId: cycle.equipmentId,
        planId: cycle.planId,
        planVersionId: cycle.versionId,
        cycleKey: cycle.dueOn,
        title: cycle.title,
        status: WorkStatus.ASSIGNED,
        dueOn: cycle.dueOn,
        plannedOn: cycle.dueOn,
        assigneeEmployeeId: cycle.assigneeId,
        createdAt: context.now,
        updatedAt: context.now,
      })
      .onConflictDoNothing()
      .returning({ id: workOrders.id });
    if (!created) return null;
    await this.events.append(tx, {
      type: 'WORK_ORDER_CREATED',
      source: context.source,
      actor: context.actor,
      occurredAt: context.now,
      payload: {
        workOrderId: created.id,
        equipmentId: cycle.equipmentId,
        planId: cycle.planId,
        dueOn: cycle.dueOn,
      },
    });
    await this.planRemindersWithin(tx, {
      workOrderId: created.id,
      now: context.now,
      noticeNow: true,
    });
    return created.id;
  }

  /**
   * Schedules the 7/3/1-day reminders for the current planned date; a date already close gets one
   * notice now instead of late reminders (FR-041). Keys carry the date, so a re-plan gets new ones.
   */
  async planRemindersWithin(
    tx: Transaction,
    input: { readonly workOrderId: string; readonly now: Date; readonly noticeNow: boolean },
  ): Promise<void> {
    const { workOrderId, now } = input;
    const notice = await loadWorkNotice(tx, workOrderId);
    if (!notice?.plannedOn) return;
    const plan = reminderPlan({
      plannedOn: notice.plannedOn,
      offsets: DEFAULT_MAINTENANCE_REMINDER_OFFSETS,
      localTime: DEFAULT_MAINTENANCE_REMINDER_TIME,
      timezone: notice.timezone,
      now,
    });
    await Promise.all(
      plan.fires.map((fire) =>
        this.timers.scheduleMaintenanceReminder(
          tx,
          { workOrderId, plannedOn: notice.plannedOn ?? '', offsetDays: fire.offsetDays },
          fire.fireAt,
        ),
      ),
    );
    if (!plan.notifyNow || !input.noticeNow) return;
    await this.notifications.enqueue(tx, {
      recipientType: 'EMPLOYEE',
      recipientId: notice.assigneeId,
      template: 'MAINTENANCE_ASSIGNED',
      payload: (t) => maintenanceNotice(t, notice.data, { kind: MaintenanceNoticeKind.ASSIGNED }),
      dedupeKey: `maintenance-assigned:${workOrderId}:${notice.plannedOn}:${notice.assigneeId}`,
    });
  }

  /** One "new maintenance" notice to a newly assigned mechanic (AC-006). */
  async notifyAssignedWithin(tx: Transaction, workOrderId: string): Promise<void> {
    const notice = await loadWorkNotice(tx, workOrderId);
    if (!notice?.plannedOn) return;
    await this.notifications.enqueue(tx, {
      recipientType: 'EMPLOYEE',
      recipientId: notice.assigneeId,
      template: 'MAINTENANCE_ASSIGNED',
      payload: (t) => maintenanceNotice(t, notice.data, { kind: MaintenanceNoticeKind.ASSIGNED }),
      dedupeKey: `maintenance-assigned:${workOrderId}:${notice.plannedOn}:${notice.assigneeId}`,
    });
  }

  /** One "date changed" notice to the mechanic after a re-plan (FR-034). */
  async notifyReplannedWithin(tx: Transaction, workOrderId: string): Promise<void> {
    const notice = await loadWorkNotice(tx, workOrderId);
    if (!notice?.plannedOn) return;
    await this.notifications.enqueue(tx, {
      recipientType: 'EMPLOYEE',
      recipientId: notice.assigneeId,
      template: 'MAINTENANCE_REPLANNED',
      payload: (t) => maintenanceNotice(t, notice.data, { kind: MaintenanceNoticeKind.REPLANNED }),
      dedupeKey: `maintenance-replanned:${workOrderId}:${notice.plannedOn}:${notice.assigneeId}`,
    });
  }
}
