import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  employees,
  eq,
  inArray,
  openSlots,
  orgUnits,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  slotInterests,
  slotOffers,
  telegramAccounts,
  type Database,
  type DbOrTx,
  type Transaction,
} from '@vakhta/db';
import type {
  CreateOpenSlotCommand,
  OfferSlotCommand,
  OpenSlotView,
  OpenSlotsQuery,
  ScheduleVersionDetail,
  SelectSlotCommand,
  SlotInterestResponse,
  SlotOfferView,
} from '@vakhta/contracts';
import { addMonths, type RoleGrant } from '@vakhta/domain';
import { format, type Messages } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ScheduleService } from './schedule.service.js';

type SlotRow = typeof openSlots.$inferSelect;
type OfferRow = typeof slotOffers.$inferSelect;
type InterestRow = typeof slotInterests.$inferSelect;

export type SlotResponseResult =
  | { readonly kind: 'RECORDED'; readonly response: SlotInterestResponse }
  | { readonly kind: 'CLOSED' };

/**
 * Open slots (SC-15, SC-16, D-06). A slot is an internal planning statement: it is not a person,
 * not satisfied demand and not visible to employees until deliberately offered. Interest never
 * assigns; one authorized selection writes the assignment into a draft under a row lock, so two
 * competing selections fill a slot at most once and the loser learns why.
 */
