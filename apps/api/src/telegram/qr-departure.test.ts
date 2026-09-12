import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'grammy';
import { z } from 'zod';
import type { Update } from 'grammy/types';
import {
  activityIntervals,
  domainEvents,
  employees,
  eq,
  notificationOutbox,
  presenceSessions,
  qrChallenges,
  qrChallengeUses,
  qrTerminals,
  shiftSessions,
  shiftSummaries,
  sites,
  sql,
  telegramAccounts,
} from '@vakhta/db';
import { DEFAULT_ATTENDANCE_WINDOW, addMonths, businessDateOf } from '@vakhta/domain';
import { assignmentAcknowledgements } from '@vakhta/db';
import { hashChallengeToken } from '@vakhta/domain/node';
import { messages } from '@vakhta/i18n';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { BonusService } from '../bonus/bonus.service.js';
import { employeeActor } from '../common/actor.js';
import * as employeeLock from '../common/employee-lock.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { HandoverChanges } from '../handover/handover-changes.js';
import { HandoverRepository } from '../handover/handover.repository.js';
import { HandoverService } from '../handover/handover.service.js';
import { MediaService } from '../handover/media.service.js';
import { ActivationService } from '../identity/activation.service.js';
import { EmployeesService } from '../identity/employees.service.js';
import { IncidentChanges } from '../incidents/incident-changes.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { InMemoryShortTermStore } from '../infra/short-term-store.js';
import { TimerScheduler } from '../infra/timers.queue.js';
import { createLogger } from '../logger.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrgService } from '../org/org.service.js';
import { CorrectionsService } from '../requests/corrections.service.js';
import { RequestChanges } from '../requests/request-changes.js';
import { RequestsService } from '../requests/requests.service.js';
import { ScheduleService } from '../scheduling/schedule.service.js';
import { TemplatesService } from '../scheduling/templates.service.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService } from '../shift/shift.service.js';
import { createBot } from './bot.factory.js';
import { acknowledgementCallback } from './schedule-acknowledgement.js';
import { UpdateDedup } from './update-dedup.js';

