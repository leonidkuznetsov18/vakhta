import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  checklistDefinitionPositions,
  checklistDefinitions,
  domainEvents,
  downtimeIncidents,
  employeePositions,
  employees,
  eq,
  handoverRecords,
  mediaObjects,
  notificationOutbox,
  orgUnits,
  positions,
  reasonCodes,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftSessions,
  shiftTemplates,
  sites,
  sql,
} from '@vakhta/db';
import {
  DEFAULT_ATTENDANCE_WINDOW,
  DEFAULT_CHECKLIST_KEYS,
  HANDOVER_ANGLES,
  defaultChecklistItems,
} from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { AttendanceService } from '../attendance/attendance.service.js';
import { employeeActor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { IncidentChanges } from '../incidents/incident-changes.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { InMemoryObjectStorage } from '../infra/object-storage.js';
import { InMemoryTimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ShiftChanges } from '../shift/shift-changes.js';
import { ShiftService } from '../shift/shift.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { HandoverChanges } from './handover-changes.js';
import { HandoverRepository } from './handover.repository.js';
import { HandoverService } from './handover.service.js';
import { MediaService } from './media.service.js';

const MASTER_ID = 'a0000000-0000-4000-8000-00000000aaaa';
const MASTER = { type: 'WEB_USER', id: MASTER_ID, role: 'SHIFT_MASTER', label: 'master' } as const;
let n = 0;
const key = () => `hv-${++n}`;

describe('handover: прибирання, чек-лист, фото, передача і приймання (ТЗ 5.6–5.9)', () => {
  let testDb: TestDatabase;
  let shift: ShiftService;
  let attendance: AttendanceService;
  let handover: HandoverService;
  let timers: InMemoryTimerScheduler;
  let dayEmployee: string;
  let nightEmployee: string;
  let zoneId: string;
  let operatorId: string;
  let planEnd: Date;

  beforeAll(async () => {
    testDb = await startTestDatabase();
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE handover_resolutions, handover_reviews, handover_media, checklist_answers, handover_records, media_objects, checklist_definitions, incident_status_history, downtime_reports, downtime_incidents, shift_summaries, activity_intervals, shift_sessions, idempotency_keys, notification_outbox, presence_sessions, shift_assignments, schedule_versions, shift_templates, responsibility_zones, employee_positions, positions, employees, org_units, sites, reason_codes CASCADE`,
    );
    timers = new InMemoryTimerScheduler();
    const events = new EventStore();
    const audit = new AuditLog();
    const notifications = new NotificationsService();
    attendance = new AttendanceService(testDb.db, events, audit, {
      window: DEFAULT_ATTENDANCE_WINDOW,
    });
    const repository = new HandoverRepository();
    shift = new ShiftService(
      testDb.db,
      events,
      audit,
      notifications,
      attendance,
      new ShiftChanges(),
      timers,
      {
        breakMinutes: 15,
        mealMinutes: 30,
        serviceTimeMinutes: 30,
        downtimeEscalationMinutes: 15,
        graceMinutes: 10,
        earlyStartWindowMinutes: 30,
        overtimeThresholdMinutes: 15,
        defaultTimezone: 'Europe/Kyiv',
        cleaningReminderMinutes: 30,
      },
      repository,
    );
    const incidents = new IncidentsService(
      testDb.db,
      events,
      audit,
      notifications,
      shift,
      new IncidentChanges(),
      timers,
      {
        sla: { normalMinutes: 60, criticalMinutes: 30, safetyMinutes: 0 },
        duplicateWindowMinutes: 60,
      },
    );
    const media = new MediaService(
      testDb.db,
      audit,
      timers,
      { linkTtlSeconds: 300 },
      new InMemoryObjectStorage(),
    );
    handover = new HandoverService(
      testDb.db,
      events,
      audit,
      notifications,
      shift,
      incidents,
      media,
      repository,
      new HandoverChanges(),
      timers,
      { reviewWindowMinutes: 30 },
    );

    const [site] = await testDb.db
      .insert(sites)
      .values({ code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' })
      .returning();
    const [unit] = await testDb.db
      .insert(orgUnits)
      .values({ siteId: site!.id, name: 'Цех' })
      .returning();
    const [zone] = await testDb.db
      .insert(responsibilityZones)
      .values({ siteId: site!.id, orgUnitId: unit!.id, code: 'A', name: 'Линия A' })
      .returning();
    zoneId = zone!.id;
    await testDb.db.insert(reasonCodes).values([
      { kind: 'HANDOVER', code: 'DIRT', label: 'Загрязнение' },
      {
        kind: 'HANDOVER',
        code: 'DAMAGE',
        label: 'Повреждение или течь',
        severity: 'CRITICAL',
        notifyMaster: true,
      },
      { kind: 'HANDOVER', code: 'OTHER', label: 'Другое', requiresComment: true },
    ]);
    const [tpl] = await testDb.db
      .insert(shiftTemplates)
      .values({
        siteId: site!.id,
        code: 'DAY',
        name: 'Дневная',
        localStart: '08:00',
        localEnd: '20:00',
      })
      .returning();
    const [version] = await testDb.db
      .insert(scheduleVersions)
      .values({
        siteId: site!.id,
        orgUnitId: unit!.id,
        periodMonth: '2026-10',
        versionNo: 1,
        status: 'PUBLISHED',
      })
      .returning();
    const people = await testDb.db
      .insert(employees)
      .values([
        { personnelNumber: '1', fullName: 'Иванов Иван' },
        { personnelNumber: '2', fullName: 'Петрова Ольга' },
      ])
      .returning();
    dayEmployee = people[0]!.id;
    nightEmployee = people[1]!.id;
    // Both employees are line operators; the position carries the default checklist of spec 5.6.
    const [operator] = await testDb.db
      .insert(positions)
      .values({ code: 'OPERATOR', name: 'Оператор' })
      .returning();
    operatorId = operator!.id;
    await testDb.db.insert(employeePositions).values(
      [dayEmployee, nightEmployee].map((employeeId) => ({
        employeeId,
        orgUnitId: unit!.id,
        positionId: operatorId,
        validFrom: new Date('2026-01-01T00:00:00Z'),
      })),
    );
    const t = messages().handover;
    const [byDefault] = await testDb.db
      .insert(checklistDefinitions)
      .values({
        name: t.defaultName,
        version: 1,
        items: defaultChecklistItems({ items: t.items, angles: t.angles }),
      })
      .returning();
    await testDb.db
      .insert(checklistDefinitionPositions)
      .values({ definitionId: byDefault!.id, positionId: operatorId });
    const start = new Date(Date.now() - 11 * 3_600_000);
    planEnd = new Date(start.getTime() + 12 * 3_600_000);
    await testDb.db.insert(shiftAssignments).values([
      {
        scheduleVersionId: version!.id,
        employeeId: dayEmployee,
        templateId: tpl!.id,
        businessDate: '2026-10-01',
        planStartAt: start,
        planEndAt: planEnd,
        orgUnitId: unit!.id,
        zoneId,
      },
      {
        scheduleVersionId: version!.id,
        employeeId: nightEmployee,
        templateId: tpl!.id,
        businessDate: '2026-10-01',
        planStartAt: new Date(planEnd.getTime() - 30 * 60_000),
        planEndAt: new Date(planEnd.getTime() + 11.5 * 3_600_000),
        orgUnitId: unit!.id,
        zoneId,
      },
    ]);
  });

  async function openShift(employeeId: string): Promise<void> {
    await attendance.reserveCheckIn(
      { employeeId, action: 'ARRIVE', reasonCode: 'TERMINAL_DOWN' },
      MASTER,
    );
    const started = await shift.start(
      employeeId,
      { idempotencyKey: key() },
      { actor: employeeActor(employeeId), source: 'TELEGRAM' },
    );
    expect(started.ok).toBe(true);
  }

  async function act(
    employeeId: string,
    action: 'START_WORK' | 'START_CLEANING' | 'CLEANING_DONE' | 'CONTINUE_WORK' | 'CLOSE_SHIFT',
  ) {
    const current = await shift.activeSession(employeeId);
    const r = await shift.transition(
      employeeId,
      { action, expectedVersion: current!.version, idempotencyKey: key() },
      { actor: employeeActor(employeeId), source: 'TELEGRAM' },
    );
    return r;
  }

  async function toHandover(employeeId: string): Promise<void> {
    await openShift(employeeId);
    await shift.acceptZone(employeeId, employeeActor(employeeId));
    expect((await act(employeeId, 'START_WORK')).ok).toBe(true);
    expect((await act(employeeId, 'START_CLEANING')).ok).toBe(true);
    expect((await act(employeeId, 'CLEANING_DONE')).ok).toBe(true);
  }

  async function fillAll(employeeId: string, opts: { skipPhoto?: boolean } = {}): Promise<void> {
    for (const itemKey of DEFAULT_CHECKLIST_KEYS) {
      await handover.answer(
        employeeId,
        itemKey === 'MESSAGE_NEXT'
          ? { itemKey, ok: true, note: 'Вентиль на линии подтекает, следите' }
          : { itemKey, ok: true },
        employeeActor(employeeId),
      );
    }
    if (opts.skipPhoto) return;
    for (const angle of HANDOVER_ANGLES) {
      await handover.attachPhoto(
        employeeId,
        {
          itemKey: `PHOTO_${angle}`,
          telegramFileId: `file-${angle}-${n}`,
          telegramFileUniqueId: `uniq-${angle}-${n}`,
          width: 1280,
          height: 960,
        },
        employeeActor(employeeId),
      );
    }
  }

  it('FR-CLN-01/02: старт планує нагадування про прибирання; CLEANING_DONE відкриває чернетку з чек-листом посади', async () => {
    await toHandover(dayEmployee);
    expect(timers.scheduled.map((s) => s.jobId.split('.')[0])).toContain('cleaning-reminder');
    const cleaning = timers.scheduled.find((s) => s.jobId.startsWith('cleaning-reminder'))!;
    expect(planEnd.getTime() - cleaning.fireAt.getTime()).toBe(30 * 60_000);

    const draft = await handover.current(dayEmployee);
    expect(draft).toMatchObject({ status: 'DRAFT', zoneName: 'Линия A', checklistVersion: 1 });
    expect(draft?.items.map((i) => i.key)).toEqual([
      ...DEFAULT_CHECKLIST_KEYS,
      'PHOTO_OVERVIEW',
      'PHOTO_SURFACES',
      'PHOTO_FLOOR',
    ]);
    expect(draft?.items.find((i) => i.key === 'MESSAGE_NEXT')?.kind).toBe('NOTE');
    expect(draft?.issues.filter((i) => i.code === 'ITEM_MISSING')).toHaveLength(8);
    expect(draft?.issues.filter((i) => i.code === 'PHOTO_MISSING')).toHaveLength(3);
    expect(await testDb.db.select().from(checklistDefinitions)).toHaveLength(1);
  });

  it('зміна без зони теж отримує чек-лист: звіт без приймаючого одразу йде майстру', async () => {
    await testDb.db
      .update(shiftAssignments)
      .set({ zoneId: null })
      .where(eq(shiftAssignments.employeeId, nightEmployee));
    await openShift(nightEmployee);
    expect((await act(nightEmployee, 'START_WORK')).ok).toBe(true);
    expect((await act(nightEmployee, 'START_CLEANING')).ok).toBe(true);
    expect((await act(nightEmployee, 'CLEANING_DONE')).ok).toBe(true);

    const draft = await handover.current(nightEmployee);
    expect(draft).toMatchObject({ status: 'DRAFT', zoneId: null, zoneName: null });
    expect(draft?.issues.filter((i) => i.code === 'PHOTO_MISSING')).toHaveLength(3);

    // the shift cannot be handed over without the report
    const session = await shift.activeSession(nightEmployee);
    expect(
      await shift.transition(
        nightEmployee,
        { action: 'SUBMIT_HANDOVER', expectedVersion: session!.version, idempotencyKey: key() },
        { actor: employeeActor(nightEmployee), source: 'TELEGRAM' },
      ),
    ).toMatchObject({ ok: false, error: 'HANDOVER_INCOMPLETE' });

    await fillAll(nightEmployee);
    const submitted = await handover.submit(
      nightEmployee,
      { idempotencyKey: key() },
      employeeActor(nightEmployee),
    );
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.handover.status).toBe('SUBMITTED');
    expect(submitted.handover.escalatedToMasterAt).not.toBeNull();
    expect(submitted.transition.session?.state).toBe('READY_TO_CLOSE');
    // nobody accepts it: no acceptance timeout, the day employee sees nothing to review
    expect(
      timers.scheduled.some((s) => s.jobId === `handover-timeout.${submitted.handover.id}`),
    ).toBe(false);
    await toHandover(dayEmployee);
    expect(await handover.pendingForReceiver(dayEmployee)).toEqual([]);
    await expect(
      handover.review(
        dayEmployee,
        submitted.handover.id,
        { decision: 'ACCEPTED', idempotencyKey: key() },
        employeeActor(dayEmployee),
      ),
    ).rejects.toMatchObject({ code: 'HANDOVER_NOT_REVIEWABLE' });
    // the master decides from the panel; the notification has no zone in it
    const list = await handover.list({ scope: 'pending' });
    expect(list.some((h) => h.id === submitted.handover.id && h.zoneName === null)).toBe(true);
    const resolved = await handover.resolve(
      submitted.handover.id,
      { decision: 'RESOLVED_ACCEPTED', comment: 'Фото в порядке' },
      MASTER,
    );
    expect(resolved.status).toBe('RESOLVED_ACCEPTED');
    const notes = await testDb.db.select().from(notificationOutbox);
    const text = notes.find((n) => n.template === 'HANDOVER_RESOLVED')?.payload.text ?? '';
    expect(text).not.toContain('«»');
    expect(text).toContain('Решение мастера по вашему отчёту передачи');
  });

  it('посада без чек-листа: кнопки в боті немає, чернетка не створюється, звіт не вимагається', async () => {
    await testDb.db.delete(checklistDefinitions);
    await toHandover(dayEmployee);
    expect(await handover.current(dayEmployee)).toBeNull();
    expect((await shift.screen(dayEmployee)).checklistAvailable).toBe(false);
    await expect(
      handover.answer(dayEmployee, { itemKey: 'SURFACES', ok: true }, employeeActor(dayEmployee)),
    ).rejects.toMatchObject({ code: 'CHECKLIST_NOT_ASSIGNED' });
    const session = await shift.activeSession(dayEmployee);
    expect(
      await shift.transition(
        dayEmployee,
        { action: 'SUBMIT_HANDOVER', expectedVersion: session!.version, idempotencyKey: key() },
        { actor: employeeActor(dayEmployee), source: 'TELEGRAM' },
      ),
    ).toMatchObject({ ok: true, session: { state: 'READY_TO_CLOSE' } });
    expect(await testDb.db.select().from(handoverRecords)).toHaveLength(0);
  });

  it('зміна з чек-листом посади: без звіту передати зміну не можна', async () => {
    await toHandover(dayEmployee);
    expect((await shift.screen(dayEmployee)).checklistAvailable).toBe(true);
    const session = await shift.activeSession(dayEmployee);
    expect(
      await shift.transition(
        dayEmployee,
        { action: 'SUBMIT_HANDOVER', expectedVersion: session!.version, idempotencyKey: key() },
        { actor: employeeActor(dayEmployee), source: 'TELEGRAM' },
      ),
    ).toMatchObject({ ok: false, error: 'HANDOVER_INCOMPLETE' });
  });

  it('FR-CLN-03: чек-лист добирається за посадою працівника (одна посада — один чек-лист), фото-пункти з нього обовʼязкові', async () => {
    const photo = { key: 'ITEM_03', label: 'Фото линии', kind: 'PHOTO' as const };
    const inserted = await testDb.db
      .insert(checklistDefinitions)
      .values([
        {
          name: 'Оператор, участок',
          version: 1,
          zoneType: 'AREA',
          items: [
            { key: 'ITEM_01', label: 'Линия остановлена', kind: 'CHECK' },
            { key: 'ITEM_02', label: 'Сообщение', kind: 'NOTE' },
            photo,
          ],
        },
        {
          name: 'Оператор, старая версия',
          version: 1,
          zoneType: 'AREA',
          isActive: false,
          items: [{ key: 'ITEM_01', label: 'Устарело', kind: 'CHECK' }, photo],
        },
      ])
      .returning();
    // the position's checklist is replaced: the default binding goes, the new one comes
    await testDb.db
      .delete(checklistDefinitionPositions)
      .where(eq(checklistDefinitionPositions.positionId, operatorId));
    await testDb.db
      .insert(checklistDefinitionPositions)
      .values({ definitionId: inserted[0]!.id, positionId: operatorId });
    await toHandover(dayEmployee);
    const draft = await handover.current(dayEmployee);
    expect(draft?.items.map((i) => i.label)).toEqual([
      'Линия остановлена',
      'Сообщение',
      'Фото линии',
    ]);
    expect(draft?.issues).toEqual([
      { code: 'ITEM_MISSING', itemKey: 'ITEM_01' },
      { code: 'ITEM_MISSING', itemKey: 'ITEM_02' },
      { code: 'PHOTO_MISSING', itemKey: 'ITEM_03' },
    ]);
    // a photo lands only on a PHOTO item
    await expect(
      handover.attachPhoto(
        dayEmployee,
        { itemKey: 'ITEM_01', telegramFileId: 'f', telegramFileUniqueId: 'u' },
        employeeActor(dayEmployee),
      ),
    ).rejects.toMatchObject({ code: 'CHECKLIST_ITEM_UNKNOWN' });
    await handover.attachPhoto(
      dayEmployee,
      { itemKey: 'ITEM_03', telegramFileId: 'f', telegramFileUniqueId: 'u' },
      employeeActor(dayEmployee),
    );
    const withPhoto = await handover.current(dayEmployee);
    expect(withPhoto?.photos).toEqual([
      expect.objectContaining({ itemKey: 'ITEM_03', label: 'Фото линии' }),
    ]);
    expect(withPhoto?.issues.some((i) => i.code === 'PHOTO_MISSING')).toBe(false);
  });

  it('AC-10: без повного чек-листа і трьох фото звіт не подається; SUBMIT_HANDOVER без звіту заборонено', async () => {
    await toHandover(dayEmployee);
    const blocked = await shift.transition(
      dayEmployee,
      {
        action: 'SUBMIT_HANDOVER',
        expectedVersion: (await shift.activeSession(dayEmployee))!.version,
        idempotencyKey: key(),
      },
      { actor: employeeActor(dayEmployee), source: 'TELEGRAM' },
    );
    expect(blocked).toMatchObject({ ok: false, error: 'HANDOVER_INCOMPLETE' });

    await fillAll(dayEmployee, { skipPhoto: true });
    const notReady = await handover.submit(
      dayEmployee,
      { idempotencyKey: key() },
      employeeActor(dayEmployee),
    );
    expect(notReady.ok).toBe(false);
    expect(notReady.handover.issues.map((i) => i.code)).toEqual([
      'PHOTO_MISSING',
      'PHOTO_MISSING',
      'PHOTO_MISSING',
    ]);
  });

  it('FR-CLN-04: зауваження вимагає категорію, текст і безпеку; повторне фото пункту замінює попереднє', async () => {
    await toHandover(dayEmployee);
    await handover.answer(dayEmployee, { itemKey: 'FLOOR', ok: false }, employeeActor(dayEmployee));
    let view = await handover.current(dayEmployee);
    expect(view?.issues.filter((i) => i.itemKey === 'FLOOR').map((i) => i.code)).toEqual([
      'REMARK_CATEGORY_REQUIRED',
      'REMARK_TEXT_REQUIRED',
      'REMARK_SAFETY_REQUIRED',
    ]);
    await handover.answer(
      dayEmployee,
      {
        itemKey: 'FLOOR',
        ok: false,
        remarkCategory: 'DIRT',
        remarkText: 'Пятно масла у станка',
        safeToWork: true,
        needs: ['CLEANING'],
      },
      employeeActor(dayEmployee),
    );
    view = await handover.current(dayEmployee);
    expect(view?.issues.some((i) => i.itemKey === 'FLOOR')).toBe(false);
    expect(view?.items.find((i) => i.key === 'FLOOR')).toMatchObject({
      ok: false,
      remarkCategory: 'DIRT',
      needs: ['CLEANING'],
    });

    await handover.attachPhoto(
      dayEmployee,
      { itemKey: 'PHOTO_OVERVIEW', telegramFileId: 'f1', telegramFileUniqueId: 'u1' },
      employeeActor(dayEmployee),
    );
    await handover.attachPhoto(
      dayEmployee,
      { itemKey: 'PHOTO_OVERVIEW', telegramFileId: 'f2', telegramFileUniqueId: 'u2' },
      employeeActor(dayEmployee),
    );
    view = await handover.current(dayEmployee);
    expect(view?.photos).toHaveLength(1);
    expect(await testDb.db.select().from(mediaObjects)).toHaveLength(2);
    expect(timers.media).toHaveLength(2);
    // повторна відправка того самого файлу не створює нового обʼєкта (FR-PHO-05)
    await handover.attachPhoto(
      dayEmployee,
      { itemKey: 'PHOTO_OVERVIEW', telegramFileId: 'f2', telegramFileUniqueId: 'u2' },
      employeeActor(dayEmployee),
    );
    expect(await testDb.db.select().from(mediaObjects)).toHaveLength(2);
  });

  it('T-27/T-28: подання переводить у READY_TO_CLOSE, здавач закриває зміну; приймаюча зміна приймає зону', async () => {
    await toHandover(dayEmployee);
    await fillAll(dayEmployee);
    const submitted = await handover.submit(
      dayEmployee,
      { idempotencyKey: key() },
      employeeActor(dayEmployee),
    );
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.handover.status).toBe('SUBMITTED');
    expect(submitted.transition.ok).toBe(true);
    if (!submitted.transition.ok) return;
    expect(submitted.transition.session?.state).toBe('READY_TO_CLOSE');
    expect(new Date(submitted.handover.acceptDeadlineAt!).getTime()).toBe(
      planEnd.getTime() + 30 * 60_000,
    );
    expect(
      timers.scheduled.some((s) => s.jobId === `handover-timeout.${submitted.handover.id}`),
    ).toBe(true);
    const pendingNotices = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'HANDOVER_PENDING'));
    expect(pendingNotices.map((x) => x.recipientId)).toEqual([nightEmployee]);

    // повторне подання тим самим ключем не ламає стан
    const again = await handover.submit(
      dayEmployee,
      { idempotencyKey: key() },
      employeeActor(dayEmployee),
    );
    expect(again.ok).toBe(true);
    expect((await act(dayEmployee, 'CLOSE_SHIFT')).ok).toBe(true);

    await openShift(nightEmployee);
    const pending = await handover.pendingForReceiver(nightEmployee);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      submittedByName: 'Иванов Иван',
      remarks: 0,
      photos: 3,
      notes: ['Вентиль на линии подтекает, следите'],
    });

    const accepted = await handover.review(
      nightEmployee,
      pending[0]!.id,
      { decision: 'ACCEPTED', idempotencyKey: key() },
      employeeActor(nightEmployee),
    );
    expect(accepted.status).toBe('ACCEPTED');
    const [session] = await testDb.db
      .select()
      .from(shiftSessions)
      .where(eq(shiftSessions.employeeId, nightEmployee));
    expect(session?.zoneAcceptedAt).not.toBeNull();
    expect(timers.scheduled.some((s) => s.jobId.startsWith('handover-timeout'))).toBe(false);
    expect(await handover.pendingForReceiver(nightEmployee)).toHaveLength(0);
  });

  it('T-29/T-30/T-32: власну передачу приймати не можна; зауваження вимагає фото, критичне створює інцидент; майстер вирішує', async () => {
    await toHandover(dayEmployee);
    await fillAll(dayEmployee);
    const submitted = await handover.submit(
      dayEmployee,
      { idempotencyKey: key() },
      employeeActor(dayEmployee),
    );
    expect(submitted.ok).toBe(true);
    const id = submitted.handover.id;
    await expect(
      handover.review(
        dayEmployee,
        id,
        { decision: 'ACCEPTED', idempotencyKey: key() },
        employeeActor(dayEmployee),
      ),
    ).rejects.toMatchObject({ code: 'REVIEW_OWN_HANDOVER' });

    await openShift(nightEmployee);
    await expect(
      handover.review(
        nightEmployee,
        id,
        { decision: 'ISSUE', category: 'DAMAGE', comment: 'Течь у вентиля', idempotencyKey: key() },
        employeeActor(nightEmployee),
      ),
    ).rejects.toMatchObject({ code: 'REVIEW_INCOMPLETE' });

    const disputed = await handover.review(
      nightEmployee,
      id,
      {
        decision: 'ISSUE',
        category: 'DAMAGE',
        comment: 'Течь у вентиля',
        telegramFileId: 'rf',
        telegramFileUniqueId: 'ru',
        idempotencyKey: key(),
      },
      employeeActor(nightEmployee),
    );
    expect(disputed.status).toBe('DISPUTED');
    const incidents = await testDb.db.select().from(downtimeIncidents);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ reasonCode: 'DAMAGE', severity: 'CRITICAL', zoneId });
    const detail = await handover.detail(id);
    expect(detail.reviews[0]).toMatchObject({
      decision: 'ISSUE',
      category: 'DAMAGE',
      incidentId: incidents[0]!.id,
    });
    expect(detail.reviews[0]?.media?.quality).toBe('PENDING');
    const reviewed = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'HANDOVER_REVIEWED'));
    expect(reviewed.map((x) => x.recipientId)).toEqual([dayEmployee]);

    await expect(
      handover.resolve(id, { decision: 'RESOLVED_NO_FAULT', comment: 'x' }, MASTER),
    ).rejects.toBeInstanceOf(Error);
    const resolved = await handover.resolve(
      id,
      { decision: 'RESOLVED_NO_FAULT', comment: 'Течь появилась после передачи' },
      MASTER,
    );
    expect(resolved.status).toBe('RESOLVED_NO_FAULT');
    const after = await handover.detail(id);
    expect(after.resolutions).toHaveLength(1);
    expect(after.resolutions[0]).toMatchObject({
      resolvedBy: MASTER_ID,
      decision: 'RESOLVED_NO_FAULT',
    });
    const events = await testDb.db
      .select({ type: domainEvents.type })
      .from(domainEvents)
      .where(eq(domainEvents.zoneId, zoneId));
    expect(events.map((e) => e.type)).toContain('HANDOVER_RESOLVED');
    await expect(
      handover.resolve(id, { decision: 'RESOLVED_ACCEPTED', comment: 'ещё раз' }, MASTER),
    ).rejects.toMatchObject({
      code: 'HANDOVER_TRANSITION_NOT_ALLOWED',
    });
  });

  it('FR-HND-07: продовження роботи після звіту робить його SUPERSEDED, новий звіт створюється заново', async () => {
    await toHandover(dayEmployee);
    await fillAll(dayEmployee);
    const submitted = await handover.submit(
      dayEmployee,
      { idempotencyKey: key() },
      employeeActor(dayEmployee),
    );
    expect(submitted.ok).toBe(true);
    expect((await act(dayEmployee, 'CONTINUE_WORK')).ok).toBe(true);
    const [old] = await testDb.db
      .select()
      .from(handoverRecords)
      .where(eq(handoverRecords.id, submitted.handover.id));
    expect(old?.status).toBe('SUPERSEDED');
    expect((await act(dayEmployee, 'START_CLEANING')).ok).toBe(true);
    expect((await act(dayEmployee, 'CLEANING_DONE')).ok).toBe(true);
    const fresh = await handover.current(dayEmployee);
    expect(fresh?.status).toBe('DRAFT');
    expect(fresh?.id).not.toBe(submitted.handover.id);
    expect(fresh?.items.every((i) => !i.answered)).toBe(true);
  });

  it('FR-CLN-05: «не можу завершити прибирання» дозволяє подати з наявним і потребує коментаря для «Другое»', async () => {
    await toHandover(dayEmployee);
    await expect(
      handover.cannotComplete(dayEmployee, { reasonCode: 'OTHER' }, employeeActor(dayEmployee)),
    ).rejects.toBeInstanceOf(DomainError);
    await handover.cannotComplete(
      dayEmployee,
      { reasonCode: 'DAMAGE', comment: 'Прорвало трубу, зона затоплена' },
      employeeActor(dayEmployee),
    );
    const submitted = await handover.submit(
      dayEmployee,
      { idempotencyKey: key() },
      employeeActor(dayEmployee),
    );
    expect(submitted.ok).toBe(true);
    expect(submitted.handover.cannotCompleteReason).toBe('DAMAGE');
    const list = await handover.list({ scope: 'pending' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'SUBMITTED', overdue: false, remarks: 0 });
  });
});