@Injectable()
export class OpenSlotsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly events: EventStore,
    private readonly audit: AuditLog,
    private readonly notifications: NotificationsService,
    private readonly schedule: ScheduleService,
  ) {}

  async list(query: OpenSlotsQuery, tx: DbOrTx = this.db): Promise<OpenSlotView[]> {
    const rows = await tx
      .select()
      .from(openSlots)
      .where(
        and(
          eq(openSlots.siteId, query.siteId),
          eq(openSlots.orgUnitId, query.orgUnitId),
          eq(openSlots.periodMonth, query.periodMonth),
        ),
      )
      .orderBy(asc(openSlots.businessDate), asc(openSlots.createdAt));
    if (rows.length === 0) return [];
    const offers = await tx
      .select()
      .from(slotOffers)
      .where(
        inArray(
          slotOffers.slotId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(desc(slotOffers.offeredAt));
    const interests =
      offers.length > 0
        ? await tx
            .select()
            .from(slotInterests)
            .where(
              inArray(
                slotInterests.offerId,
                offers.map((offer) => offer.id),
              ),
            )
            .orderBy(asc(slotInterests.respondedAt))
        : [];
    return rows.map((row) => {
      const own = offers.filter((offer) => offer.slotId === row.id);
      const latest = own[0];
      return this.toView(
        row,
        latest
          ? this.toOfferView(
              latest,
              interests.filter((i) => i.offerId === latest.id),
            )
          : null,
        own.length,
      );
    });
  }

  async scopeOf(id: string): Promise<{ siteId: string; orgUnitId: string }> {
    const [row] = await this.db
      .select({ siteId: openSlots.siteId, orgUnitId: openSlots.orgUnitId })
      .from(openSlots)
      .where(eq(openSlots.id, id));
    if (!row) throw new DomainError('SLOT_NOT_FOUND', 404, 'Open slot not found');
    return row;
  }

  async create(cmd: CreateOpenSlotCommand, actor: Actor): Promise<OpenSlotView> {
    return this.db.transaction(async (tx) => {
      if (!cmd.businessDate.startsWith(cmd.periodMonth))
        throw new DomainError('DATE_OUTSIDE_MONTH', 422, 'The date lies outside the month');
      const [unit] = await tx
        .select({ id: orgUnits.id })
        .from(orgUnits)
        .where(and(eq(orgUnits.id, cmd.orgUnitId), eq(orgUnits.siteId, cmd.siteId)));
      if (!unit) throw new DomainError('ORG_UNIT_NOT_FOUND', 404, 'Unit not found on the site');
      const [zone] = await tx
        .select({ id: responsibilityZones.id, isActive: responsibilityZones.isActive })
        .from(responsibilityZones)
        .where(
          and(
            eq(responsibilityZones.id, cmd.zoneId),
            eq(responsibilityZones.orgUnitId, cmd.orgUnitId),
          ),
        );
      if (!zone || !zone.isActive)
        throw new DomainError('ZONE_MISMATCH', 422, 'The zone is not an active zone of the unit');
      const [template] = await tx
        .select({ id: shiftTemplates.id })
        .from(shiftTemplates)
        .where(
          and(
            eq(shiftTemplates.id, cmd.templateId),
            eq(shiftTemplates.siteId, cmd.siteId),
            eq(shiftTemplates.isActive, true),
          ),
        );
      if (!template)
        throw new DomainError('TEMPLATE_NOT_FOUND', 404, 'Active shift template not found');
      const [row] = await tx
        .insert(openSlots)
        .values({ ...cmd, createdBy: actor.id })
        .returning();
      if (!row) throw new Error('open_slots: insert returned no row');
      await this.audit.record(tx, {
        actor,
        action: 'schedule.slot.create',
        objectType: 'open_slot',
        objectId: row.id,
        after: { businessDate: cmd.businessDate, templateId: cmd.templateId, zoneId: cmd.zoneId },
      });
      await this.events.append(tx, {
        type: 'OPEN_SLOT_CREATED',
        source: 'WEB',
        actor,
        zoneId: cmd.zoneId,
        payload: { slotId: row.id, businessDate: cmd.businessDate },
      });
      return this.toView(row, null, 0);
    });
  }

  /** Deliberate offer to an explicit audience through the durable outbox (D-06, SC-16). */
  async offer(id: string, cmd: OfferSlotCommand, actor: Actor): Promise<OpenSlotView> {
    return this.db.transaction(async (tx) => {
      const slot = await this.lock(id, tx);
      if (slot.status !== 'OPEN')
        throw new DomainError(
          'SLOT_NOT_OPEN',
          409,
          `Slot is ${slot.status}; only an open slot can be offered`,
        );
      const [offer] = await tx
        .insert(slotOffers)
        .values({ slotId: slot.id, audience: cmd.audience, offeredBy: actor.id })
        .returning();
      if (!offer) throw new Error('slot_offers: insert returned no row');
      const audience = await this.audience(tx, slot, cmd.audience);
      const context = await this.textContext(tx, slot);
      let notified = 0;
      for (const employeeId of audience) {
        const queued = await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: employeeId,
          template: 'SLOT_OFFERED',
          payload: (t) => ({
            text: format(t.schedule.slotOffered, context(t)),
            buttons: [
              [
                { text: t.schedule.slotInterested, callbackData: `slot:${offer.id}:yes` },
                { text: t.schedule.slotNotInterested, callbackData: `slot:${offer.id}:no` },
              ],
            ],
          }),
          dedupeKey: `slot-offer:${offer.id}:${employeeId}`,
        });
        if (queued) notified += 1;
      }
      const [updatedOffer] = await tx
        .update(slotOffers)
        .set({ notifiedCount: notified })
        .where(eq(slotOffers.id, offer.id))
        .returning();
      const [updated] = await tx
        .update(openSlots)
        .set({ status: 'OFFERED', updatedAt: new Date() })
        .where(eq(openSlots.id, slot.id))
        .returning();
      await this.audit.record(tx, {
        actor,
        action: 'schedule.slot.offer',
        objectType: 'open_slot',
        objectId: slot.id,
        after: { offerId: offer.id, audience: cmd.audience, notified },
      });
      await this.events.append(tx, {
        type: 'OPEN_SLOT_OFFERED',
        source: 'WEB',
        actor,
        zoneId: slot.zoneId,
        payload: { slotId: slot.id, offerId: offer.id, audience: cmd.audience, notified },
      });
      return this.toView(
        updated!,
        this.toOfferView(updatedOffer!, []),
        await this.offerCount(tx, slot.id),
      );
    });
  }

  /** Closes the current offer and returns the slot to internal state; responses stay in history. */
  async withdraw(id: string, actor: Actor): Promise<OpenSlotView> {
    return this.db.transaction(async (tx) => {
      const slot = await this.lock(id, tx);
      if (slot.status !== 'OFFERED')
        throw new DomainError('SLOT_NOT_OFFERED', 409, 'Only an offered slot can be withdrawn');
      await this.closeOffers(tx, slot.id, 'CANCELLED');
      const [updated] = await tx
        .update(openSlots)
        .set({ status: 'OPEN', updatedAt: new Date() })
        .where(eq(openSlots.id, slot.id))
        .returning();
      await this.audit.record(tx, {
        actor,
        action: 'schedule.slot.withdraw',
        objectType: 'open_slot',
        objectId: slot.id,
      });
      await this.events.append(tx, {
        type: 'OPEN_SLOT_WITHDRAWN',
        source: 'WEB',
        actor,
        zoneId: slot.zoneId,
        payload: { slotId: slot.id },
      });
      return (
        await this.list(
          {
            siteId: updated!.siteId,
            orgUnitId: updated!.orgUnitId,
            periodMonth: updated!.periodMonth,
          },
          tx,
        )
      ).find((view) => view.id === slot.id)!;
    });
  }

  async cancel(id: string, actor: Actor): Promise<OpenSlotView> {
    return this.db.transaction(async (tx) => {
      const slot = await this.lock(id, tx);
      if (slot.status === 'FILLED' || slot.status === 'CANCELLED')
        throw new DomainError('SLOT_NOT_OPEN', 409, `Slot is ${slot.status}`);
      await this.closeOffers(tx, slot.id, 'CANCELLED');
      const [updated] = await tx
        .update(openSlots)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(openSlots.id, slot.id))
        .returning();
      await this.audit.record(tx, {
        actor,
        action: 'schedule.slot.cancel',
        objectType: 'open_slot',
        objectId: slot.id,
        before: { status: slot.status },
      });
      await this.events.append(tx, {
        type: 'OPEN_SLOT_CANCELLED',
        source: 'WEB',
        actor,
        zoneId: slot.zoneId,
        payload: { slotId: slot.id },
      });
      return (
        await this.list(
          {
            siteId: updated!.siteId,
            orgUnitId: updated!.orgUnitId,
            periodMonth: updated!.periodMonth,
          },
          tx,
        )
      ).find((view) => view.id === slot.id)!;
    });
  }

  /** An employee's response from the bot; a closed offer or filled slot records nothing. */
  async respond(
    offerId: string,
    employeeId: string,
    response: SlotInterestResponse,
  ): Promise<SlotResponseResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ offer: slotOffers, slot: openSlots })
        .from(slotOffers)
        .innerJoin(openSlots, eq(openSlots.id, slotOffers.slotId))
        .where(eq(slotOffers.id, offerId))
        .for('update');
      if (!row || row.offer.status !== 'OPEN' || row.slot.status !== 'OFFERED')
        return { kind: 'CLOSED' };
      await tx
        .insert(slotInterests)
        .values({ offerId, employeeId, response })
        .onConflictDoUpdate({
          target: [slotInterests.offerId, slotInterests.employeeId],
          set: { response, respondedAt: new Date() },
        });
      await this.events.append(tx, {
        type: response === 'INTERESTED' ? 'OPEN_SLOT_INTEREST' : 'OPEN_SLOT_DECLINED',
        source: 'TELEGRAM',
        actor: { type: 'EMPLOYEE', id: employeeId, role: 'EMPLOYEE' },
        employeeId,
        zoneId: row.slot.zoneId,
        payload: { slotId: row.slot.id, offerId },
      });
      return { kind: 'RECORDED', response };
    });
  }

  /**
   * The authorized decision (SC-16): writes the assignment into the draft under the slot lock and
   * the version revision, rechecking scope and eligibility; the slot fills exactly once.
   */
  async select(
    id: string,
    cmd: SelectSlotCommand,
    actor: Actor,
    grants: readonly RoleGrant[],
  ): Promise<{ slot: OpenSlotView; detail: ScheduleVersionDetail }> {
    return this.db.transaction(async (tx) => {
      const slot = await this.lock(id, tx);
      if (slot.status === 'FILLED')
        throw new DomainError(
          'SLOT_FILLED',
          409,
          `Slot was already filled by ${slot.filledEmployeeId}; your selection was not applied`,
        );
      if (slot.status === 'CANCELLED')
        throw new DomainError('SLOT_NOT_OPEN', 409, 'Slot is cancelled');
      const restriction = await this.schedule.editorScope(
        grants,
        { siteId: slot.siteId, orgUnitId: slot.orgUnitId },
        'SAVE',
        tx,
      );
      const version = await this.schedule.requireVersion(cmd.versionId, tx);
      if (
        version.siteId !== slot.siteId ||
        version.orgUnitId !== slot.orgUnitId ||
        version.periodMonth !== slot.periodMonth
      )
        throw new DomainError('SLOT_VERSION_MISMATCH', 422, 'The draft belongs to another plan');
      const [employee] = await tx
        .select({ id: employees.id, status: employees.status })
        .from(employees)
        .where(eq(employees.id, cmd.employeeId));
      if (!employee || employee.status !== 'ACTIVE')
        throw new DomainError('EMPLOYEE_INACTIVE', 422, 'The selected employee is not active');
      const detail = await this.schedule.addAssignmentWithin(
        tx,
        cmd.versionId,
        {
          employeeId: cmd.employeeId,
          templateId: slot.templateId,
          businessDate: slot.businessDate,
          zoneId: slot.zoneId,
          kind: 'REGULAR',
        },
        actor,
        cmd.expectedRevision,
        restriction,
      );
      await this.closeOffers(tx, slot.id, 'CLOSED');
      const [updated] = await tx
        .update(openSlots)
        .set({
          status: 'FILLED',
          filledEmployeeId: cmd.employeeId,
          filledVersionId: cmd.versionId,
          updatedAt: new Date(),
        })
        .where(eq(openSlots.id, slot.id))
        .returning();
      const [linked] = await tx
        .select({ employeeId: telegramAccounts.employeeId })
        .from(telegramAccounts)
        .where(eq(telegramAccounts.employeeId, cmd.employeeId));
      if (linked) {
        const context = await this.textContext(tx, slot);
        await this.notifications.enqueue(tx, {
          recipientType: 'EMPLOYEE',
          recipientId: cmd.employeeId,
          template: 'SLOT_SELECTED',
          payload: (t) => ({ text: format(t.schedule.slotSelected, context(t)) }),
          dedupeKey: `slot-selected:${slot.id}:${cmd.employeeId}`,
        });
      }
      await this.audit.record(tx, {
        actor,
        action: 'schedule.slot.select',
        objectType: 'open_slot',
        objectId: slot.id,
        after: { employeeId: cmd.employeeId, versionId: cmd.versionId },
      });
      await this.events.append(tx, {
        type: 'OPEN_SLOT_FILLED',
        source: 'WEB',
        actor,
        employeeId: cmd.employeeId,
        zoneId: slot.zoneId,
        scheduleVersionId: cmd.versionId,
        payload: { slotId: slot.id },
      });
      const view = (
        await this.list(
          {
            siteId: updated!.siteId,
            orgUnitId: updated!.orgUnitId,
            periodMonth: updated!.periodMonth,
          },
          tx,
        )
      ).find((item) => item.id === slot.id)!;
      return { slot: view, detail };
    });
  }

  private async lock(id: string, tx: Transaction): Promise<SlotRow> {
    const [row] = await tx.select().from(openSlots).where(eq(openSlots.id, id)).for('update');
    if (!row) throw new DomainError('SLOT_NOT_FOUND', 404, 'Open slot not found');
    return row;
  }

  private async closeOffers(tx: Transaction, slotId: string, status: 'CLOSED' | 'CANCELLED') {
    await tx
      .update(slotOffers)
      .set({ status, closedAt: new Date() })
      .where(and(eq(slotOffers.slotId, slotId), eq(slotOffers.status, 'OPEN')));
  }

  private async offerCount(tx: DbOrTx, slotId: string): Promise<number> {
    const rows = await tx
      .select({ id: slotOffers.id })
      .from(slotOffers)
      .where(eq(slotOffers.slotId, slotId));
    return rows.length;
  }

  /**
   * Explicit audiences: the unit's planned people of this and the previous month, or every
   * active linked employee. Only Telegram-linked active employees can receive an offer.
   */
  private async audience(tx: DbOrTx, slot: SlotRow, audience: 'UNIT' | 'ALL'): Promise<string[]> {
    const linked = await tx
      .select({ employeeId: telegramAccounts.employeeId })
      .from(telegramAccounts)
      .innerJoin(employees, eq(employees.id, telegramAccounts.employeeId))
      .where(eq(employees.status, 'ACTIVE'));
    const linkedIds = new Set(linked.map((row) => row.employeeId));
    if (audience === 'ALL') return [...linkedIds];
    const planned = await tx
      .select({ employeeId: shiftAssignments.employeeId })
      .from(shiftAssignments)
      .innerJoin(scheduleVersions, eq(scheduleVersions.id, shiftAssignments.scheduleVersionId))
      .where(
        and(
          eq(scheduleVersions.siteId, slot.siteId),
          eq(scheduleVersions.orgUnitId, slot.orgUnitId),
          inArray(scheduleVersions.periodMonth, [
            slot.periodMonth,
            addMonths(slot.periodMonth, -1),
          ]),
          eq(shiftAssignments.status, 'PLANNED'),
        ),
      );
    return [...new Set(planned.map((row) => row.employeeId))].filter((id) => linkedIds.has(id));
  }

  private async textContext(tx: DbOrTx, slot: SlotRow) {
    const [template] = await tx
      .select({
        localStart: shiftTemplates.localStart,
        localEnd: shiftTemplates.localEnd,
        isNight: shiftTemplates.isNight,
      })
      .from(shiftTemplates)
      .where(eq(shiftTemplates.id, slot.templateId));
    const [zone] = await tx
      .select({ name: responsibilityZones.name })
      .from(responsibilityZones)
      .where(eq(responsibilityZones.id, slot.zoneId));
    const [site] = await tx
      .select({ timezone: sites.timezone })
      .from(sites)
      .where(eq(sites.id, slot.siteId));
    void site;
    const [year, month, day] = slot.businessDate.split('-');
    return (t: Messages) => ({
      kind: template?.isNight ? t.schedule.kindNames.NIGHT : t.schedule.kindNames.DAY,
      date: `${day}.${month}.${year}`,
      start: template?.localStart ?? '',
      end: template?.localEnd ?? '',
      zone: zone ? `, ${zone.name}` : '',
    });
  }

  private toOfferView(offer: OfferRow, interests: readonly InterestRow[]): SlotOfferView {
    return {
      id: offer.id,
      status: offer.status,
      audience: offer.audience === 'ALL' ? 'ALL' : 'UNIT',
      notifiedCount: offer.notifiedCount,
      offeredAt: offer.offeredAt.toISOString(),
      closedAt: offer.closedAt?.toISOString() ?? null,
      interests: interests.map((row) => ({
        employeeId: row.employeeId,
        response: row.response,
        respondedAt: row.respondedAt.toISOString(),
      })),
    };
  }

  private toView(row: SlotRow, offer: SlotOfferView | null, offerCount: number): OpenSlotView {
    return {
      id: row.id,
      siteId: row.siteId,
      orgUnitId: row.orgUnitId,
      periodMonth: row.periodMonth,
      businessDate: row.businessDate,
      templateId: row.templateId,
      zoneId: row.zoneId,
      status: row.status,
      filledEmployeeId: row.filledEmployeeId,
      filledVersionId: row.filledVersionId,
      offer,
      offerCount,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