const TELEGRAM_USER_ID = 10001;
const TOKEN = 'A'.repeat(22);
const BOT_INFO = {
  id: 90001,
  is_bot: true,
  first_name: 'Departure test bot',
  username: 'departure_test_bot',
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
const OPTIONS = {
  breakMinutes: 15,
  mealMinutes: 30,
  serviceTimeMinutes: 30,
  downtimeEscalationMinutes: 15,
  graceMinutes: 10,
  earlyStartWindowMinutes: 30,
  overtimeThresholdMinutes: 15,
  defaultTimezone: 'Europe/Kyiv',
};

function departureUpdate(presenceId: string): Update {
  return {
    update_id: 70001,
    callback_query: {
      id: 'departure-confirmation',
      from: {
        id: TELEGRAM_USER_ID,
        is_bot: false,
        first_name: 'Test employee',
        language_code: 'en',
      },
      chat_instance: 'test-private-chat',
      data: `dep:${TOKEN}:${presenceId}`,
      message: {
        message_id: 42,
        date: Math.floor(Date.now() / 1000),
        chat: { id: TELEGRAM_USER_ID, type: 'private', first_name: 'Test employee' },
        from: BOT_INFO,
        text: 'Confirm departure',
      },
    },
  };
}

/** Real application services and PostgreSQL; only Telegram transport and Redis timers are fakes. */
function services(testDb: TestDatabase) {
  const db = testDb.db;
  const events = new EventStore();
  const audit = new AuditLog();
  const notifications = new NotificationsService();
  const timers = new TimerScheduler();
  const store = new InMemoryShortTermStore();
  const shiftChanges = new ShiftChanges();
  const handoverChanges = new HandoverChanges();
  const incidentChanges = new IncidentChanges();
  const requestChanges = new RequestChanges();
  const attendance = new AttendanceService(db, events, audit, {
    window: DEFAULT_ATTENDANCE_WINDOW,
  });
  const shift = new ShiftService(
    db,
    events,
    audit,
    notifications,
    attendance,
    shiftChanges,
    timers,
    OPTIONS,
  );
  const employeeService = new EmployeesService(db, events, audit, notifications);
  const org = new OrgService(db, events, audit);
  const schedule = new ScheduleService(
    db,
    events,
    audit,
    org,
    new TemplatesService(db, events, audit, org),
    notifications,
    timers,
    {
      shiftReminderMinutes: 120,
      ackReminderHours: 24,
      defaultTimezone: OPTIONS.defaultTimezone,
    },
  );
  const media = new MediaService(db, audit, { linkTtlSeconds: 300 });
  const incidents = new IncidentsService(
    db,
    events,
    audit,
    notifications,
    shift,
    incidentChanges,
    media,
    timers,
    {
      sla: { normalMinutes: 30, criticalMinutes: 10, safetyMinutes: 0 },
    },
  );
  const handover = new HandoverService(
    db,
    events,
    audit,
    notifications,
    shift,
    incidents,
    media,
    new HandoverRepository(),
    handoverChanges,
    { reviewWindowMinutes: 30 },
  );
  const requests = new RequestsService(
    db,
    events,
    audit,
    notifications,
    schedule,
    media,
    new CorrectionsService(db, events, audit, shift),
    requestChanges,
  );
  const bonus = new BonusService(db, events, audit, notifications, OPTIONS, {
    appealWindowDays: 7,
  });
  const bot = createBot('90001:test-token-never-sent', {
    employees: employeeService,
    activation: new ActivationService(db, store, events, audit, employeeService, {
      pepper: 'test-only',
      ttlHours: 24,
      maxAttempts: 5,
      pendingTtlSeconds: 300,
      botUsername: BOT_INFO.username,
    }),
    schedule,
    attendance,
    shift,
    incidents,
    handover,
    requests,
    bonus,
    store,
    dedup: new UpdateDedup(db),
    appealWindowDays: 7,
    defaultTimezone: OPTIONS.defaultTimezone,
    logger: createLogger({ LOG_LEVEL: 'error', NODE_ENV: 'test' }),
  });
  return {
    attendance,
    shift,
    bot,
    store,
    incidents,
    schedule,
    org,
    templates: new TemplatesService(db, events, audit, org),
  };
}

describe('Telegram departure callback: QR and shift/presence consistency', () => {
  let testDb: TestDatabase;
  let app: ReturnType<typeof services>;
  let employeeId: string;
  let terminalId: string;
  let sessionId: string;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE employees, sites, processed_telegram_updates, idempotency_keys, notification_outbox CASCADE`,
    );
    // Api instances are copied per update by grammY, so intercept the transport methods on their prototype.
    vi.spyOn(Api.prototype, 'getMe').mockResolvedValue(BOT_INFO);
    vi.spyOn(Api.prototype, 'answerCallbackQuery').mockResolvedValue(true);
    vi.spyOn(Api.prototype, 'editMessageText').mockResolvedValue(true);
    vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({
      message_id: 43,
      date: Math.floor(Date.now() / 1000),
      chat: { id: TELEGRAM_USER_ID, type: 'private', first_name: 'Test employee' },
      text: 'Rendered screen',
    });
    app = services(testDb);
    await app.bot.init();
    const [employee] = await testDb.db
      .insert(employees)
      .values({
        personnelNumber: 'qr-departure',
        fullName: 'Departure test employee',
        status: 'ACTIVE',
        locale: 'en',
      })
      .returning();
    if (!employee) throw new Error('Employee fixture was not inserted');
    employeeId = employee.id;
    await testDb.db
      .insert(telegramAccounts)
      .values({ employeeId, telegramUserId: TELEGRAM_USER_ID });
    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'departure', name: 'Departure test site', timezone: OPTIONS.defaultTimezone })
      .returning();
    if (!site) throw new Error('Site fixture was not inserted');
    const [terminal] = await testDb.db
      .insert(qrTerminals)
      .values({ siteId: site.id, name: 'Main' })
      .returning();
    if (!terminal) throw new Error('Terminal fixture was not inserted');
    terminalId = terminal.id;
    const arrived = await app.attendance.reserveCheckIn(
      { employeeId, action: 'ARRIVE', reasonCode: 'TERMINAL_DOWN' },
      { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER' },
    );
    expect(arrived.ok).toBe(true);
    const meta = { actor: employeeActor(employeeId), source: 'TELEGRAM' as const };
    const started = await app.shift.start(
      employeeId,
      { idempotencyKey: 'departure-test:start' },
      meta,
    );
    if (!started.ok) throw new Error(`Shift fixture failed: ${started.error}`);
    sessionId = started.session.id;
    for (const action of [
      'START_WORK',
      'START_CLEANING',
      'CLEANING_DONE',
      'SUBMIT_HANDOVER',
    ] as const) {
      const current = await app.shift.activeSession(employeeId);
      if (!current) throw new Error('Shift fixture unexpectedly closed');
      const result = await app.shift.transition(
        employeeId,
        {
          action,
          expectedVersion: current.version,
          idempotencyKey: `departure-test:${action}`,
        },
        meta,
      );
      if (!result.ok) throw new Error(`Shift fixture action ${action} failed: ${result.error}`);
    }
    expect(await app.shift.activeSession(employeeId)).toMatchObject({ state: 'READY_TO_CLOSE' });
  });

  describe('snapshot acknowledgement callbacks', () => {
    const month = addMonths(businessDateOf(new Date(), OPTIONS.defaultTimezone).slice(0, 7), 1);
    const actor = { type: 'WEB_USER', id: null, role: 'PRODUCTION_HEAD' } as const;

    async function scheduleFixture() {
      const site = await app.org.createSite(
        { code: 'schedule', name: 'Schedule site', timezone: OPTIONS.defaultTimezone },
        actor,
      );
      const unit = await app.org.createOrgUnit({ siteId: site.id, name: 'Schedule unit' }, actor);
      const template = await app.templates.create(
        {
          siteId: site.id,
          code: 'DAY',
          name: 'Day',
          localStart: '08:00',
          localEnd: '20:00',
          isNight: false,
        },
        actor,
      );
      return async (periodMonth = month) => {
        const version = await app.schedule.createVersion(
          { siteId: site.id, orgUnitId: unit.id, periodMonth },
          actor,
        );
        await app.schedule.putAssignments(
          version.id,
          {
            items: [
              {
                employeeId,
                templateId: template.id,
                businessDate: `${periodMonth}-01`,
                kind: 'REGULAR',
              },
            ],
          },
          actor,
        );
        await app.schedule.submit(version.id, actor);
        return app.schedule.publish(version.id, { changeReason: 'Test publication' }, actor);
      };
    }

    async function callback(data: string, updateId = 90001) {
      const update = departureUpdate('unused');
      if (!update.callback_query) throw new Error('Missing callback fixture');
      await app.bot.handleUpdate({
        ...update,
        update_id: updateId,
        callback_query: { ...update.callback_query, data },
      });
    }

    function renderedCallbacks() {
      const last = vi.mocked(Api.prototype.editMessageText).mock.calls.at(-1);
      const options = z
        .object({
          reply_markup: z.object({
            inline_keyboard: z.array(z.array(z.object({ callback_data: z.string().optional() }))),
          }),
        })
        .safeParse(last?.[3]);
      return options.success
        ? options.data.reply_markup.inline_keyboard
            .flat()
            .flatMap((button) => (button.callback_data ? [button.callback_data] : []))
        : [];
    }

    function renderedAcknowledgement() {
      return renderedCallbacks().find((data) => data.startsWith('ack2:'));
    }

    it.each(['en', 'uk', 'ru'] as const)(
      'refreshes legacy ack:all in %s without writing acknowledgements',
      async (locale) => {
        const publish = await scheduleFixture();
        await publish();
        await testDb.db.update(employees).set({ locale }).where(eq(employees.id, employeeId));
        await callback('ack:all');
        expect(vi.mocked(Api.prototype.answerCallbackQuery)).toHaveBeenCalledWith(
          expect.any(String),
          { text: messages(locale).schedule.ackRefresh, show_alert: true },
          undefined,
        );
        expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([]);
        expect(vi.mocked(Api.prototype.editMessageText)).toHaveBeenCalled();
      },
    );

    it('refreshes an old Plan after publication, confirms only that month, and accepts a repeat tap', async () => {
      const publish = await scheduleFixture();
      await publish();
      await callback(`plan:${month}`);
      const oldButton = renderedAcknowledgement();
      if (!oldButton) throw new Error('Plan acknowledgement button was not rendered');
      expect(Buffer.byteLength(oldButton)).toBe(58);
      const current = await publish();
      await callback(oldButton, 90002);
      expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([]);
      expect(vi.mocked(Api.prototype.answerCallbackQuery).mock.calls.at(-1)?.[1]).toMatchObject({
        text: messages('en').schedule.ackRefresh,
      });
      const freshButton = renderedAcknowledgement();
      if (!freshButton) throw new Error('Refreshed acknowledgement button was not rendered');
      expect(freshButton).not.toBe(oldButton);
      await publish(addMonths(month, 1));
      await callback(freshButton, 90003);
      expect(vi.mocked(Api.prototype.answerCallbackQuery).mock.calls.at(-1)?.[1]).toMatchObject({
        text: messages('en').schedule.ackDone,
      });
      expect(renderedAcknowledgement()).toBeUndefined();
      await callback(freshButton, 90004);
      expect(vi.mocked(Api.prototype.answerCallbackQuery).mock.calls.at(-1)?.[1]).toMatchObject({
        text: messages('en').schedule.ackNothing,
      });
      expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([
        expect.objectContaining({ employeeId, scheduleVersionId: current.id }),
      ]);
      expect(renderedCallbacks()).toContain(`plan:${addMonths(month, 1)}`);
    });

    it('rejects an old Home snapshot when another month has been published', async () => {
      const publish = await scheduleFixture();
      await publish();
      const button = acknowledgementCallback(await app.schedule.homeAcknowledgement(employeeId));
      if (!button) throw new Error('Home acknowledgement button was not prepared');
      expect(Buffer.byteLength(button)).toBe(50);
      await publish(addMonths(month, 1));
      await callback(button);
      expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([]);
      expect(vi.mocked(Api.prototype.answerCallbackQuery).mock.calls.at(-1)?.[1]).toMatchObject({
        text: messages('en').schedule.ackRefresh,
      });
    });

    it.each([`ack2:m:2026-13:${'A'.repeat(43)}`, 'ack2:h:malformed'])(
      'refreshes malformed callback %s without a write',
      async (data) => {
        const publish = await scheduleFixture();
        await publish();
        await callback(data);
        expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([]);
        expect(vi.mocked(Api.prototype.answerCallbackQuery).mock.calls.at(-1)?.[1]).toMatchObject({
          text: messages('en').schedule.ackRefresh,
        });
      },
    );
  });

  async function issueChallenge(expiresAt: Date): Promise<void> {
    await testDb.db.insert(qrChallenges).values({
      terminalId,
      tokenHash: hashChallengeToken(TOKEN),
      issuedAt: new Date(Date.now() - 120_000),
      expiresAt,
    });
  }

  async function recordedState() {
    const [session] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.id, sessionId));
    const presence = await testDb.db
      .select()
      .from(presenceSessions)
      .where(eq(presenceSessions.employeeId, employeeId));
    const intervals = await testDb.db
      .select()
      .from(activityIntervals)
      .where(eq(activityIntervals.shiftSessionId, sessionId))
      .orderBy(activityIntervals.startedAt);
    const summaries = await testDb.db
      .select()
      .from(shiftSummaries)
      .where(eq(shiftSummaries.shiftSessionId, sessionId));
    const events = await testDb.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.shiftSessionId, sessionId))
      .orderBy(domainEvents.id);
    const uses = await testDb.db
      .select()
      .from(qrChallengeUses)
      .where(eq(qrChallengeUses.employeeId, employeeId));
    const notifications = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, employeeId));
    return { session, presence, intervals, summaries, events, uses, notifications };
  }

  it('rejects an expired QR without closing the ready shift or its open presence', async () => {
    await issueChallenge(new Date(Date.now() - 60_000));
    const before = await recordedState();

    await app.bot.handleUpdate(
      departureUpdate((await app.attendance.openPresence(employeeId))!.id),
    );

    expect(vi.mocked(Api.prototype.editMessageText).mock.calls.map((call) => call[2])).toContain(
      messages('en').attendance.failures.CHALLENGE_EXPIRED,
    );
    const after = await recordedState();
    expect.soft(after.session).toEqual(before.session);
    expect.soft(after.presence).toEqual(before.presence);
    expect.soft(after.intervals).toEqual(before.intervals);
    expect.soft(after.summaries).toEqual(before.summaries);
    expect.soft(after.events).toEqual(before.events);
    expect.soft(after.uses).toEqual(before.uses);
    expect.soft(after.notifications).toEqual(before.notifications);
  });

  it('rolls back attendance and shift records when closing the shift fails, then allows retry', async () => {
    await issueChallenge(new Date(Date.now() + 60_000));
    const before = await recordedState();
    const append = EventStore.prototype.append;
    const fault = vi.spyOn(EventStore.prototype, 'append').mockImplementation(async function (
      this: EventStore,
      tx,
      input,
    ) {
      if (input.type === 'SHIFT_CLOSED') throw new Error('Injected shift close failure');
      return append.call(this, tx, input);
    });

    await expect(app.shift.departByQr(employeeId, TOKEN, 'atomic-exit')).rejects.toThrow(
      'Injected shift close failure',
    );
    expect(await recordedState()).toEqual(before);
    fault.mockRestore();

    expect(await app.shift.departByQr(employeeId, TOKEN, 'atomic-exit')).toMatchObject({
      kind: 'CHECK_IN',
      result: { ok: true, presence: { status: 'CLOSED' } },
    });
  });

  it('replays the whole committed departure even after the QR expires', async () => {
    await issueChallenge(new Date(Date.now() + 60_000));
    const first = await app.shift.departByQr(employeeId, TOKEN, 'replayed-exit');
    const committed = await recordedState();

    const replay = await app.shift.departByQr(
      employeeId,
      TOKEN,
      'replayed-exit',
      new Date(Date.now() + 3_600_000),
    );

    expect(first).toMatchObject({ kind: 'CHECK_IN', result: { ok: true, alreadyRecorded: false } });
    expect(replay).toMatchObject({ kind: 'CHECK_IN', result: { ok: true, alreadyRecorded: true } });
    expect(await recordedState()).toEqual(committed);
  });

  it('serializes concurrent confirmations of the same departure', async () => {
    await issueChallenge(new Date(Date.now() + 60_000));
    const outcomes = await Promise.all([
      app.shift.departByQr(employeeId, TOKEN, 'concurrent-exit'),
      app.shift.departByQr(employeeId, TOKEN, 'concurrent-exit'),
    ]);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'CHECK_IN',
          result: expect.objectContaining({ ok: true, alreadyRecorded: false }),
        }),
        expect.objectContaining({
          kind: 'CHECK_IN',
          result: expect.objectContaining({ ok: true, alreadyRecorded: true }),
        }),
      ]),
    );
    const recorded = await recordedState();
    expect(recorded.events.filter((event) => event.type === 'SHIFT_CLOSED')).toHaveLength(1);
    expect(recorded.summaries).toHaveLength(1);
  });

  it('allows a departure while a master is finalizing the same shift', async () => {
    await issueChallenge(new Date(Date.now() + 60_000));
    const current = await app.shift.activeSession(employeeId);
    if (!current) throw new Error('Expected an active shift');
    let masterReached = () => {};
    const masterAtClose = new Promise<void>((resolve) => {
      masterReached = resolve;
    });
    let employeeLocked = () => {};
    const departureHasLock = new Promise<void>((resolve) => {
      employeeLocked = resolve;
    });
    const append = EventStore.prototype.append;
    vi.spyOn(EventStore.prototype, 'append').mockImplementation(async function (
      this: EventStore,
      tx,
      input,
    ) {
      if (input.type === 'SHIFT_CLOSED' && input.source === 'WEB') {
        masterReached();
        await departureHasLock;
      }
      return append.call(this, tx, input);
    });
    const lock = employeeLock.lockEmployee;
    vi.spyOn(employeeLock, 'lockEmployee').mockImplementation(async (tx, id) => {
      await lock(tx, id);
      employeeLocked();
    });

    const closing = app.shift.masterTransition(
      sessionId,
      {
        action: 'CLOSE_SHIFT',
        expectedVersion: current.version,
        idempotencyKey: 'master-close',
        comment: 'Confirmed departure',
      },
      { type: 'WEB_USER', id: null, role: 'SHIFT_MASTER' },
    );
    await masterAtClose;
    const departure = app.shift.departByQr(employeeId, TOKEN, 'concurrent-master-exit');
    const [masterResult, departureResult] = await Promise.all([closing, departure]);

    expect(masterResult.ok).toBe(true);
    expect(departureResult).toMatchObject({ kind: 'CHECK_IN', result: { ok: true } });
    const recorded = await recordedState();
    expect(recorded.session?.state).toBe('SHIFT_CLOSED');
    expect(recorded.presence[0]?.status).toBe('CLOSED');
    expect(recorded.summaries).toHaveLength(1);
  });

  it('closes the ready shift and its presence after a valid departure confirmation', async () => {
    await issueChallenge(new Date(Date.now() + 60_000));

    await app.bot.handleUpdate(
      departureUpdate((await app.attendance.openPresence(employeeId))!.id),
    );

    const recorded = await recordedState();
    expect(recorded.session).toMatchObject({ state: 'SHIFT_CLOSED', endedAt: expect.any(Date) });
    expect(recorded.presence).toHaveLength(1);
    expect(recorded.presence[0]).toMatchObject({ status: 'CLOSED', departedAt: expect.any(Date) });
    expect(recorded.summaries).toHaveLength(1);
  });
  it('shows the actual automatic-closure screen when departure reaches the deadline', async () => {
    const session = await app.shift.activeSession(employeeId);
    const presence = await app.attendance.openPresence(employeeId);
    if (!session?.planEndAt || !presence) throw new Error('Missing planned shift or presence');
    const at = new Date(session.planEndAt.getTime() + 120 * 60_000);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    try {
      await issueChallenge(new Date(at.getTime() + 60_000));
      await app.bot.handleUpdate(departureUpdate(presence.id));
      const text = vi
        .mocked(Api.prototype.editMessageText)
        .mock.calls.map((call) => call[2])
        .join('\n');
      expect(text).toContain(messages('en').shift.estimatedClosure);
      expect(text).not.toContain(messages('en').attendance.failures.NOT_ARRIVED);
      const recorded = await recordedState();
      expect(recorded.session).toMatchObject({ state: 'SHIFT_CLOSED', endedAt: session.planEndAt });
      expect(recorded.presence[0]).toMatchObject({
        status: 'NEEDS_CLARIFICATION',
        departedAt: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([undefined, 'Belt is stuck'])(
    'requires the incident photo and keeps optional caption %s',
    async (caption) => {
      const pendingKey = `incident:pending:${TELEGRAM_USER_ID}`;
      await app.store.set(
        pendingKey,
        JSON.stringify({
          reasonCode: 'BREAKDOWN',
          reasonLabel: 'Breakdown',
          requiresPhoto: true,
          step: 'photo',
        }),
        300,
      );
      const report = vi.spyOn(app.incidents, 'report').mockResolvedValue({
        incidentId: 'test-incident',
        severity: 'NORMAL',
        downtimeStarted: false,
        downtimeError: null,
        serverTime: new Date().toISOString(),
      });
      const callback = async (data: string, updateId: number) => {
        const update = departureUpdate('unused');
        if (!update.callback_query) throw new Error('Missing callback fixture');
        await app.bot.handleUpdate({
          ...update,
          update_id: updateId,
          callback_query: { ...update.callback_query, data },
        });
      };
      await callback('inc:skip', 80001);
      expect(report).not.toHaveBeenCalled();
      expect(JSON.parse((await app.store.get(pendingKey)) ?? '{}').step).toBe('photo');
      await callback('inc:stop:0', 80002);
      expect(report).not.toHaveBeenCalled();
      expect(JSON.parse((await app.store.get(pendingKey)) ?? '{}').step).toBe('photo');
      await app.bot.handleUpdate({
        update_id: 80003,
        message: {
          message_id: 77,
          date: Math.floor(Date.now() / 1000),
          from: { id: TELEGRAM_USER_ID, is_bot: false, first_name: 'Test employee' },
          chat: { id: TELEGRAM_USER_ID, type: 'private', first_name: 'Test employee' },
          photo: [
            { file_id: 'test-photo', file_unique_id: 'test-unique', width: 1280, height: 960 },
          ],
          ...(caption ? { caption } : {}),
        },
      });
      await callback('inc:stop:0', 80004);
      expect(report).toHaveBeenCalledWith(
        employeeId,
        expect.objectContaining({
          photoFileId: 'test-photo',
          photoFileUniqueId: 'test-unique',
          ...(caption ? { comment: caption } : {}),
        }),
        expect.anything(),
      );
      expect(report.mock.calls[0]?.[1].comment).toBe(caption);
      expect(await app.store.get(pendingKey)).toBeNull();
    },
  );
});
