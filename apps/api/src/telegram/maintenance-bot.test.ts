import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, Bot } from 'grammy';
import type { InlineKeyboardMarkup, PhotoSize, Update } from 'grammy/types';
import {
  employeePositions,
  employees,
  eq,
  orgUnits,
  positions,
  responsibilityZones,
  sites,
  sql,
  workOrderOperationResults,
  workOrders,
} from '@vakhta/db';
import {
  AnchorMode,
  EquipmentCriticality,
  IntervalUnit,
  MaterialKind,
  MaterialMode,
  MaintenanceCallbackAction,
  OperationResult,
  PlanSourceKind,
  WorkStatus,
  employeeAccess,
  maintenanceCallback,
} from '@vakhta/domain';
import type { PlanContent } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import type { Actor } from '../common/actor.js';
import { InMemoryShortTermStore } from '../infra/short-term-store.js';
import { TimerScheduler } from '../infra/timers.queue.js';
import { createLogger } from '../logger.js';
import { maintenanceServices } from '../../test/maintenance.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import type { BotContext } from './bot-context.js';
import { maintenanceComposer } from './maintenance-bot.js';

const TELEGRAM_USER_ID = 20001;
const CHIEF: Actor = { type: 'WEB_USER', id: null, role: 'CHIEF_MECHANIC', label: 'chief' };
const BOT_INFO = {
  id: 90002,
  is_bot: true,
  first_name: 'Maintenance test bot',
  username: 'maintenance_test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
} as const;
const t = messages('en');
const CHAT = { id: TELEGRAM_USER_ID, type: 'private', first_name: 'Mechanic' } as const;
const FROM = { id: TELEGRAM_USER_ID, is_bot: false, first_name: 'Mechanic' } as const;

interface Drawn {
  readonly text: string;
  readonly buttons: readonly string[];
}

function drawnOf(text: string, other: { reply_markup?: unknown } | undefined): Drawn {
  const markup = other?.reply_markup as InlineKeyboardMarkup | undefined;
  const buttons = (markup?.inline_keyboard ?? [])
    .flat()
    .map((button) => ('callback_data' in button ? button.callback_data : ''));
  return { text, buttons };
}

function one<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('expected a row');
  return row;
}

