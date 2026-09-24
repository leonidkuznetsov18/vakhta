import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  downtimeIncidents,
  downtimeReports,
  eq,
  equipment,
  equipmentStopEpisodes,
  isNull,
  loadWorkNotice,
  notInArray,
  workOrders,
  type Database,
  type Transaction,
} from '@vakhta/db';
import type { EmergencyCreateCommand, ReleaseCommand } from '@vakhta/contracts';
import {
  EquipmentState,
  FINAL_WORK_STATUSES,
  ReleaseMode,
  StopStartQuality,
  WorkPriority,
  WorkStatus,
  WorkType,
  emergencyDeadlines,
  emergencyPriority,
  type IncidentSeverity,
  MaintenanceTemplate,
} from '@vakhta/domain';
import { EmergencyNoticeKind, emergencyNotice, format } from '@vakhta/i18n';
import { employeeActor, type Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { EventStore, type EventSource } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { TIMER_SCHEDULER, type TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { maintenanceStaff } from './lookups.js';
import { MAINTENANCE_OPTIONS, type MaintenanceOptions } from './maintenance-options.js';
import { WorkActionsService } from './work-actions.service.js';

const FINAL = [...FINAL_WORK_STATUSES];
const TITLE_LENGTH = 120;

export interface OpenEmergencyInput {
  readonly equipmentId: string;
  readonly incidentId: string | null;
  readonly description: string;
  readonly stoppedWork: boolean;
  readonly severity: IncidentSeverity;
  /** Employee or panel user who reported it. */
  readonly reportedBy: string;
  readonly actor: Actor;
  readonly source: EventSource;
  readonly now: Date;
}

/** Emergency repair of a machine (spec 014, US7): routing, acknowledgement, stop and release. */
@Injectable()
export class EmergencyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly notifications: NotificationsService,
    private readonly actions: WorkActionsService,
    @Inject(TIMER_SCHEDULER) private readonly timers: TimerScheduler,
    @Inject(MAINTENANCE_OPTIONS) private readonly options: MaintenanceOptions,
  ) {}

  /** Whether reports may name machines and open repairs: the tenant module is on (FR-001). */
  available(): boolean {
    return this.options.enabled;
  }

  /**
   * Opens or joins the machine's emergency repair and stop episode in the caller's transaction
   * (FR-061). A second report on a stopped machine attaches instead of opening another (AC-047).
   */
  async openWithin(
    tx: Transaction,
    input: OpenEmergencyInput,
  ): Promise<{ workOrderId: string; created: boolean }> {
    const [machine] = await tx
      .select()
      .from(equipment)
      .where(eq(equipment.id, input.equipmentId))
      .for('update');
    if (!machine || machine.archivedAt)
      throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
    const [existing] = await tx
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.equipmentId, machine.id),
          eq(workOrders.type, WorkType.EMERGENCY_REPAIR),
          notInArray(workOrders.status, FINAL),
        ),
      );
    const workOrderId =
      existing?.id ??
      (await this.insertRepair(tx, { input, assigneeId: machine.responsibleEmployeeId }));
    if (input.stoppedWork) await this.stopWithin(tx, { input, workOrderId });
    if (!existing) await this.announceWithin(tx, { workOrderId, input });
    return { workOrderId, created: !existing };
  }

  private async insertRepair(
    tx: Transaction,
    context: { input: OpenEmergencyInput; assigneeId: string },
  ): Promise<string> {
    const { input } = context;
    const priority = emergencyPriority(input.severity, input.stoppedWork);
    const deadlines = emergencyDeadlines(input.now, priority, this.options.emergency);
    const [row] = await tx
      .insert(workOrders)
      .values({
        type: WorkType.EMERGENCY_REPAIR,
        priority,
        equipmentId: input.equipmentId,
        incidentId: input.incidentId,
        title: input.description.slice(0, TITLE_LENGTH),
        description: input.description,
        status: WorkStatus.ASSIGNED,
        assigneeEmployeeId: context.assigneeId,
        reportedAt: input.now,
        reportedBy: input.reportedBy,
        ackDueAt: deadlines.ackDueAt,
        escalatedAt: deadlines.escalateImmediately ? input.now : null,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: workOrders.id });
    if (!row) throw new Error('work_orders: insert returned no row');
    await this.timers.scheduleEmergencyAck(tx, row.id, deadlines.ackDueAt);
    await this.timers.scheduleEmergencyEscalation(tx, row.id, deadlines.escalateAt);
    await this.events.append(tx, {
      type: 'WORK_ORDER_CREATED',
      source: input.source,
      actor: input.actor,
      occurredAt: input.now,
      incidentId: input.incidentId,
      comment: input.description,
      payload: {
        workOrderId: row.id,
        equipmentId: input.equipmentId,
        priority,
        stoppedWork: input.stoppedWork,
      },
    });
    return row.id;
  }

  /** One open stop per machine: the partial unique index keeps a concurrent report out (R02). */
  private async stopWithin(
    tx: Transaction,
    context: { input: OpenEmergencyInput; workOrderId: string },
  ) {
    const { input } = context;
    const opened = await tx
      .insert(equipmentStopEpisodes)
      .values({
        equipmentId: input.equipmentId,
        incidentId: input.incidentId,
        workOrderId: context.workOrderId,
        startedAt: input.now,
        startQuality: StopStartQuality.FROM_REPORT,
      })
      .onConflictDoNothing()
      .returning({ id: equipmentStopEpisodes.id });
    if (!opened.length) return;
    await tx
      .update(equipment)
      .set({
        state: EquipmentState.STOPPED,
        stateChangedAt: input.now,
        restriction: null,
        updatedAt: input.now,
      })
      .where(eq(equipment.id, input.equipmentId));
    await this.events.append(tx, {
      type: 'EQUIPMENT_STOPPED',
      source: input.source,
      actor: input.actor,
      occurredAt: input.now,
      incidentId: input.incidentId,
      payload: { equipmentId: input.equipmentId, workOrderId: context.workOrderId },
    });
  }

  private async announceWithin(
    tx: Transaction,
    context: { workOrderId: string; input: OpenEmergencyInput },
  ) {
    const notice = await loadWorkNotice(tx, context.workOrderId);
    if (!notice) return;
    const id = context.workOrderId;
    await this.notifications.enqueue(tx, {
      recipientType: 'EMPLOYEE',
      recipientId: notice.assigneeId,
      template: MaintenanceTemplate.EMERGENCY_ASSIGNED,
      payload: (t) => emergencyNotice(t, notice.data, EmergencyNoticeKind.ASSIGNED),
      dedupeKey: `emergency-assigned:${id}:${notice.assigneeId}`,
    });
    if (notice.masterId && notice.masterId !== notice.assigneeId)
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: notice.masterId,
        template: MaintenanceTemplate.EMERGENCY_ASSIGNED,
        payload: (t) => emergencyNotice(t, notice.data, EmergencyNoticeKind.MASTER_COPY),
        dedupeKey: `emergency-copy:${id}:${notice.masterId}`,
      });
    if (notice.backupId && notice.data.priority === WorkPriority.P0)
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: notice.backupId,
        template: MaintenanceTemplate.EMERGENCY_ESCALATION,
        payload: (t) => emergencyNotice(t, notice.data, EmergencyNoticeKind.ESCALATION),
        dedupeKey: `emergency-escalation:${id}:immediate:${notice.backupId}`,
      });
  }

  /** A panel user registers a breakdown reported by phone or seen on the floor (AC-049). */
  async createFromPanel(
    equipmentId: string,
    cmd: EmergencyCreateCommand,
    context: { actor: Actor; now: Date },
  ) {
    const severity: IncidentSeverity = cmd.safety ? 'SAFETY' : 'CRITICAL';
    return this.db.transaction((tx) =>
      this.openWithin(tx, {
        equipmentId,
        incidentId: null,
        description: cmd.description,
        stoppedWork: cmd.stoppedWork,
        severity,
        reportedBy: context.actor.id ?? 'system',
        actor: context.actor,
        source: 'WEB',
        now: context.now,
      }),
    );
  }

  /** The first maintenance employee to accept becomes the lead; later presses see who did (AC-042). */
  async accept(employeeId: string, workOrderId: string, now: Date = new Date()) {
    return this.db.transaction(async (tx) => {
      const order = await this.actions.lock(tx, workOrderId);
      if (order.type !== WorkType.EMERGENCY_REPAIR || FINAL.includes(order.status))
        throw new DomainError('WORK_TRANSITION_NOT_ALLOWED', 409, 'Repair is closed');
      if (order.acceptedAt && order.leadEmployeeId !== employeeId)
        throw new DomainError('WORK_ALREADY_ACCEPTED', 409, 'Another mechanic accepted the repair');
      if (!(await maintenanceStaff(tx, [employeeId])).length)
        throw new DomainError('MECHANIC_NOT_ELIGIBLE', 403, 'Employee does not maintain equipment');
      if (order.acceptedAt) return { number: order.number };
      await tx
        .update(workOrders)
        .set({
          acceptedAt: now,
          leadEmployeeId: employeeId,
          assigneeEmployeeId: employeeId,
          version: order.version + 1,
          updatedAt: now,
        })
        .where(eq(workOrders.id, order.id));
      await this.events.append(tx, {
        type: 'WORK_ORDER_ACCEPTED',
        source: 'TELEGRAM',
        actor: employeeActor(employeeId),
        occurredAt: now,
        incidentId: order.incidentId,
        payload: { workOrderId: order.id, equipmentId: order.equipmentId },
      });
      return { number: order.number };
    });
  }

  /** "Can't" passes the repair to the backup; the deadline is not reset (AC-044, R07). */
  async decline(
    employeeId: string,
    input: { workOrderId: string; reason: string },
    now: Date = new Date(),
  ) {
    return this.db.transaction(async (tx) => {
      const order = await this.actions.lock(tx, input.workOrderId);
      this.actions.assertMine(order, employeeId);
      if (order.acceptedAt || FINAL.includes(order.status))
        throw new DomainError(
          'WORK_TRANSITION_NOT_ALLOWED',
          409,
          'Repair already accepted or closed',
        );
      const notice = await loadWorkNotice(tx, order.id);
      const next = notice?.backupId && notice.backupId !== employeeId ? notice.backupId : null;
      if (next)
        await tx
          .update(workOrders)
          .set({ assigneeEmployeeId: next, version: order.version + 1, updatedAt: now })
          .where(eq(workOrders.id, order.id));
      await this.events.append(tx, {
        type: 'WORK_ORDER_DECLINED',
        source: 'TELEGRAM',
        actor: employeeActor(employeeId),
        occurredAt: now,
        incidentId: order.incidentId,
        comment: input.reason,
        payload: { workOrderId: order.id, equipmentId: order.equipmentId, passedTo: next },
      });
      if (notice)
        await this.notifyDeclined(tx, { order, notice, employeeId, reason: input.reason, next });
      return { passedTo: next };
    });
  }

  private async notifyDeclined(
    tx: Transaction,
    input: {
      order: typeof workOrders.$inferSelect;
      notice: NonNullable<Awaited<ReturnType<typeof loadWorkNotice>>>;
      employeeId: string;
      reason: string;
      next: string | null;
    },
  ) {
    const name = (await this.employeeName(tx, input.employeeId)) ?? '';
    if (input.notice.masterId)
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: input.notice.masterId,
        template: MaintenanceTemplate.EMERGENCY_DECLINED,
        payload: (t) => ({
          text: format(t.maintenance.bot.declinedToMaster, {
            name,
            number: input.order.number,
            reason: input.reason,
          }),
        }),
        dedupeKey: `emergency-declined:${input.order.id}:${input.employeeId}`,
      });
    if (input.next)
      await this.notifications.enqueue(tx, {
        recipientType: 'EMPLOYEE',
        recipientId: input.next,
        template: MaintenanceTemplate.EMERGENCY_ASSIGNED,
        payload: (t) => emergencyNotice(t, input.notice.data, EmergencyNoticeKind.ASSIGNED),
        dedupeKey: `emergency-assigned:${input.order.id}:${input.next}`,
      });
  }

  private async employeeName(tx: Transaction, id: string): Promise<string | null> {
    const rows = await maintenanceStaff(tx, [id]);
    return rows[0]?.fullName ?? null;
  }

  /**
   * Returns a stopped machine to service; the repair must be finished first (FR-065, AC-046).
   * The reporter learns the machine runs again; the incident gets the mechanic's diagnosis.
   */
  async release(equipmentId: string, cmd: ReleaseCommand, context: { actor: Actor; now: Date }) {
    return this.db.transaction(async (tx) => {
      const [machine] = await tx
        .select()
        .from(equipment)
        .where(eq(equipment.id, equipmentId))
        .for('update');
      if (!machine) throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
      await this.assertRepairFinished(tx, equipmentId);
      const [episode] = await tx
        .select()
        .from(equipmentStopEpisodes)
        .where(
          and(
            eq(equipmentStopEpisodes.equipmentId, equipmentId),
            isNull(equipmentStopEpisodes.releasedAt),
          ),
        );
      if (!episode && machine.state === EquipmentState.AVAILABLE)
        throw new DomainError('NOT_STOPPED', 409, 'The machine is not stopped');
      const condition = cmd.mode === ReleaseMode.RESTRICTED ? (cmd.condition ?? null) : null;
      const releasedBy = context.actor.id ?? 'system';
      await tx
        .update(equipment)
        .set({
          state: cmd.mode,
          restriction: condition,
          stateChangedAt: context.now,
          version: machine.version + 1,
          updatedAt: context.now,
        })
        .where(eq(equipment.id, equipmentId));
      if (!episode) {
        await this.appendReleased(tx, {
          equipmentId,
          mode: cmd.mode,
          condition,
          context,
          episode: null,
        });
        return { id: equipmentId };
      }
      await tx
        .update(equipmentStopEpisodes)
        .set({
          releasedAt: context.now,
          releaseMode: cmd.mode,
          releaseCondition: condition,
          releasedBy,
        })
        .where(eq(equipmentStopEpisodes.id, episode.id));
      await this.appendReleased(tx, { equipmentId, mode: cmd.mode, condition, context, episode });
      await this.afterRelease(tx, { episode, machine, mode: cmd.mode, condition });
      return { id: equipmentId };
    });
  }

  private async assertRepairFinished(tx: Transaction, equipmentId: string) {
    const [open] = await tx
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.equipmentId, equipmentId),
          eq(workOrders.type, WorkType.EMERGENCY_REPAIR),
          notInArray(workOrders.status, FINAL),
        ),
      );
    if (open) throw new DomainError('RELEASE_NOT_READY', 409, 'The repair is not finished');
  }

  private async appendReleased(
    tx: Transaction,
    input: {
      equipmentId: string;
      mode: ReleaseMode;
      condition: string | null;
      context: { actor: Actor; now: Date };
      episode: Pick<typeof equipmentStopEpisodes.$inferSelect, 'incidentId' | 'workOrderId'> | null;
    },
  ) {
    await this.events.append(tx, {
      type: 'EQUIPMENT_RELEASED',
      source: 'WEB',
      actor: input.context.actor,
      occurredAt: input.context.now,
      incidentId: input.episode?.incidentId ?? null,
      comment: input.condition,
      payload: {
        equipmentId: input.equipmentId,
        mode: input.mode,
        workOrderId: input.episode?.workOrderId ?? null,
      },
    });
  }

  private async afterRelease(
    tx: Transaction,
    input: {
      episode: typeof equipmentStopEpisodes.$inferSelect;
      machine: typeof equipment.$inferSelect;
      mode: ReleaseMode;
      condition: string | null;
    },
  ) {
    const [repair] = input.episode.workOrderId
      ? await tx.select().from(workOrders).where(eq(workOrders.id, input.episode.workOrderId))
      : [];
    if (input.episode.incidentId && repair)
      await tx
        .update(downtimeIncidents)
        .set({ equipmentId: input.machine.id })
        .where(eq(downtimeIncidents.id, input.episode.incidentId));
    if (input.episode.incidentId && repair?.summary)
      await this.prefillIncident(tx, { incidentId: input.episode.incidentId, repair });
    const reporter = input.episode.incidentId
      ? await this.reporterOf(tx, input.episode.incidentId)
      : null;
    if (!reporter) return;
    await this.notifications.enqueue(tx, {
      recipientType: 'EMPLOYEE',
      recipientId: reporter,
      template: MaintenanceTemplate.EQUIPMENT_RELEASED,
      payload: (t) => {
        const machine = format(t.maintenance.bot.machine, {
          code: input.machine.code,
          name: input.machine.name,
        });
        const text =
          input.mode === ReleaseMode.RESTRICTED
            ? format(t.maintenance.bot.restricted, { machine, condition: input.condition ?? '' })
            : format(t.maintenance.bot.released, { machine });
        return { text };
      },
      dedupeKey: `equipment-released:${input.episode.id}:${reporter}`,
    });
  }

  /** The master still resolves the incident; its cause and solution start from the mechanic's words. */
  private async prefillIncident(
    tx: Transaction,
    input: { incidentId: string; repair: typeof workOrders.$inferSelect },
  ) {
    const [incident] = await tx
      .select({ rootCause: downtimeIncidents.rootCause, resolution: downtimeIncidents.resolution })
      .from(downtimeIncidents)
      .where(eq(downtimeIncidents.id, input.incidentId));
    if (!incident) return;
    await tx
      .update(downtimeIncidents)
      .set({
        rootCause: incident.rootCause ?? input.repair.cause,
        resolution: incident.resolution ?? input.repair.summary,
      })
      .where(eq(downtimeIncidents.id, input.incidentId));
  }

  private async reporterOf(tx: Transaction, incidentId: string): Promise<string | null> {
    const [report] = await tx
      .select({ employeeId: downtimeReports.employeeId })
      .from(downtimeReports)
      .where(eq(downtimeReports.incidentId, incidentId))
      .orderBy(asc(downtimeReports.reportedAt))
      .limit(1);
    return report?.employeeId ?? null;
  }

  /** The latest repair of a machine, for the release dialog. */
  async latestRepair(equipmentId: string) {
    const [row] = await this.db
      .select({ id: workOrders.id, status: workOrders.status })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.equipmentId, equipmentId),
          eq(workOrders.type, WorkType.EMERGENCY_REPAIR),
        ),
      )
      .orderBy(desc(workOrders.createdAt))
      .limit(1);
    return row ?? null;
  }
}
