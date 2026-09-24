import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  and,
  authUser,
  backgroundTasks,
  domainEvents,
  employeePositions,
  employees,
  eq,
  equipment,
  equipmentStopEpisodes,
  notificationOutbox,
  orgUnits,
  positions,
  responsibilityZones,
  sites,
  sql,
  workOrders,
} from '@vakhta/db';
import {
  MaterialsUsedKind,
  PlanIssue,
  TENANT_SETTING_DEFAULTS,
  type EquipmentInput,
  type PlanContent,
} from '@vakhta/contracts';
import {
  AnchorMode,
  EquipmentCriticality,
  EquipmentDocumentKind,
  EquipmentState,
  IntervalUnit,
  MaterialKind,
  MaterialMode,
  NoticeDelivery,
  OperationResult,
  PlanSourceKind,
  PlanState,
  ReleaseMode,
  ReviewDecision,
  TenantModule,
  WorkStatus,
  WorkType,
} from '@vakhta/domain';
import { FULL_SCOPE } from '../common/access-scope.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { TimerScheduler } from '../infra/timers.queue.js';
import { maintenanceOptionsFrom } from './maintenance-options.js';
import { maintenanceServices, MemoryStorage } from '../../test/maintenance.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';

const CHIEF: Actor = { type: 'WEB_USER', id: null, role: 'CHIEF_MECHANIC', label: 'chief' };
const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-01T07:00:00Z');
const FIRST_DUE_ON = '2026-10-15';

function one<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('expected a row');
  return row;
}

async function pdfBytes(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return Buffer.from(await pdf.save());
}

async function domainCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a DomainError');
}