describe('Telegram: the mechanic works maintenance and repairs from the bot (spec 014)', () => {
  let testDb: TestDatabase;
  let services: ReturnType<typeof maintenanceServices>;
  let bot: Bot<BotContext>;
  let mechanic: string;
  let machineId: string;
  let updateId = 1;
  let drawn: Drawn[] = [];

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb.stop();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function press(data: string): Promise<void> {
    updateId += 1;
    const update: Update = {
      update_id: updateId,
      callback_query: {
        id: `cb-${updateId}`,
        from: FROM,
        chat_instance: 'private',
        data,
        message: { message_id: 7, date: 0, chat: CHAT, from: BOT_INFO, text: 'card' },
      },
    };
    return bot.handleUpdate(update);
  }

  function send(message: { text: string } | { photo: PhotoSize[] }): Promise<void> {
    updateId += 1;
    const base = { message_id: updateId, date: 0, chat: CHAT, from: FROM };
    const update: Update =
      'text' in message
        ? { update_id: updateId, message: { ...base, text: message.text } }
        : { update_id: updateId, message: { ...base, photo: message.photo } };
    return bot.handleUpdate(update);
  }

  /** The latest screen the bot drew, whether as an edit or a new message. */
  function lastScreen(): Drawn {
    return drawn.at(-1) ?? { text: '', buttons: [] };
  }

  function toasts(): string[] {
    return vi.mocked(Api.prototype.answerCallbackQuery).mock.calls.map((call) => {
      const other: { text?: string } | undefined = call[1];
      return other?.text ?? '';
    });
  }

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE work_orders, maintenance_plan_versions, maintenance_plans, equipment, notification_outbox, background_tasks, media_objects, employee_positions, employees, positions, responsibility_zones, org_units, sites CASCADE`,
    );
    vi.spyOn(Api.prototype, 'getMe').mockResolvedValue(BOT_INFO);
    vi.spyOn(Api.prototype, 'answerCallbackQuery').mockResolvedValue(true);
    drawn = [];
    vi.spyOn(Api.prototype, 'editMessageText').mockImplementation((...args) => {
      const [, , text, other] = args;
      drawn.push(drawnOf(typeof text === 'string' ? text : '', other));
      return Promise.resolve(true);
    });
    vi.spyOn(Api.prototype, 'sendMessage').mockImplementation((_chat, text, other) => {
      const plain = typeof text === 'string' ? text : '';
      drawn.push(drawnOf(plain, other));
      return Promise.resolve({ message_id: 43, date: 0, chat: CHAT, text: plain });
    });
    services = maintenanceServices(testDb.db, { timers: new TimerScheduler(), storage: null });
    const site = one(
      await testDb.db
        .insert(sites)
        .values({ code: 'main', name: 'Main', timezone: 'Europe/Kyiv' })
        .returning(),
    );
    const unit = one(
      await testDb.db.insert(orgUnits).values({ siteId: site.id, name: 'Cups' }).returning(),
    );
    const zone = one(
      await testDb.db
        .insert(responsibilityZones)
        .values({ siteId: site.id, orgUnitId: unit.id, code: 'L1', name: 'Line 1' })
        .returning(),
    );
    const position = one(
      await testDb.db
        .insert(positions)
        .values({ code: 'MECHANIC', name: 'Mechanic', performsMaintenance: true })
        .returning(),
    );
    const person = one(
      await testDb.db
        .insert(employees)
        .values({ personnelNumber: 'm1', fullName: 'Mechanic One', locale: 'en' })
        .returning(),
    );
    mechanic = person.id;
    await testDb.db.insert(employeePositions).values({
      employeeId: mechanic,
      orgUnitId: unit.id,
      positionId: position.id,
      validFrom: new Date('2026-01-01T00:00:00Z'),
    });
    machineId = (
      await services.equipment.create(
        {
          code: 'FB-100',
          name: 'Cup machine',
          orgUnitId: unit.id,
          zoneId: zone.id,
          criticality: EquipmentCriticality.HIGH,
          responsibleEmployeeId: mechanic,
        },
        CHIEF,
      )
    ).id;

    bot = new Bot<BotContext>('90002:test-token-never-sent');
    bot.use(async (ctx, next) => {
      ctx.employee = person;
      ctx.access = employeeAccess(person.status);
      ctx.locale = 'en';
      ctx.t = t;
      await next();
    });
    bot.use(
      maintenanceComposer({
        ...services,
        store: new InMemoryShortTermStore(),
        logger: createLogger({ LOG_LEVEL: 'error', NODE_ENV: 'test' }),
      }),
    );
    bot.on('message', () => undefined);
    await bot.init();
  });

  async function plannedWork(
    photoOnSecond: boolean,
    materials: PlanContent['materials'] = [],
  ): Promise<string> {
    const plan = await services.plans.create(
      machineId,
      {
        title: 'Monthly lubrication',
        intervalUnit: IntervalUnit.MONTH,
        intervalCount: 1,
        anchorMode: AnchorMode.FROM_COMPLETION,
        firstDueOn: '2026-12-01',
        sourceKind: PlanSourceKind.PLANT_DECISION,
        sourceDocumentId: null,
        sourceNote: 'Plant decision',
        estimatedMinutes: 30,
        requiresStop: true,
        assigneeEmployeeId: mechanic,
        reminderDays: null,
        operations: [
          { text: 'Lubricate the cam', photoRequired: false },
          { text: 'Check the chain', photoRequired: photoOnSecond },
        ],
        materials,
      },
      CHIEF,
    );
    await services.plans.publish(plan.id, CHIEF);
    return one(await testDb.db.select().from(workOrders).where(eq(workOrders.planId, plan.id))).id;
  }

  async function status(id: string) {
    return one(await testDb.db.select().from(workOrders).where(eq(workOrders.id, id))).status;
  }

  it('walks a planned maintenance from the card to review, with a reason and a photo', async () => {
    const id = await plannedWork(true);
    await press(maintenanceCallback(MaintenanceCallbackAction.LIST));
    expect(lastScreen().buttons).toContain(maintenanceCallback(MaintenanceCallbackAction.OPEN, id));

    await press(maintenanceCallback(MaintenanceCallbackAction.START, id));
    expect(await status(id)).toBe(WorkStatus.IN_PROGRESS);
    expect(lastScreen().text).toContain('Operation 1 of 2');

    await press(maintenanceCallback(MaintenanceCallbackAction.ANSWER, id, '1.a'));
    expect(lastScreen().text).toBe(t.maintenance.bot.reasonPrompt);
    await send({ text: 'No cam on this model' });
    expect(lastScreen().text).toContain('Operation 2 of 2');

    await press(maintenanceCallback(MaintenanceCallbackAction.ANSWER, id, '2.d'));
    expect(lastScreen().text).toBe(t.maintenance.bot.photoPrompt);
    await send({
      photo: [{ file_id: 'chain', file_unique_id: 'chain-u', width: 800, height: 600 }],
    });
    const answers = await testDb.db
      .select({
        result: workOrderOperationResults.result,
        media: workOrderOperationResults.mediaObjectId,
      })
      .from(workOrderOperationResults)
      .where(eq(workOrderOperationResults.workOrderId, id));
    expect(answers.map((answer) => answer.result).sort()).toEqual([
      OperationResult.DONE,
      OperationResult.NOT_APPLICABLE,
    ]);
    expect(answers.some((answer) => answer.media !== null)).toBe(true);
    expect(lastScreen().buttons).toContain(
      maintenanceCallback(MaintenanceCallbackAction.SUBMIT, id),
    );

    await press(maintenanceCallback(MaintenanceCallbackAction.SUBMIT, id));
    expect(await status(id)).toBe(WorkStatus.IN_REVIEW);
  });

  it('checks what is missing in a list and confirms the materials used (FR-044, FR-051)', async () => {
    const id = await plannedWork(false, [
      {
        kind: MaterialKind.MATERIAL,
        name: 'Grease',
        quantity: 0.2,
        unit: 'kg',
        mode: MaterialMode.EVERY_CYCLE,
      },
      {
        kind: MaterialKind.TOOL,
        name: 'Gloves',
        quantity: 2,
        unit: 'pcs',
        mode: MaterialMode.IF_NEEDED,
      },
    ]);
    const missing = (arg?: string) =>
      maintenanceCallback(MaintenanceCallbackAction.MISSING, id, arg);
    await press(missing());
    expect(lastScreen().buttons).toEqual(
      expect.arrayContaining([missing('m1'), missing('m2'), missing('s0'), missing('w0')]),
    );
    await press(missing('s0'));
    expect(toasts()).toContain(t.maintenance.bot.missingNoneSelected);
    await press(missing('m1'));
    expect(lastScreen().buttons).toEqual(expect.arrayContaining([missing('m0'), missing('m3')]));
    await press(missing('w1'));
    expect(lastScreen().text).toBe(t.maintenance.bot.missingPrompt);
    await send({ text: 'rags' });
    const reported = one(await testDb.db.select().from(workOrders).where(eq(workOrders.id, id)));
    expect(reported.readiness).toBe('MISSING');
    expect(reported.readinessNote).toBe('Grease 0.2 kg; rags');

    await press(maintenanceCallback(MaintenanceCallbackAction.START, id));
    await press(maintenanceCallback(MaintenanceCallbackAction.ANSWER, id, '1.d'));
    await press(maintenanceCallback(MaintenanceCallbackAction.ANSWER, id, '2.d'));
    await press(maintenanceCallback(MaintenanceCallbackAction.SUBMIT, id));
    expect(lastScreen().text).toContain(t.maintenance.bot.usedTitle);
    expect(lastScreen().buttons).toEqual(
      expect.arrayContaining([
        maintenanceCallback(MaintenanceCallbackAction.SUBMIT, id, 'p'),
        maintenanceCallback(MaintenanceCallbackAction.SUBMIT, id, 'w'),
      ]),
    );
    expect(await status(id)).toBe(WorkStatus.IN_PROGRESS);
    await press(maintenanceCallback(MaintenanceCallbackAction.SUBMIT, id, 'w'));
    expect(lastScreen().text).toBe(t.maintenance.bot.usedPrompt);
    await send({ text: 'Grease 0.1 kg' });
    const submitted = one(await testDb.db.select().from(workOrders).where(eq(workOrders.id, id)));
    expect(submitted.status).toBe(WorkStatus.IN_REVIEW);
    expect(submitted.partsUsed).toBe('Grease 0.1 kg');
  });

  it('a stale button explains itself and redraws the current card', async () => {
    const id = await plannedWork(false);
    await press(maintenanceCallback(MaintenanceCallbackAction.SUBMIT, id));
    expect(toasts()).toContain(t.maintenance.bot.errors.WORK_TRANSITION_NOT_ALLOWED);
    expect(lastScreen().buttons).toContain(
      maintenanceCallback(MaintenanceCallbackAction.START, id),
    );
    expect(await status(id)).toBe(WorkStatus.ASSIGNED);
  });

  it('accepts a repair, finishes it with a summary and never offers a release button', async () => {
    await services.emergency.createFromPanel(
      machineId,
      { description: 'Paper feed jam', stoppedWork: true, safety: false },
      { actor: CHIEF, now: new Date() },
    );
    const id = one(
      await testDb.db.select().from(workOrders).where(eq(workOrders.equipmentId, machineId)),
    ).id;
    await press(maintenanceCallback(MaintenanceCallbackAction.OPEN, id));
    expect(lastScreen().buttons).toEqual(
      expect.arrayContaining([
        maintenanceCallback(MaintenanceCallbackAction.ACCEPT, id),
        maintenanceCallback(MaintenanceCallbackAction.DECLINE, id),
      ]),
    );
    await press(maintenanceCallback(MaintenanceCallbackAction.ACCEPT, id));
    await press(maintenanceCallback(MaintenanceCallbackAction.START, id));
    await press(maintenanceCallback(MaintenanceCallbackAction.FINISH, id));
    expect(lastScreen().text).toBe(t.maintenance.bot.summaryPrompt);
    await send({ text: 'Replaced the feed roller' });

    expect(await status(id)).toBe(WorkStatus.COMPLETED);
    const releaseLike = lastScreen().buttons.filter((data) => /release/i.test(data));
    expect(releaseLike).toEqual([]);
  });
});
