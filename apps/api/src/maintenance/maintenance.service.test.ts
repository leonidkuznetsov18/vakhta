import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  and,
  backgroundTasks,
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
import { PlanIssue, type EquipmentInput, type PlanContent } from '@vakhta/contracts';
import {
  AnchorMode,
  EquipmentCriticality,
  EquipmentDocumentKind,
  EquipmentState,
  IntervalUnit,
  MaterialKind,
  MaterialMode,
  OperationResult,
  PlanSourceKind,
  ReleaseMode,
  ReviewDecision,
  WorkStatus,
  WorkType,
} from '@vakhta/domain';
import { FULL_SCOPE } from '../common/access-scope.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { TimerScheduler } from '../infra/timers.queue.js';
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
      const submitted = await services.actions.submit({
        employeeId: mechanic,
        workOrderId,
        now: new Date('2026-10-14T08:00:00Z'),
      });
      expect(submitted.status).toBe(WorkStatus.IN_REVIEW);

      const beforeAccept = await services.queries.detail(workOrderId, NOW);
      expect(beforeAccept.nextDueOnAfterAccept).toBe('2026-11-14');

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
});