describe('equipment maintenance: register, manuals, plans, work and emergencies (spec 014)', () => {
  let testDb: TestDatabase;
  let services: ReturnType<typeof maintenanceServices>;
  let storage: MemoryStorage;
  let unitId: string;
  let zoneId: string;
  let mechanic: string;
  let backup: string;
  let operator: string;
  let master: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb.stop();
  });

  async function employee(name: string, positionId: string): Promise<string> {
    const row = one(
      await testDb.db
        .insert(employees)
        .values({ personnelNumber: name, fullName: name })
        .returning({ id: employees.id }),
    );
    await testDb.db.insert(employeePositions).values({
      employeeId: row.id,
      orgUnitId: unitId,
      positionId,
      validFrom: new Date('2026-01-01T00:00:00Z'),
    });
    return row.id;
  }

  function machineInput(code: string): EquipmentInput {
    return {
      code,
      name: 'Paper cup machine',
      orgUnitId: unitId,
      zoneId,
      manufacturer: 'NEWTOP',
      model: 'FB100S',
      criticality: EquipmentCriticality.HIGH,
      responsibleEmployeeId: mechanic,
      backupEmployeeId: backup,
    };
  }

  function planContent(overrides: Partial<PlanContent> = {}): PlanContent {
    return {
      title: 'Monthly lubrication',
      intervalUnit: IntervalUnit.MONTH,
      intervalCount: 1,
      anchorMode: AnchorMode.FROM_COMPLETION,
      firstDueOn: FIRST_DUE_ON,
      sourceKind: PlanSourceKind.PLANT_DECISION,
      sourceDocumentId: null,
      sourceNote: 'Plant decision until the manual arrives',
      estimatedMinutes: 60,
      requiresStop: true,
      assigneeEmployeeId: mechanic,
      operations: [
        { text: 'Lubricate the main cam', photoRequired: false },
        { text: 'Check the chain tension', photoRequired: false },
      ],
      materials: [
        {
          kind: MaterialKind.MATERIAL,
          name: 'Grease EP2',
          quantity: 0.2,
          unit: 'kg',
          mode: MaterialMode.EVERY_CYCLE,
        },
      ],
      ...overrides,
    };
  }

  async function publishedPlan(machineId: string) {
    const plan = await services.plans.create(machineId, planContent(), CHIEF);
    await services.plans.publish(plan.id, CHIEF, NOW);
    const order = one(
      await testDb.db.select().from(workOrders).where(eq(workOrders.planId, plan.id)),
    );
    return { planId: plan.id, order };
  }

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE equipment_stop_episodes, work_order_reviews, work_order_waits, work_order_operation_results, work_orders, maintenance_plan_materials, maintenance_plan_operations, maintenance_plan_versions, maintenance_plans, equipment_document_links, equipment_documents, equipment, background_tasks, notification_outbox, employee_positions, employees, positions, responsibility_zones, org_units, sites CASCADE`,
    );
    storage = new MemoryStorage();
    services = maintenanceServices(testDb.db, { timers: new TimerScheduler(), storage });
    const site = one(
      await testDb.db
        .insert(sites)
        .values({ code: 'main', name: 'Main', timezone: 'Europe/Kyiv' })
        .returning(),
    );
    const unit = one(
      await testDb.db.insert(orgUnits).values({ siteId: site.id, name: 'Cups' }).returning(),
    );
    unitId = unit.id;
    zoneId = one(
      await testDb.db
        .insert(responsibilityZones)
        .values({ siteId: site.id, orgUnitId: unitId, code: 'L1', name: 'Line 1' })
        .returning(),
    ).id;
    const [mechanicPosition, operatorPosition] = await testDb.db
      .insert(positions)
      .values([
        { code: 'MECHANIC', name: 'Mechanic', performsMaintenance: true },
        { code: 'OPERATOR', name: 'Operator' },
      ])
      .returning();
    if (!mechanicPosition || !operatorPosition) throw new Error('positions not seeded');
    mechanic = await employee('Mechanic One', mechanicPosition.id);
    backup = await employee('Mechanic Two', mechanicPosition.id);
    operator = await employee('Operator', operatorPosition.id);
    master = await employee('Master', operatorPosition.id);
    await testDb.db
      .update(orgUnits)
      .set({ masterEmployeeId: master })
      .where(eq(orgUnits.id, unitId));
  });

  describe('register (US1)', () => {
    it('creates a machine, refuses a duplicate code in any case and a non-mechanic', async () => {
      const created = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const rows = await services.equipment.list({ archived: false }, FULL_SCOPE, NOW);
      expect(rows.map((row) => row.code)).toEqual(['FB-100']);

      expect(await domainCode(services.equipment.create(machineInput(' fb-100 '), CHIEF))).toBe(
        'EQUIPMENT_CODE_TAKEN',
      );
      const byOperator = { ...machineInput('FB-158'), responsibleEmployeeId: operator };
      expect(await domainCode(services.equipment.create(byOperator, CHIEF))).toBe(
        'MECHANIC_NOT_ELIGIBLE',
      );

      const detail = await services.equipment.detail(created.id, NOW);
      expect(detail.responsible.id).toBe(mechanic);
      expect(detail.state).toBe(EquipmentState.AVAILABLE);
    });

    it('refuses to archive a machine with open work and archives it once work is closed', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const { order } = await publishedPlan(machine.id);
      expect(await domainCode(services.equipment.archive(machine.id, 'Sold', CHIEF))).toBe(
        'EQUIPMENT_HAS_OPEN_WORK',
      );

      await services.actions.cancel(order.id, 'Machine sold', {
        actor: CHIEF,
        source: 'WEB',
        now: NOW,
      });
      await services.plans.setState(
        order.planId ?? '',
        { state: 'ARCHIVED', reason: 'Machine sold' },
        CHIEF,
      );
      await services.equipment.archive(machine.id, 'Sold', CHIEF);
      expect(await services.equipment.list({ archived: false }, FULL_SCOPE, NOW)).toEqual([]);
    });
  });

  describe('manuals (US2)', () => {
    it('stores a PDF privately, links it and serves it for the bot', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const bytes = await pdfBytes();
      const uploaded = await services.documents.upload(
        machine.id,
        {
          meta: { title: 'FB100S manual', kind: EquipmentDocumentKind.OPERATING_MANUAL },
          bytes,
        },
        CHIEF,
      );

      expect(storage.objects.size).toBe(1);
      const docs = await services.documents.forEquipment(machine.id);
      expect(docs.map((doc) => doc.title)).toEqual(['FB100S manual']);
      const manual = await services.documents.manualFor(machine.id, null);
      expect(manual?.documentId).toBe(uploaded.id);
      expect(manual?.bytes?.length).toBe(bytes.length);

      await services.documents.rememberTelegramFile(uploaded.id, 'telegram-file');
      const cached = await services.documents.manualFor(machine.id, null);
      expect(cached?.telegramFileId).toBe('telegram-file');
      expect(cached?.bytes).toBeNull();
    });

    it('rejects a file that is not a PDF and stores nothing', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const upload = services.documents.upload(
        machine.id,
        {
          meta: { title: 'Fake', kind: EquipmentDocumentKind.OPERATING_MANUAL },
          bytes: Buffer.from('not a pdf'),
        },
        CHIEF,
      );
      expect(await domainCode(upload)).toBe('DOCUMENT_INVALID');
      expect(storage.objects.size).toBe(0);
    });
  });

  describe('plans and planned work (US3–US6)', () => {
    it('names every gap of an incomplete draft instead of publishing it', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const draft = planContent({ firstDueOn: null, operations: [] });
      const plan = await services.plans.create(machine.id, draft, CHIEF);
      const error = await services.plans.publish(plan.id, CHIEF, NOW).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      if (!(error instanceof DomainError)) return;
      expect(error.code).toBe('PLAN_INVALID');
      const issues = PlanIssue.array().parse(error.details?.issues);
      expect(issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['FIRST_DUE_REQUIRED', 'OPERATIONS_REQUIRED']),
      );
      expect(await testDb.db.select().from(workOrders)).toEqual([]);
    });

    it('publishing creates the first cycle with reminders 7, 3 and 1 days ahead', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const { order } = await publishedPlan(machine.id);

      expect(order).toMatchObject({
        type: WorkType.PLANNED_MAINTENANCE,
        status: WorkStatus.ASSIGNED,
        dueOn: FIRST_DUE_ON,
        plannedOn: FIRST_DUE_ON,
        assigneeEmployeeId: mechanic,
      });
      const timers = await testDb.db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.kind, 'MAINTENANCE_REMINDER'));
      const days = timers
        .map((task) =>
          Math.round((Date.parse(`${FIRST_DUE_ON}T06:00:00Z`) - task.dueAt.getTime()) / DAY_MS),
        )
        .sort((a, b) => a - b);
      expect(days).toEqual([1, 3, 7]);
      expect(await testDb.db.select().from(notificationOutbox)).toEqual([]);
    });

    it('a cycle too close for reminders gets one notice now instead (FR-041)', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const plan = await services.plans.create(
        machine.id,
        planContent({ firstDueOn: '2026-10-02' }),
        CHIEF,
      );
      await services.plans.publish(plan.id, CHIEF, NOW);

      const reminders = await testDb.db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.kind, 'MAINTENANCE_REMINDER'));
      expect(reminders).toEqual([]);
      const notices = await testDb.db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.template, 'MAINTENANCE_ASSIGNED'));
      expect(notices.map((notice) => notice.recipientId)).toEqual([mechanic]);
    });

    it('a mechanic answers the checklist, submits, and acceptance plans the next cycle', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const { order } = await publishedPlan(machine.id);
      const workOrderId = order.id;

      expect(await domainCode(services.actions.start({ employeeId: backup, workOrderId }))).toBe(
        'WORK_NOT_YOURS',
      );
      await services.actions.start({ employeeId: mechanic, workOrderId });
      await services.actions.answer({
        employeeId: mechanic,
        workOrderId,
        ordinal: 1,
        result: OperationResult.DONE,
      });
      expect(await domainCode(services.actions.submit({ employeeId: mechanic, workOrderId }))).toBe(
        'WORK_ANSWERS_MISSING',
      );
      await services.actions.answer({
        employeeId: mechanic,
        workOrderId,
        ordinal: 2,
        result: OperationResult.DONE,
      });
      expect(await domainCode(services.actions.submit({ employeeId: mechanic, workOrderId }))).toBe(
        'WORK_MATERIALS_UNCONFIRMED',
      );
      const submitted = await services.actions.submit({
        employeeId: mechanic,
        workOrderId,
        materialsUsed: { kind: MaterialsUsedKind.AS_PLANNED },
        now: new Date('2026-10-14T08:00:00Z'),
      });
      expect(submitted.status).toBe(WorkStatus.IN_REVIEW);

      const beforeAccept = await services.queries.detail(workOrderId, NOW);
      expect(beforeAccept.nextDueOnAfterAccept).toBe('2026-11-14');
      expect(beforeAccept.partsUsed).toBe('Grease EP2 0.2 kg');

      await services.actions.review(
        workOrderId,
        { decision: ReviewDecision.ACCEPTED },
        { actor: CHIEF, source: 'WEB', now: new Date('2026-10-14T10:00:00Z') },
      );
      const cycles = await testDb.db
        .select({ status: workOrders.status, dueOn: workOrders.dueOn })
        .from(workOrders)
        .where(eq(workOrders.equipmentId, machine.id))
        .orderBy(workOrders.number);
      expect(cycles).toEqual([
        { status: WorkStatus.COMPLETED, dueOn: FIRST_DUE_ON },
        { status: WorkStatus.ASSIGNED, dueOn: '2026-11-14' },
      ]);
    });

    it('a missing material informs the unit master (AC-030)', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const { order } = await publishedPlan(machine.id);
      await services.actions.readiness({
        employeeId: mechanic,
        workOrderId: order.id,
        ready: false,
        note: 'No grease in stock',
      });
      const notices = await testDb.db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.template, 'MAINTENANCE_READINESS'));
      expect(notices.map((notice) => notice.recipientId)).toEqual([master]);
    });

    it('the calendar lists the open cycle and forecasts later ones', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      await publishedPlan(machine.id);
      const view = await services.queries.calendar(
        { from: '2026-10-01', to: '2026-12-31' },
        FULL_SCOPE,
        NOW,
      );
      expect(view.items.map((item) => item.dueOn)).toEqual([FIRST_DUE_ON]);
      expect(view.forecast.map((item) => item.date)).toEqual(['2026-11-15', '2026-12-15']);
    });
  });

  describe('emergency repair (US7)', () => {
    it('concurrent reports open one repair and one stop episode', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const report = () =>
        services.emergency.createFromPanel(
          machine.id,
          { description: 'Cup bottom not sealing', stoppedWork: true, safety: false },
          { actor: CHIEF, now: NOW },
        );
      await Promise.all([report(), report(), report()]);

      const repairs = await testDb.db
        .select()
        .from(workOrders)
        .where(
          and(
            eq(workOrders.equipmentId, machine.id),
            eq(workOrders.type, WorkType.EMERGENCY_REPAIR),
          ),
        );
      expect(repairs).toHaveLength(1);
      const episodes = await testDb.db
        .select()
        .from(equipmentStopEpisodes)
        .where(eq(equipmentStopEpisodes.equipmentId, machine.id));
      expect(episodes).toHaveLength(1);
      const [row] = await testDb.db.select().from(equipment).where(eq(equipment.id, machine.id));
      expect(row?.state).toBe(EquipmentState.STOPPED);
    });

    it('accept, finish and release return the machine to service', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      await services.emergency.createFromPanel(
        machine.id,
        { description: 'Paper feed jam', stoppedWork: true, safety: false },
        { actor: CHIEF, now: NOW },
      );
      const repair = one(
        await testDb.db.select().from(workOrders).where(eq(workOrders.equipmentId, machine.id)),
      );
      const workOrderId = repair.id;
      expect(await domainCode(services.actions.start({ employeeId: mechanic, workOrderId }))).toBe(
        'WORK_NOT_ACCEPTED',
      );

      await services.emergency.accept(mechanic, workOrderId, NOW);
      expect(await domainCode(services.emergency.accept(backup, workOrderId, NOW))).toBe(
        'WORK_ALREADY_ACCEPTED',
      );
      await services.actions.start({ employeeId: mechanic, workOrderId });
      const release = () =>
        services.emergency.release(
          machine.id,
          { mode: ReleaseMode.AVAILABLE },
          { actor: CHIEF, now: NOW },
        );
      expect(await domainCode(release())).toBe('RELEASE_NOT_READY');

      const done = await services.actions.submit({
        employeeId: mechanic,
        workOrderId,
        summary: { text: 'Replaced the feed roller', cause: 'Worn roller' },
      });
      expect(done.status).toBe(WorkStatus.COMPLETED);
      await release();

      const [row] = await testDb.db.select().from(equipment).where(eq(equipment.id, machine.id));
      expect(row?.state).toBe(EquipmentState.AVAILABLE);
      const [episode] = await testDb.db
        .select()
        .from(equipmentStopEpisodes)
        .where(eq(equipmentStopEpisodes.equipmentId, machine.id));
      expect(episode?.releasedAt).not.toBeNull();
    });

    it('declining passes the repair to the backup and tells the master', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      await services.emergency.createFromPanel(
        machine.id,
        { description: 'Heater fault', stoppedWork: false, safety: false },
        { actor: CHIEF, now: NOW },
      );
      const repair = one(
        await testDb.db.select().from(workOrders).where(eq(workOrders.equipmentId, machine.id)),
      );
      await services.emergency.decline(
        mechanic,
        { workOrderId: repair.id, reason: 'Off site' },
        NOW,
      );
      const [moved] = await testDb.db.select().from(workOrders).where(eq(workOrders.id, repair.id));
      expect(moved?.assigneeEmployeeId).toBe(backup);
      expect(moved?.ackDueAt?.getTime()).toBe(repair.ackDueAt?.getTime());
      const notices = await testDb.db
        .select({
          template: notificationOutbox.template,
          recipientId: notificationOutbox.recipientId,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.recipientId, backup));
      expect(notices.map((row) => row.template)).toEqual(['EMERGENCY_ASSIGNED']);
      const toMaster = await testDb.db
        .select({ template: notificationOutbox.template })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.recipientId, master));
      expect(toMaster.map((row) => row.template)).toContain('EMERGENCY_DECLINED');
    });
  });

  describe('tenant parameters and the module switch (FR-001, A-4, FR-062)', () => {
    const tuned = maintenanceOptionsFrom(
      {
        ...TENANT_SETTING_DEFAULTS,
        maintenanceReminderFirstDays: 5,
        maintenanceReminderSecondDays: 0,
        maintenanceReminderLastDays: 2,
        maintenanceReminderHour: 8,
        emergencyAckStoppedMinutes: 7,
        emergencyEscalationGapMinutes: 9,
      },
      [TenantModule.MAINTENANCE],
    );

    it('plans reminders on the tenant days and hour; a zero day is off', async () => {
      services = maintenanceServices(testDb.db, {
        timers: new TimerScheduler(),
        storage,
        options: tuned,
      });
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      await publishedPlan(machine.id);
      const timers = await testDb.db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.kind, 'MAINTENANCE_REMINDER'));
      // 08:00 in Kyiv (UTC+3 in October) is 05:00 UTC.
      const days = timers
        .map((task) =>
          Math.round((Date.parse(`${FIRST_DUE_ON}T05:00:00Z`) - task.dueAt.getTime()) / DAY_MS),
        )
        .sort((a, b) => a - b);
      expect(days).toEqual([2, 5]);
      expect(timers.every((task) => task.dueAt.getUTCHours() === 5)).toBe(true);
    });

    it('counts the acceptance budget and the escalation gap from the tenant values', async () => {
      services = maintenanceServices(testDb.db, {
        timers: new TimerScheduler(),
        storage,
        options: tuned,
      });
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      await services.emergency.createFromPanel(
        machine.id,
        { description: 'Jam', stoppedWork: true, safety: false },
        { actor: CHIEF, now: NOW },
      );
      const repair = one(
        await testDb.db.select().from(workOrders).where(eq(workOrders.equipmentId, machine.id)),
      );
      expect(repair.ackDueAt?.getTime()).toBe(NOW.getTime() + 7 * 60_000);
      const detail = await services.queries.detail(repair.id, NOW);
      expect(detail.escalateAt).toBe(new Date(NOW.getTime() + 16 * 60_000).toISOString());
    });

    it('a tenant without the module has no mechanic entry and no machine step', async () => {
      services = maintenanceServices(testDb.db, {
        timers: new TimerScheduler(),
        storage,
        options: maintenanceOptionsFrom(TENANT_SETTING_DEFAULTS, [TenantModule.ADMIN_PANEL]),
      });
      expect(await services.mechanic.isMaintenanceStaff(mechanic)).toBe(false);
      expect(services.emergency.available()).toBe(false);
    });
  });

  describe('plan versions and copies (FR-023, FR-026)', () => {
    it('applies a newer version to work not yet started, only after the diff (AC-015)', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const { planId, order } = await publishedPlan(machine.id);
      await services.actions.readiness({
        employeeId: mechanic,
        workOrderId: order.id,
        ready: false,
        note: 'No grease',
      });
      const base = planContent();
      await services.plans.save(
        planId,
        {
          ...base,
          operations: [...base.operations, { text: 'Clean the die', photoRequired: true }],
          materials: base.materials.map((material) => ({ ...material, quantity: 0.3 })),
        },
        CHIEF,
      );
      await services.plans.publish(planId, CHIEF, NOW);

      const stale = await services.queries.detail(order.id, NOW);
      expect(stale.planRevision).toBe(1);
      expect(stale.newerPlanRevision).toBe(2);
      const diff = await services.queries.planDiff(order.id);
      expect(diff.operations.added.map((operation) => operation.text)).toEqual(['Clean the die']);
      expect(diff.materials.removed.map((material) => material.quantity)).toEqual([0.2]);
      expect(diff.materials.added.map((material) => material.quantity)).toEqual([0.3]);

      const context = { actor: CHIEF, source: 'WEB' as const, now: NOW };
      expect(
        await domainCode(services.actions.applyPlanVersion(order.id, stale.version - 1, context)),
      ).toBe('WORK_VERSION_CONFLICT');
      await services.actions.applyPlanVersion(order.id, stale.version, context);
      const applied = await services.queries.detail(order.id, NOW);
      expect(applied.planRevision).toBe(2);
      expect(applied.newerPlanRevision).toBeNull();
      expect(applied.operations).toHaveLength(3);
      expect(applied.readiness).toBe('UNKNOWN');
      expect(applied.history.map((item) => item.type)).toContain('WORK_ORDER_PLAN_APPLIED');

      await services.actions.start({ employeeId: mechanic, workOrderId: order.id });
      await services.plans.save(planId, base, CHIEF);
      await services.plans.publish(planId, CHIEF, NOW);
      const started = await services.queries.detail(order.id, NOW);
      expect(
        await domainCode(services.actions.applyPlanVersion(order.id, started.version, context)),
      ).toBe('WORK_ALREADY_STARTED');
    });

    it('copies a plan to another machine as a draft to confirm (AC-018)', async () => {
      const first = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const second = await services.equipment.create(machineInput('FB-158'), CHIEF, NOW);
      const { planId } = await publishedPlan(first.id);
      expect(await domainCode(services.plans.copy(planId, first.id, CHIEF))).toBe(
        'PLAN_COPY_SAME_EQUIPMENT',
      );

      const copy = await services.plans.copy(planId, second.id, CHIEF);
      const detail = await services.plans.detail(copy.id);
      expect(detail).toMatchObject({
        equipmentId: second.id,
        state: PlanState.DRAFT,
        active: null,
      });
      expect(detail.draft).toMatchObject({
        title: 'Monthly lubrication',
        firstDueOn: null,
        assigneeEmployeeId: null,
        sourceDocumentId: null,
      });
      expect(detail.draft?.sourceNote).toBeUndefined();
      expect(detail.draft?.operations).toEqual(planContent().operations);
      expect(detail.draft?.materials).toEqual(planContent().materials);

      const error = await services.plans.publish(copy.id, CHIEF, NOW).catch((e: unknown) => e);
      if (!(error instanceof DomainError)) throw new Error('expected a refusal');
      const issues = PlanIssue.array().parse(error.details?.issues);
      expect(issues.map((issue) => issue.code).sort()).toEqual([
        'ASSIGNEE_REQUIRED',
        'FIRST_DUE_REQUIRED',
        'SOURCE_NOTE_REQUIRED',
      ]);
      const works = await testDb.db
        .select()
        .from(workOrders)
        .where(eq(workOrders.equipmentId, second.id));
      expect(works).toEqual([]);
    });
  });

  describe('paper records, notices and missed dates (FR-043, FR-052, FR-054)', () => {
    const CHIEF_USER_ID = '5f0c2a8e-7b1d-4c3e-9a55-3c0e3b1d2f11';
    const ENTERED: Actor = {
      type: 'WEB_USER',
      id: CHIEF_USER_ID,
      role: 'CHIEF_MECHANIC',
      label: 'chief',
    };

    it('records completion on the mechanic’s behalf and keeps both people (AC-039)', async () => {
      await testDb.db
        .insert(authUser)
        .values({ id: CHIEF_USER_ID, name: 'Chief Mechanic', email: 'chief@example.test' })
        .onConflictDoNothing();
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const plan = await services.plans.create(
        machine.id,
        planContent({
          operations: [
            { text: 'Lubricate the main cam', photoRequired: true },
            { text: 'Check the chain tension', photoRequired: false },
          ],
        }),
        CHIEF,
      );
      await services.plans.publish(plan.id, CHIEF, NOW);
      const order = one(
        await testDb.db.select().from(workOrders).where(eq(workOrders.planId, plan.id)),
      );
      const context = { actor: ENTERED, source: 'WEB' as const, now: NOW };
      const command = {
        expectedVersion: order.version,
        performerId: backup,
        performedOn: '2026-09-30',
        answers: [
          { ordinal: 1, result: OperationResult.DONE },
          {
            ordinal: 2,
            result: OperationResult.NOT_APPLICABLE,
            reason: 'Chain replaced last week',
          },
        ],
        materialsUsed: { kind: MaterialsUsedKind.OTHER, text: 'Grease EP2 0.1 kg' },
      };
      expect(
        await domainCode(
          services.actions.recordCompletion(
            order.id,
            { ...command, performedOn: '2026-10-02' },
            context,
          ),
        ),
      ).toBe('WORK_PERFORMED_IN_FUTURE');
      expect(
        await domainCode(
          services.actions.recordCompletion(order.id, { ...command, materialsUsed: null }, context),
        ),
      ).toBe('WORK_MATERIALS_UNCONFIRMED');
      expect(
        await domainCode(
          services.actions.recordCompletion(
            order.id,
            { ...command, performerId: operator },
            context,
          ),
        ),
      ).toBe('MECHANIC_NOT_ELIGIBLE');

      const result = await services.actions.recordCompletion(order.id, command, context);
      expect(result.status).toBe(WorkStatus.IN_REVIEW);
      const detail = await services.queries.detail(order.id, NOW);
      expect(detail.performedBy?.id).toBe(backup);
      expect(detail.enteredBy).toBe('Chief Mechanic');
      expect(detail.partsUsed).toBe('Grease EP2 0.1 kg');
      expect(detail.operations.map((operation) => operation.answer?.answeredBy)).toEqual([
        'Mechanic Two',
        'Mechanic Two',
      ]);
      expect(detail.nextDueOnAfterAccept).toBe('2026-10-30');
    });

    it('lists the notices of a work with a failed delivery (FR-043)', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const plan = await services.plans.create(
        machine.id,
        planContent({ firstDueOn: '2026-10-02' }),
        CHIEF,
      );
      await services.plans.publish(plan.id, CHIEF, NOW);
      const order = one(
        await testDb.db.select().from(workOrders).where(eq(workOrders.planId, plan.id)),
      );
      await testDb.db.update(notificationOutbox).set({
        status: NoticeDelivery.FAILED,
        lastError: 'Forbidden: bot was blocked by the user',
      });
      const detail = await services.queries.detail(order.id, NOW);
      expect(detail.deliveries).toEqual([
        expect.objectContaining({
          template: 'MAINTENANCE_ASSIGNED',
          recipient: 'Mechanic One',
          status: NoticeDelivery.FAILED,
          sentAt: null,
        }),
      ]);
    });

    it('keeps fixed-calendar dates a late cycle skipped as missed (FR-052)', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const plan = await services.plans.create(
        machine.id,
        planContent({ anchorMode: AnchorMode.FIXED_CALENDAR }),
        CHIEF,
      );
      await services.plans.publish(plan.id, CHIEF, NOW);
      const order = one(
        await testDb.db.select().from(workOrders).where(eq(workOrders.planId, plan.id)),
      );
      const late = new Date('2026-12-20T15:00:00Z');
      await services.actions.recordCompletion(
        order.id,
        {
          expectedVersion: order.version,
          performerId: mechanic,
          performedOn: '2026-12-20',
          answers: [
            { ordinal: 1, result: OperationResult.DONE },
            { ordinal: 2, result: OperationResult.DONE },
          ],
          materialsUsed: { kind: MaterialsUsedKind.AS_PLANNED },
        },
        { actor: CHIEF, source: 'WEB', now: late },
      );
      await services.actions.review(
        order.id,
        { decision: ReviewDecision.ACCEPTED },
        { actor: CHIEF, source: 'WEB', now: late },
      );
      const [missed] = await testDb.db
        .select({ comment: domainEvents.comment })
        .from(domainEvents)
        .where(eq(domainEvents.type, 'MAINTENANCE_CYCLES_MISSED'));
      expect(missed?.comment).toBe('2026-11-15, 2026-12-15');
      const next = await testDb.db
        .select({ dueOn: workOrders.dueOn })
        .from(workOrders)
        .where(and(eq(workOrders.planId, plan.id), eq(workOrders.status, WorkStatus.ASSIGNED)));
      expect(next).toEqual([{ dueOn: '2027-01-15' }]);
    });
  });

  describe('mechanics and the machine state (FR-004, FR-005)', () => {
    it('refuses the responsible mechanic as the backup', async () => {
      const same = { ...machineInput('FB-100'), backupEmployeeId: mechanic };
      expect(await domainCode(services.equipment.create(same, CHIEF, NOW))).toBe(
        'BACKUP_IS_RESPONSIBLE',
      );
    });

    it('corrects the state with a reason, but not while a repair holds the machine', async () => {
      const machine = await services.equipment.create(machineInput('FB-100'), CHIEF, NOW);
      const correct = async (state: EquipmentState) => {
        const detail = await services.equipment.detail(machine.id, NOW);
        return services.equipment.correctState(
          machine.id,
          { state, reason: 'Inventory check', expectedVersion: detail.version },
          CHIEF,
        );
      };
      await correct(EquipmentState.UNKNOWN);
      const detail = await services.equipment.detail(machine.id, NOW);
      expect(detail.state).toBe(EquipmentState.UNKNOWN);
      expect(detail.history.map((item) => item.type)).toContain('EQUIPMENT_STATE_CORRECTED');
      expect(await domainCode(correct(EquipmentState.UNKNOWN))).toBe('EQUIPMENT_STATE_UNCHANGED');

      await services.emergency.createFromPanel(
        machine.id,
        { description: 'Jam', stoppedWork: true, safety: false },
        { actor: CHIEF, now: NOW },
      );
      expect(await domainCode(correct(EquipmentState.AVAILABLE))).toBe('EQUIPMENT_STATE_BY_REPAIR');
    });
  });
});
