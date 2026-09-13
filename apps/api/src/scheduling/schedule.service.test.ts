import { loadAbsences, loadAbsenceEvents } from './plan-context.js';
import * as XLSX from 'xlsx';
import { messages } from '@vakhta/i18n';
import {
  employees,
  sites,
  responsibilityZones,
  teams,
  positions,
  shiftTemplates,
} from '@vakhta/db';
import { ScheduleExportService } from './schedule-export.service.js';
import { ScheduleHistoryPage } from '@vakhta/contracts';
import { auditLog } from '@vakhta/db';
import { ScheduleHistoryService } from './schedule-history.service.js';
import { randomUUID } from 'node:crypto';
import { authUser, webUserRoles, idempotencyKeys, domainEvents } from '@vakhta/db';
import {
  ScheduleWebCommand,
  ScheduleCommandResult,
  type ScheduleVersionView,
} from '@vakhta/contracts';
import { webUserActor, type WebUser } from '../auth/web-auth.guard.js';
import { RolesService } from '../auth/roles.service.js';
import { ScheduleCommandService } from './schedule-command.service.js';
import { StaffingService } from './staffing.service.js';
import { PatternsService } from './patterns.service.js';
import { OpenSlotsService } from './open-slots.service.js';
import { NotesService } from './notes.service.js';
import { RetrospectiveService } from './retrospective.service.js';
import { FeedService } from './feed.service.js';
import { homeScreen } from '../telegram/screens.js';
import { planScreen } from '../telegram/screens.js';
import { shiftSummaries } from '@vakhta/db';
import { backgroundTasks } from '@vakhta/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignmentAcknowledgements,
  employeePositions,
  presenceSessions,
  requests,
  shiftAssignments,
  shiftSessions,
  wellbeingCheckins,
} from '@vakhta/db';
import { eq, notificationOutbox, scheduleVersions, sql, telegramAccounts } from '@vakhta/db';
import { addMonths, businessDateOf } from '@vakhta/domain';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { EmployeesService } from '../identity/employees.service.js';
import { TimerScheduler } from '../infra/timers.queue.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrgService } from '../org/org.service.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { ScheduleService } from './schedule.service.js';
import { TemplatesService } from './templates.service.js';

const PLANNER = { type: 'WEB_USER', id: null, role: 'PLANNER', label: 'planner' } as const;
const HEAD = { type: 'WEB_USER', id: null, role: 'PRODUCTION_HEAD', label: 'head' } as const;

/** Наступний місяць: нагадування ставляться лише на майбутні зміни. */
const MONTH = addMonths(businessDateOf(new Date(), 'Europe/Kyiv').slice(0, 7), 1);
const day = (n: number) => `${MONTH}-${String(n).padStart(2, '0')}`;

describe('scheduling: версії, валідація, публікація, ознайомлення (ТЗ 3)', () => {
  let testDb: TestDatabase;
  let org: OrgService;
  let templates: TemplatesService;
  let employeesService: EmployeesService;
  let timers: TimerScheduler;
  let schedule: ScheduleService;

  let siteId: string;
  let unitId: string;
  let otherUnitId: string;
  let zoneId: string;
  let dayId: string;
  let nightId: string;
  let ivanov: string;
  let petrova: string;

  async function timerJobs() {
    const rows = await testDb.db.select().from(backgroundTasks);
    return rows
      .filter((row) => row.kind !== 'MEDIA_PROCESS' && row.kind !== 'BONUS_RECALCULATE')
      .map((row) => ({ jobId: row.dedupeKey, fireAt: row.dueAt }));
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    const events = new EventStore();
    const audit = new AuditLog();
    org = new OrgService(testDb.db, events, audit);
    templates = new TemplatesService(testDb.db, events, audit, org);
    employeesService = new EmployeesService(testDb.db, events, audit, new NotificationsService());
    timers = new TimerScheduler();
    schedule = new ScheduleService(
      testDb.db,
      events,
      audit,
      org,
      templates,
      new NotificationsService(),
      timers,
      {
        shiftReminderMinutes: 120,
        ackReminderHours: 24,
        defaultTimezone: 'Europe/Kyiv',
      },
    );
  }, 180_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.db.execute(
      sql`TRUNCATE notification_outbox, assignment_acknowledgements, shift_assignments, schedule_versions, shift_templates, telegram_accounts, employees, responsibility_zones, teams, org_units, sites CASCADE`,
    );
    await testDb.db.delete(backgroundTasks);
    const site = await org.createSite(
      { code: 'main', name: 'Основная', timezone: 'Europe/Kyiv' },
      PLANNER,
    );
    siteId = site.id;
    unitId = (await org.createOrgUnit({ siteId, name: 'Цех фасовки' }, PLANNER)).id;
    otherUnitId = (await org.createOrgUnit({ siteId, name: 'Цех упаковки' }, PLANNER)).id;
    zoneId = (
      await org.createZone(
        {
          siteId,
          orgUnitId: unitId,
          code: 'FILL_1',
          name: 'Линия 1',
          type: 'FILLING',
          isShared: false,
        },
        PLANNER,
      )
    ).id;
    dayId = (
      await templates.create(
        {
          siteId,
          code: 'DAY',
          name: 'Дневная',
          localStart: '08:00',
          localEnd: '20:00',
          isNight: false,
        },
        PLANNER,
      )
    ).id;
    nightId = (
      await templates.create(
        {
          siteId,
          code: 'NIGHT',
          name: 'Ночная',
          localStart: '20:00',
          localEnd: '08:00',
          isNight: true,
        },
        PLANNER,
      )
    ).id;
    ivanov = (
      await employeesService.create(
        { personnelNumber: '1', fullName: 'Иванов Иван', status: 'ACTIVE' },
        PLANNER,
      )
    ).id;
    petrova = (
      await employeesService.create(
        { personnelNumber: '2', fullName: 'Петрова Ольга', status: 'ACTIVE' },
        PLANNER,
      )
    ).id;
    await testDb.db.insert(telegramAccounts).values({ employeeId: ivanov, telegramUserId: 111 });
  });

  describe('whole saved-version XLSX export', () => {
    afterEach(() => vi.restoreAllMocks());
    const create = () =>
      schedule.createVersion({ siteId, orgUnitId: unitId, periodMonth: MONTH }, PLANNER);
    const user = (role: 'PLANNER' | 'AUDITOR' = 'PLANNER'): WebUser => ({
      id: randomUUID(),
      name: 'Exporter',
      email: 'exporter@example.test',
      twoFactorEnabled: true,
      grants: [{ role, scopeType: 'ORG_UNIT', scopeId: unitId }],
    });
    const exporter = () => new ScheduleExportService(testDb.db, schedule, new AuditLog());
    function sheet(book: XLSX.WorkBook, name: string) {
      const value = book.Sheets[name];
      if (!value) throw new Error(`Missing sheet ${name}`);
      return value;
    }
    const metadata = (book: XLSX.WorkBook) =>
      Object.fromEntries(
        XLSX.utils.sheet_to_json<[string, string | number]>(sheet(book, 'Metadata'), { header: 1 }),
      );
    const records = (book: XLSX.WorkBook) =>
      XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet(book, 'Assignments'));
    async function insert(versionId: string, count: number) {
      return testDb.db
        .insert(shiftAssignments)
        .values(
          Array.from({ length: count }, (_, i) => ({
            scheduleVersionId: versionId,
            employeeId: ivanov,
            templateId: nightId,
            businessDate: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
            planStartAt: new Date('2026-10-24T17:00:00Z'),
            planEndAt: new Date('2026-10-25T06:00:00Z'),
            orgUnitId: unitId,
            zoneId,
          })),
        )
        .returning();
    }

    it('preserves original intervals, every status, metadata and ACK in a complete saved snapshot', async () => {
      const version = await create();
      const [planned, cancelled, replaced] = await insert(version.id, 3);
      if (!planned || !cancelled || !replaced) throw new Error('Missing assignments');
      const [team] = await testDb.db
        .insert(teams)
        .values({ orgUnitId: unitId, name: 'Synthetic team' })
        .returning();
      const [position] = await testDb.db
        .insert(positions)
        .values({ code: 'EXPORT', name: 'Synthetic position' })
        .returning();
      if (!team || !position) throw new Error('Missing metadata');
      await testDb.db
        .update(shiftAssignments)
        .set({ kind: 'EXTRA', teamId: team.id, positionId: position.id })
        .where(eq(shiftAssignments.id, planned.id));
      await testDb.db
        .update(shiftAssignments)
        .set({ status: 'CANCELLED' })
        .where(eq(shiftAssignments.id, cancelled.id));
      await testDb.db
        .update(shiftAssignments)
        .set({ status: 'REPLACED' })
        .where(eq(shiftAssignments.id, replaced.id));
      const ack = new Date('2026-09-01T12:00:00Z');
      await testDb.db.insert(assignmentAcknowledgements).values({
        assignmentId: planned.id,
        employeeId: ivanov,
        scheduleVersionId: version.id,
        source: 'WEB',
        acknowledgedAt: ack,
      });
      await testDb.db
        .update(shiftTemplates)
        .set({ localStart: '01:00', localEnd: '02:00' })
        .where(eq(shiftTemplates.id, nightId));
      const now = new Date('2026-09-13T12:00:00Z');
      const result = await exporter().export(
        version.id,
        { expectedRevision: version.revision },
        user(),
        'en',
        now,
      );
      const book = XLSX.read(result.body, { type: 'buffer' });
      const t = messages('en').scheduleExport;
      expect(metadata(book)).toMatchObject({
        [t.versionId]: version.id,
        [t.revision]: version.revision,
        [t.rows]: 3,
        [t.plannedMinutes]: 780,
        [t.generatedAt]: now.toISOString(),
        [t.scope]: t.wholeVersion,
      });
      expect(records(book)).toHaveLength(3);
      expect(records(book)[0]).toMatchObject({
        [t.assignmentId]: planned.id,
        [t.startUtc]: planned.planStartAt.toISOString(),
        [t.endUtc]: planned.planEndAt.toISOString(),
        [t.startLocal]: '2026-10-24 20:00 +03:00',
        [t.endLocal]: '2026-10-25 08:00 +02:00',
        [t.duration]: 780,
        [t.kind]: 'EXTRA',
        [t.teamId]: team.id,
        [t.positionId]: position.id,
        [t.acknowledgedAt]: ack.toISOString(),
      });
      expect(records(book).map((row) => row[t.status])).toEqual([
        'PLANNED',
        'CANCELLED',
        'REPLACED',
      ]);
      expect(result.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result.filename).toContain(`r${version.revision}-${version.id}.xlsx`);
    });

    it('exports more than a page of original rows without date or status filtering', async () => {
      const version = await create();
      await insert(version.id, 205);
      const result = await exporter().export(version.id, { expectedRevision: 1 }, user(), 'en');
      const book = XLSX.read(result.body, { type: 'buffer' });
      expect(records(book)).toHaveLength(205);
      expect(metadata(book)[messages('en').scheduleExport.rows]).toBe(205);
    });

    it.each(['en', 'uk', 'ru'] as const)(
      'keeps formula-looking labels literal and gates current employee names (%s)',
      async (locale) => {
        const version = await create();
        await insert(version.id, 1);
        await testDb.db
          .update(employees)
          .set({ fullName: '=HYPERLINK("bad","name")', phone: 'PRIVATE_PHONE' })
          .where(eq(employees.id, ivanov));
        await testDb.db
          .update(responsibilityZones)
          .set({ name: '+SUM(1,2)' })
          .where(eq(responsibilityZones.id, zoneId));
        await testDb.db.update(sites).set({ name: '@SUM(1,2)' }).where(eq(sites.id, siteId));
        const t = messages(locale).scheduleExport;
        for (const role of ['PLANNER', 'AUDITOR'] as const) {
          const result = await exporter().export(
            version.id,
            { expectedRevision: 1 },
            user(role),
            locale,
          );
          const book = XLSX.read(result.body, { type: 'buffer' });
          const assignmentSheet = sheet(book, t.assignmentsSheet);
          const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(assignmentSheet);
          expect(rows[0]).toMatchObject({
            [t.employeeId]: ivanov,
            [t.employeeName]: role === 'PLANNER' ? '=HYPERLINK("bad","name")' : '',
            [t.zoneName]: '+SUM(1,2)',
          });
          for (const page of Object.values(book.Sheets)) {
            for (const [address, value] of Object.entries(page)) {
              if (address.startsWith('!')) continue;
              const cell: XLSX.CellObject = value;
              expect(cell.f).toBeUndefined();
              expect(cell.l).toBeUndefined();
              if (typeof cell.v === 'string') expect(cell.t).toBe('s');
            }
          }
          expect(JSON.stringify(book)).not.toContain('PRIVATE_PHONE');
          if (role === 'AUDITOR') expect(JSON.stringify(book)).not.toContain('HYPERLINK');
        }
      },
    );

    it('rejects stale revisions and versions beyond the row ceiling without a success audit', async () => {
      const version = await create();
      await expect(
        exporter().export(version.id, { expectedRevision: 2 }, user()),
      ).rejects.toMatchObject({ code: 'SCHEDULE_REVISION_CONFLICT', status: 409 });
      await testDb.db
        .execute(sql`INSERT INTO shift_assignments (schedule_version_id, employee_id, template_id, business_date, plan_start_at, plan_end_at, org_unit_id)
        SELECT ${version.id}::uuid, ${ivanov}::uuid, ${dayId}::uuid, '2026-01-01'::date + i, '2026-01-01T08:00:00Z'::timestamptz, '2026-01-01T20:00:00Z'::timestamptz, ${unitId}::uuid FROM generate_series(1, 20001) AS i`);
      await expect(
        exporter().export(version.id, { expectedRevision: 1 }, user()),
      ).rejects.toMatchObject({ code: 'SCHEDULE_EXPORT_TOO_LARGE', status: 422 });
      const audits = await testDb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.objectId, version.id));
      expect(audits.filter((row) => row.action === 'schedule.version.export')).toEqual([]);
    });

    it('keeps rows and revision from one snapshot during a concurrent saved change', async () => {
      const version = await create();
      const [original] = await insert(version.id, 1);
      if (!original) throw new Error('Missing assignment');
      let release = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reached = () => {};
      const read = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const requireVersion = schedule.requireVersion.bind(schedule);
      vi.spyOn(schedule, 'requireVersion').mockImplementationOnce(async (id, tx) => {
        const result = await requireVersion(id, tx);
        reached();
        await released;
        return result;
      });
      const exporting = exporter().export(version.id, { expectedRevision: 1 }, user(), 'en');
      await read;
      try {
        await testDb.db.transaction(async (tx) => {
          await tx
            .update(scheduleVersions)
            .set({ revision: 2 })
            .where(eq(scheduleVersions.id, version.id));
          await tx
            .update(shiftAssignments)
            .set({ kind: 'EXTRA' })
            .where(eq(shiftAssignments.id, original.id));
        });
      } finally {
        release();
      }
      const book = XLSX.read((await exporting).body, { type: 'buffer' });
      const t = messages('en').scheduleExport;
      expect(metadata(book)[t.revision]).toBe(1);
      expect(records(book)[0]?.[t.kind]).toBe('REGULAR');
      await expect(
        exporter().export(version.id, { expectedRevision: 1 }, user()),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('exports an empty saved version with metadata and an assignment header', async () => {
      const version = await create();
      const book = XLSX.read(
        (await exporter().export(version.id, { expectedRevision: 1 }, user(), 'en')).body,
        { type: 'buffer' },
      );
      expect(records(book)).toEqual([]);
      expect(metadata(book)[messages('en').scheduleExport.rows]).toBe(0);
      expect(sheet(book, 'Assignments')['!ref']).toBe('A1:W1');
    });
  });

  describe('metadata-only publication changes', () => {
    it.each([
      { field: 'kind', workflow: 'SAVE' },
      { field: 'teamId', workflow: 'SAVE' },
      { field: 'positionId', workflow: 'SAVE' },
      { field: 'kind', workflow: 'REVISE' },
      { field: 'teamId', workflow: 'REVISE' },
      { field: 'positionId', workflow: 'REVISE' },
    ] as const)(
      'notifies only the affected employee once for $workflow changing $field',
      async ({ field, workflow }) => {
        const team = await org.createTeam({ orgUnitId: unitId, name: 'Metadata team' }, PLANNER);
        const position = await org.createPosition(
          { code: `META_${randomUUID().slice(0, 8).toUpperCase()}`, name: 'Metadata position' },
          PLANNER,
        );
        await testDb.db
          .insert(telegramAccounts)
          .values({ employeeId: petrova, telegramUserId: 222 });
        const original = await schedule.createVersion(
          { siteId, orgUnitId: unitId, periodMonth: MONTH },
          PLANNER,
        );
        const affected = {
          employeeId: ivanov,
          templateId: dayId,
          businessDate: day(1),
          kind: 'REGULAR' as const,
        };
        const unchanged = { ...affected, employeeId: petrova };
        await schedule.putAssignments(original.id, { items: [affected, unchanged] }, PLANNER);
        await schedule.submit(original.id, PLANNER);
        await schedule.publish(original.id, {}, HEAD);
        const metadata =
          field === 'kind'
            ? { kind: 'EXTRA' as const }
            : field === 'teamId'
              ? { teamId: team.id }
              : { positionId: position.id };
        const items = [{ ...affected, ...metadata }, unchanged];
        let published: ScheduleVersionView;
        if (workflow === 'REVISE') {
          published = await schedule.revise(
            original.id,
            { items, changeReason: 'Metadata update' },
            HEAD,
          );
        } else {
          const next = await schedule.createVersion(
            { siteId, orgUnitId: unitId, periodMonth: MONTH },
            PLANNER,
          );
          await schedule.putAssignments(next.id, { items }, PLANNER);
          await schedule.submit(next.id, PLANNER);
          published = await schedule.publish(next.id, { changeReason: 'Metadata update' }, HEAD);
        }
        const notifications = await testDb.db
          .select()
          .from(notificationOutbox)
          .where(eq(notificationOutbox.template, 'SCHEDULE_CHANGED'));
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({
          recipientId: ivanov,
          dedupeKey: `schedule:${published.id}:${ivanov}`,
        });
        expect(notifications[0]?.payload.text).toMatch(/добавлено 0, отменено 0, изменено 1/);
        expect(notifications[0]?.payload.buttons?.[0]?.[0]?.callbackData).toBe(
          `ack:${published.id}`,
        );
        const events = await testDb.db
          .select()
          .from(domainEvents)
          .where(eq(domainEvents.scheduleVersionId, published.id));
        expect(events.find((event) => event.type === 'SCHEDULE_PUBLISHED')?.payload).toMatchObject({
          affected: 1,
          notified: 1,
        });
        const detail = await schedule.detail(published.id);
        expect(
          detail.assignments.find((assignment) => assignment.employeeId === ivanov),
        ).toMatchObject(metadata);
      },
    );
  });

  describe('scoped decision history', () => {
    afterEach(() => vi.restoreAllMocks());
    const read = (id: string, page = 1, pageSize = 20) =>
      new ScheduleHistoryService(testDb.db, schedule).history(id, { page, pageSize });
    const create = () =>
      schedule.createVersion({ siteId, orgUnitId: unitId, periodMonth: MONTH }, PLANNER);

    async function reviewedVersion() {
      const version = await create();
      await schedule.putAssignments(
        version.id,
        {
          items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }],
        },
        PLANNER,
      );
      await schedule.submit(version.id, PLANNER);
      await schedule.returnToDraft(version.id, { comment: 'First return reason' }, HEAD);
      await schedule.submit(version.id, PLANNER);
      await schedule.returnToDraft(version.id, { comment: 'Second return reason' }, HEAD);
      await schedule.submit(version.id, PLANNER);
      return schedule.publish(version.id, { changeReason: 'First publication reason' }, HEAD);
    }

    it('preserves every return reason and publication decision independently of the latest summary', async () => {
      const original = await reviewedVersion();
      const replacement = await create();
      await schedule.submit(replacement.id, PLANNER);
      await schedule.publish(replacement.id, { changeReason: 'Second publication reason' }, HEAD);
      const page = ScheduleHistoryPage.parse(await read(original.id));
      expect(page.total).toBe(8);
      expect(
        page.entries.filter((entry) => entry.action === 'RETURN').map((entry) => entry.reason),
      ).toEqual(['Second return reason', 'First return reason']);
      expect(page.entries.find((entry) => entry.action === 'PUBLISH')).toMatchObject({
        reason: 'First publication reason',
        fromStatus: 'IN_REVIEW',
        toStatus: 'PUBLISHED',
      });
      expect(page.entries.find((entry) => entry.action === 'SAVE')).toMatchObject({
        assignmentCount: 1,
      });
      expect(page.lineage).toEqual({
        supersedes: null,
        supersededBy: { id: replacement.id, versionNo: 2 },
      });
      const next = await read(replacement.id);
      expect(next.entries.find((entry) => entry.action === 'PUBLISH')?.reason).toBe(
        'Second publication reason',
      );
      expect(next.entries.find((entry) => entry.action === 'CREATE')).toMatchObject({
        basedOnVersionId: original.id,
      });
      expect(next.lineage.supersedes).toEqual({ id: original.id, versionNo: 1 });
    });

    it('resolves only current labels for the recorded actor type and leaves missing actors nullable', async () => {
      const version = await create();
      await testDb.db
        .insert(authUser)
        .values({ id: ivanov, email: `old-${ivanov}@test.invalid`, name: 'Not the email label' });
      const missing = randomUUID();
      for (const actor of [
        { type: 'WEB_USER', id: ivanov, role: 'ADMIN' },
        { type: 'EMPLOYEE', id: ivanov, role: 'EMPLOYEE' },
        { type: 'TERMINAL', id: ivanov, role: 'TERMINAL' },
        { type: 'SYSTEM', id: null, role: 'SYSTEM' },
        { type: 'WEB_USER', id: missing, role: 'ADMIN' },
      ] as const) {
        await new AuditLog().record(testDb.db, {
          actor,
          action: 'schedule.version.return',
          objectType: 'schedule_version',
          objectId: version.id,
          reason: 'Recorded reason',
        });
      }
      const email = `current-${ivanov}@test.invalid`;
      await testDb.db.update(authUser).set({ email }).where(eq(authUser.id, ivanov));
      const page = await read(version.id);
      const decisions = page.entries.filter((entry) => entry.reason === 'Recorded reason');
      expect(decisions).toHaveLength(5);
      expect(
        decisions.find((entry) => entry.actorType === 'WEB_USER' && entry.actorId === ivanov)
          ?.actorLabel,
      ).toBe(email);
      expect(decisions.find((entry) => entry.actorType === 'EMPLOYEE')?.actorLabel).toBe(
        'Иванов Иван',
      );
      expect(decisions.find((entry) => entry.actorType === 'TERMINAL')).toMatchObject({
        actorId: ivanov,
        actorLabel: null,
      });
      expect(decisions.find((entry) => entry.actorType === 'SYSTEM')).toMatchObject({
        actorId: null,
        actorLabel: null,
      });
      expect(decisions.find((entry) => entry.actorId === missing)?.actorLabel).toBeNull();
    });

    it('pages equal timestamps by ID and excludes other objects/actions and raw audit metadata', async () => {
      const version = await create();
      const at = new Date('2099-01-01T00:00:00Z');
      const ids = [randomUUID(), randomUUID(), randomUUID()].sort().reverse();
      await testDb.db.insert(auditLog).values(
        ids.map((id) => ({
          id,
          at,
          actorType: 'SYSTEM' as const,
          action: 'schedule.assignments.replace',
          objectType: 'schedule_version',
          objectId: version.id,
          after: { count: 2, privateField: 'NEVER_EXPOSE' },
          before: { privateField: 'NEVER_EXPOSE' },
          ip: '192.0.2.1',
          traceId: 'PRIVATE_TRACE',
          reason: 'Repeated reason',
        })),
      );
      await testDb.db.insert(auditLog).values([
        {
          actorType: 'SYSTEM',
          action: 'schedule.version.publish',
          objectType: 'employee',
          objectId: version.id,
        },
        {
          actorType: 'SYSTEM',
          action: 'employee.status.change',
          objectType: 'schedule_version',
          objectId: version.id,
        },
        {
          actorType: 'SYSTEM',
          action: 'schedule.version.publish',
          objectType: 'schedule_version',
          objectId: randomUUID(),
        },
      ]);
      const first = await read(version.id, 1, 2);
      const second = await read(version.id, 2, 2);
      expect(first.total).toBe(4);
      expect(first.entries.map((entry) => entry.id)).toEqual(ids.slice(0, 2));
      expect(second.entries[0]?.id).toBe(ids[2]);
      expect(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size).toBe(4);
      expect(await read(version.id, 3, 2)).toMatchObject({ total: 4, entries: [] });
      expect(JSON.stringify(first)).not.toMatch(
        /NEVER_EXPOSE|PRIVATE_TRACE|192\.0\.2\.1|"before"|"after"|"ip"|"traceId"/,
      );
    });

    it('projects malformed historical status/count references as unknown without hiding the reason', async () => {
      const version = await create();
      for (const action of [
        'schedule.version.create',
        'schedule.assignments.replace',
        'schedule.version.publish',
        'schedule.version.remind',
      ]) {
        await new AuditLog().record(testDb.db, {
          actor: PLANNER,
          action,
          objectType: 'schedule_version',
          objectId: version.id,
          reason: 'Historical reason',
          before: { status: 'INVALID' },
          after: { status: 3, count: '3', basedOn: 'invalid', reminded: -1, pending: '2' },
        });
      }
      const entries = (await read(version.id)).entries.filter(
        (entry) => entry.reason === 'Historical reason',
      );
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'CREATE', basedOnVersionId: null }),
          expect.objectContaining({ action: 'SAVE', assignmentCount: null }),
          expect.objectContaining({ action: 'PUBLISH', fromStatus: null, toStatus: null }),
          expect.objectContaining({ action: 'REMIND', reminded: null, pending: null }),
        ]),
      );
    });

    it('never resolves a lineage reference into another unit', async () => {
      const version = await create();
      await testDb.db.insert(scheduleVersions).values({
        siteId,
        orgUnitId: otherUnitId,
        periodMonth: MONTH,
        versionNo: 1,
        supersedesId: version.id,
      });
      expect((await read(version.id)).lineage).toEqual({ supersedes: null, supersededBy: null });
    });

    it('keeps the count and page in one read snapshot while a later decision is appended', async () => {
      const version = await create();
      let release: () => void = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reached: () => void = () => {};
      const snapshotRead = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const requireVersion = schedule.requireVersion.bind(schedule);
      const pause = vi.spyOn(schedule, 'requireVersion').mockImplementation(async (id, tx) => {
        const result = await requireVersion(id, tx);
        reached();
        await released;
        return result;
      });
      const reading = read(version.id);
      await snapshotRead;
      await new AuditLog().record(testDb.db, {
        actor: PLANNER,
        action: 'schedule.version.return',
        objectType: 'schedule_version',
        objectId: version.id,
        reason: 'Concurrent decision',
      });
      release();
      expect(await reading).toMatchObject({
        total: 1,
        entries: [expect.objectContaining({ action: 'CREATE' })],
      });
      pause.mockRestore();
      expect((await read(version.id)).total).toBe(2);
    });
  });

  describe('snapshot acknowledgement', () => {
    afterEach(() => vi.restoreAllMocks());

    async function publishMonth(month = MONTH) {
      const version = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: month },
        PLANNER,
      );
      await schedule.putAssignments(
        version.id,
        {
          items: [
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: `${month}-01`,
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: petrova,
              templateId: dayId,
              businessDate: `${month}-01`,
              kind: 'REGULAR',
            },
          ],
        },
        PLANNER,
      );
      await schedule.submit(version.id, PLANNER);
      return schedule.publish(version.id, { changeReason: 'Test publication' }, HEAD);
    }

    const confirm = (
      snapshot: Awaited<ReturnType<ScheduleService['homeAcknowledgement']>>,
      employeeId = ivanov,
    ) => schedule.acknowledgeSnapshot(employeeId, snapshot.scope, snapshot.fingerprint, 'TELEGRAM');

    it.each(['HOME', 'MONTH'] as const)(
      'rejects the old %s snapshot after a new publication',
      async (kind) => {
        await publishMonth();
        const snapshot =
          kind === 'HOME'
            ? await schedule.homeAcknowledgement(ivanov)
            : (await schedule.myPlanWithAcknowledgement(ivanov, MONTH)).acknowledgement;
        await publishMonth();
        expect(await confirm(snapshot)).toEqual({ kind: 'STALE' });
        expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([]);
      },
    );

    it('confirms the displayed month without confirming a later month or another employee', async () => {
      const current = await publishMonth();
      const snapshot = (await schedule.myPlanWithAcknowledgement(ivanov, MONTH)).acknowledgement;
      const later = await publishMonth(addMonths(MONTH, 1));
      expect(await confirm(snapshot)).toEqual({ kind: 'ACKNOWLEDGED', acknowledged: 1, total: 1 });
      expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([
        expect.objectContaining({ employeeId: ivanov, scheduleVersionId: current.id }),
      ]);
      expect(await schedule.unacknowledgedVersions(ivanov)).toEqual([
        { versionId: later.id, periodMonth: later.periodMonth },
      ]);
    });

    it('retains the Home aggregate scope and serializes repeat taps without duplicate events', async () => {
      await publishMonth();
      await publishMonth(addMonths(MONTH, 1));
      const snapshot = await schedule.homeAcknowledgement(ivanov);
      const before = await testDb.db.select().from(domainEvents);
      const results = await Promise.all([confirm(snapshot), confirm(snapshot)]);
      expect(results).toEqual(
        expect.arrayContaining([
          { kind: 'ACKNOWLEDGED', acknowledged: 2, total: 2 },
          { kind: 'ACKNOWLEDGED', acknowledged: 0, total: 2 },
        ]),
      );
      expect(await confirm(snapshot)).toEqual({ kind: 'ACKNOWLEDGED', acknowledged: 0, total: 2 });
      expect((await schedule.homeAcknowledgement(ivanov)).fingerprint).toBe(snapshot.fingerprint);
      expect(await testDb.db.select().from(assignmentAcknowledgements)).toHaveLength(2);
      const after = await testDb.db.select().from(domainEvents);
      expect(
        after.filter(
          (event) =>
            event.type === 'SCHEDULE_ACKNOWLEDGED' && !before.some((old) => old.id === event.id),
        ),
      ).toHaveLength(2);
    });

    it.each(['employee', 'scope', 'digest'] as const)(
      'rejects %s identity reuse without acknowledgements',
      async (change) => {
        await publishMonth();
        const snapshot = await schedule.homeAcknowledgement(ivanov);
        const altered =
          change === 'scope'
            ? { ...snapshot, scope: { kind: 'MONTH' as const, month: MONTH } }
            : change === 'digest'
              ? { ...snapshot, fingerprint: 'A'.repeat(43) }
              : snapshot;
        expect(await confirm(altered, change === 'employee' ? petrova : ivanov)).toEqual({
          kind: 'STALE',
        });
        expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([]);
      },
    );

    it('rolls back the entire aggregate and its events after an event failure, then permits retry', async () => {
      await publishMonth();
      await publishMonth(addMonths(MONTH, 1));
      const snapshot = await schedule.homeAcknowledgement(ivanov);
      const before = await testDb.db.select().from(domainEvents);
      const append = EventStore.prototype.append;
      let acknowledgements = 0;
      const fault = vi.spyOn(EventStore.prototype, 'append').mockImplementation(async function (
        this: EventStore,
        tx,
        event,
      ) {
        if (event.type === 'SCHEDULE_ACKNOWLEDGED' && ++acknowledgements === 2)
          throw new Error('Injected acknowledgement failure');
        return append.call(this, tx, event);
      });
      await expect(confirm(snapshot)).rejects.toThrow('Injected acknowledgement failure');
      expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([]);
      expect(await testDb.db.select().from(domainEvents)).toEqual(before);
      fault.mockRestore();
      expect(await confirm(snapshot)).toMatchObject({ kind: 'ACKNOWLEDGED', acknowledged: 2 });
    });

    it('rereads assignment eligibility after waiting for the version lock', async () => {
      const version = await publishMonth();
      const snapshot = await schedule.homeAcknowledgement(ivanov);
      let release: () => void = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let locked: () => void = () => {};
      const hasLock = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const changing = testDb.db.transaction(async (tx) => {
        await schedule.lockVersion(version.id, tx);
        locked();
        await released;
        await tx
          .update(shiftAssignments)
          .set({ status: 'CANCELLED' })
          .where(eq(shiftAssignments.scheduleVersionId, version.id));
      });
      await hasLock;
      let requested: () => void = () => {};
      const requestedLock = new Promise<void>((resolve) => {
        requested = resolve;
      });
      const lock = schedule.lockVersion.bind(schedule);
      vi.spyOn(schedule, 'lockVersion').mockImplementation((id, tx, revision) => {
        requested();
        return lock(id, tx, revision);
      });
      const confirming = confirm(snapshot);
      await requestedLock;
      release();
      await changing;
      expect(await confirming).toEqual({ kind: 'STALE' });
      expect(await testDb.db.select().from(assignmentAcknowledgements)).toEqual([]);
    });
  });

  it('чернетка → подання → публікація з нотифікацією і таймерами', async () => {
    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    expect(v1).toMatchObject({ versionNo: 1, status: 'DRAFT', assignmentsCount: 0 });

    const saved = await schedule.putAssignments(
      v1.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), zoneId, kind: 'REGULAR' },
          { employeeId: ivanov, templateId: dayId, businessDate: day(2), zoneId, kind: 'REGULAR' },
          {
            employeeId: ivanov,
            templateId: nightId,
            businessDate: day(4),
            zoneId,
            kind: 'REGULAR',
          },
          { employeeId: petrova, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    const first = saved.assignments.find(
      (a) => a.employeeId === ivanov && a.businessDate === day(1),
    );
    // 08:00 за Києвом у вересні-жовтні = 05:00Z; після переходу на зимовий час 06:00Z.
    expect(['05:00', '06:00']).toContain(first!.planStartAt.slice(11, 16));

    await expect(schedule.publish(v1.id, {}, HEAD)).rejects.toMatchObject({
      code: 'SCHEDULE_TRANSITION_NOT_ALLOWED',
    });
    expect((await schedule.submit(v1.id, PLANNER)).status).toBe('IN_REVIEW');
    await expect(schedule.putAssignments(v1.id, { items: [] }, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_NOT_EDITABLE',
    });

    const published = await schedule.publish(v1.id, {}, HEAD);
    expect(published).toMatchObject({
      status: 'PUBLISHED',
      supersedesId: null,
      assignmentsCount: 4,
    });

    // Нотифікація лише працівнику з привʼязкою, з кнопкою «Ознайомлений».
    const outbox = await testDb.db.select().from(notificationOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      recipientId: ivanov,
      template: 'SCHEDULE_PUBLISHED',
      status: 'PENDING',
    });
    expect(outbox[0]?.payload.text).toContain('3 смен');
    expect(outbox[0]?.payload.buttons?.[0]?.[0]?.callbackData).toBe(`ack:${v1.id}`);

    // Таймери: нагадування на 4 зміни + ознайомлення для 2 працівників.
    const jobs = (await timerJobs()).map((s) => s.jobId);
    expect(jobs.filter((j) => j.startsWith('shift-reminder.'))).toHaveLength(4);
    expect(jobs.filter((j) => j.startsWith('ack-reminder.'))).toHaveLength(2);

    // Ознайомлення.
    expect(await schedule.unacknowledgedVersions(ivanov)).toEqual([
      { versionId: v1.id, periodMonth: MONTH },
    ]);
    expect(await schedule.acknowledge(v1.id, ivanov, 'TELEGRAM')).toEqual({
      acknowledged: 3,
      total: 3,
    });
    expect(await schedule.acknowledge(v1.id, ivanov, 'TELEGRAM')).toEqual({
      acknowledged: 0,
      total: 3,
    });
    expect(await schedule.unacknowledgedVersions(ivanov)).toEqual([]);
    const status = await schedule.acknowledgementStatus(v1.id);
    expect(status.find((s) => s.employeeId === ivanov)).toMatchObject({
      assignments: 3,
      acknowledged: 3,
      telegramLinked: true,
    });
    expect(status.find((s) => s.employeeId === petrova)).toMatchObject({
      assignments: 1,
      acknowledged: 0,
      telegramLinked: false,
    });

    // «Мій план».
    const plan = await schedule.myPlan(ivanov, MONTH);
    expect(plan.timezone).toBe('Europe/Kyiv');
    expect(plan.totals).toMatchObject({
      shifts: 3,
      dayShifts: 2,
      nightShifts: 1,
      plannedMinutes: 3 * 720,
    });
    expect(plan.days[0]).toMatchObject({ date: day(1), kind: 'DAY' });
    expect(plan.days[0]?.assignment).toMatchObject({
      zoneName: 'Линия 1',
      orgUnitName: 'Цех фасовки',
      acknowledged: true,
    });
    expect(plan.days[2]?.kind).toBe('OFF');
    expect(plan.unacknowledgedVersionIds).toEqual([]);
    const next = await schedule.nextShift(ivanov);
    expect(next?.zoneName).toBe('Линия 1');
    expect(next?.isNight).toBe(false);
  });

  it('нова версія копіює опубліковану, публікація замінює її і шле нотифікацію про зміни', async () => {
    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      v1.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
          { employeeId: ivanov, templateId: dayId, businessDate: day(2), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    await schedule.submit(v1.id, PLANNER);
    await schedule.publish(v1.id, {}, HEAD);
    await schedule.acknowledge(v1.id, ivanov, 'TELEGRAM');

    const v2 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    expect(v2).toMatchObject({ versionNo: 2, assignmentsCount: 2 });
    await schedule.putAssignments(
      v2.id,
      {
        items: [
          { employeeId: ivanov, templateId: nightId, businessDate: day(1), kind: 'REGULAR' },
          { employeeId: ivanov, templateId: dayId, businessDate: day(5), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    await schedule.submit(v2.id, PLANNER);
    const published = await schedule.publish(v2.id, { changeReason: 'заміна за заявою' }, HEAD);
    expect(published.supersedesId).toBe(v1.id);

    const [old] = await testDb.db
      .select()
      .from(scheduleVersions)
      .where(eq(scheduleVersions.id, v1.id));
    expect(old?.status).toBe('SUPERSEDED');

    const outbox = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'SCHEDULE_CHANGED'));
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.payload.text).toMatch(/добавлено 1, отменено 1, изменено 1/);

    // Стара ознайомленість не переноситься: нова версія вимагає нового підтвердження (FR-SCH-03).
    expect(await schedule.unacknowledgedVersions(ivanov)).toEqual([
      { versionId: v2.id, periodMonth: MONTH },
    ]);
    const listed = await schedule.list({ siteId, orgUnitId: unitId, periodMonth: MONTH });
    expect(listed.map((v) => [v.versionNo, v.status])).toEqual([
      [2, 'PUBLISHED'],
      [1, 'SUPERSEDED'],
    ]);
  });

  it('відхиляє чужу зону, неактивного працівника, дату поза місяцем і дубль дня', async () => {
    const v = await schedule.createVersion(
      { siteId, orgUnitId: otherUnitId, periodMonth: MONTH },
      PLANNER,
    );
    const base = { employeeId: ivanov, templateId: dayId, kind: 'REGULAR' as const };
    await expect(
      schedule.putAssignments(
        v.id,
        { items: [{ ...base, businessDate: day(1), zoneId }] },
        PLANNER,
      ),
    ).rejects.toMatchObject({ code: 'ZONE_MISMATCH' });
    await expect(
      schedule.putAssignments(
        v.id,
        { items: [{ ...base, businessDate: `${addMonths(MONTH, 1)}-01` }] },
        PLANNER,
      ),
    ).rejects.toMatchObject({ code: 'DATE_OUTSIDE_PERIOD' });
    await expect(
      schedule.putAssignments(
        v.id,
        {
          items: [
            { ...base, businessDate: day(1) },
            { ...base, templateId: nightId, businessDate: day(1) },
          ],
        },
        PLANNER,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ASSIGNMENT' });
    await employeesService.changeStatus(petrova, { status: 'BLOCKED', reason: 'тест' }, PLANNER);
    await expect(
      schedule.putAssignments(
        v.id,
        { items: [{ ...base, employeeId: petrova, businessDate: day(1) }] },
        PLANNER,
      ),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_ACTIVE' });
  });

  it('a manual reminder reaches only employees with unacknowledged shifts, once per day', async () => {
    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      v1.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
          { employeeId: petrova, templateId: dayId, businessDate: day(2), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    await expect(schedule.remindAcknowledgement(v1.id, HEAD)).rejects.toMatchObject({
      code: 'SCHEDULE_NOT_PUBLISHED',
    });
    await schedule.submit(v1.id, PLANNER);
    await schedule.publish(v1.id, {}, HEAD);
    // Petrova acknowledges; Ivanov (the only one with Telegram) has not, so he is the one reminded.
    await schedule.acknowledge(v1.id, petrova, 'TELEGRAM');

    const first = await schedule.remindAcknowledgement(v1.id, HEAD);
    expect(first.reminded).toBe(1);
    const again = await schedule.remindAcknowledgement(v1.id, HEAD);
    expect(again.reminded).toBe(0);
    const queued = await testDb.db
      .select({ id: notificationOutbox.id, template: notificationOutbox.template })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'ACK_REMINDER'));
    expect(queued).toHaveLength(1);
  });

  it('revise publishes an edited copy of the published month in one step and rolls back on errors', async () => {
    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      v1.id,
      { items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }] },
      PLANNER,
    );
    await expect(schedule.revise(v1.id, { items: [] }, HEAD)).rejects.toMatchObject({
      code: 'SCHEDULE_NOT_PUBLISHED',
    });
    await schedule.submit(v1.id, PLANNER);
    await schedule.publish(v1.id, {}, HEAD);

    // two shifts on one day: the whole revision is rejected and no version is left behind
    await expect(
      schedule.revise(
        v1.id,
        {
          items: [
            { employeeId: ivanov, templateId: dayId, businessDate: day(3), kind: 'REGULAR' },
            { employeeId: ivanov, templateId: nightId, businessDate: day(3), kind: 'REGULAR' },
          ],
        },
        HEAD,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ASSIGNMENT' });
    expect(await schedule.list({ siteId, orgUnitId: unitId, periodMonth: MONTH })).toHaveLength(1);

    const revised = await schedule.revise(
      v1.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
          { employeeId: ivanov, templateId: nightId, businessDate: day(3), kind: 'REGULAR' },
        ],
        changeReason: 'added a night shift',
      },
      HEAD,
    );
    expect(revised).toMatchObject({
      versionNo: 2,
      status: 'PUBLISHED',
      supersedesId: v1.id,
      assignmentsCount: 2,
      changeReason: 'added a night shift',
    });
    const [old] = await testDb.db
      .select()
      .from(scheduleVersions)
      .where(eq(scheduleVersions.id, v1.id));
    expect(old?.status).toBe('SUPERSEDED');
    const changed = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.template, 'SCHEDULE_CHANGED'));
    expect(changed.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a draft with its assignments; a published version is refused', async () => {
    const draft = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      draft.id,
      { items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }] },
      PLANNER,
    );
    await schedule.deleteVersion(draft.id, PLANNER);
    await expect(schedule.detail(draft.id)).rejects.toMatchObject({
      code: 'SCHEDULE_VERSION_NOT_FOUND',
    });
    expect(await schedule.list({ siteId, orgUnitId: unitId, periodMonth: MONTH })).toHaveLength(0);

    const v1 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      v1.id,
      { items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }] },
      PLANNER,
    );
    await schedule.submit(v1.id, PLANNER);
    await expect(schedule.deleteVersion(v1.id, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_TRANSITION_NOT_ALLOWED',
    });
    await schedule.publish(v1.id, {}, HEAD);
    await expect(schedule.deleteVersion(v1.id, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_TRANSITION_NOT_ALLOWED',
    });

    // A superseded version that a later one points at is not deletable, and says so before the
    // button is offered: the panel used to show a delete the database then refused.
    const v2 = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH, basedOnVersionId: v1.id },
      PLANNER,
    );
    await schedule.submit(v2.id, PLANNER);
    await schedule.publish(v2.id, {}, HEAD);
    const superseded = (
      await schedule.list({ siteId, orgUnitId: unitId, periodMonth: MONTH })
    ).find((v) => v.id === v1.id);
    expect(superseded).toMatchObject({ status: 'SUPERSEDED', deletable: false });
    expect((await schedule.detail(v1.id)).version.deletable).toBe(false);
    await expect(schedule.deleteVersion(v1.id, PLANNER)).rejects.toMatchObject({
      code: 'SCHEDULE_VERSION_IN_USE',
    });
  });

  it('rejects a stale concurrent full-month save without changing the winning assignments', async () => {
    const version = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    const commands = [
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' as const },
        ],
      },
      {
        items: [
          {
            employeeId: petrova,
            templateId: nightId,
            businessDate: day(2),
            kind: 'REGULAR' as const,
          },
        ],
      },
    ];
    const results = await Promise.allSettled(
      commands.map((command) =>
        schedule.putAssignments(version.id, command, PLANNER, version.revision),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'SCHEDULE_REVISION_CONFLICT' } });
    const accepted = results.find((result) => result.status === 'fulfilled');
    if (!accepted || accepted.status !== 'fulfilled') throw new Error('Missing successful save');
    const detail = await schedule.detail(version.id);
    expect(detail.version.revision).toBe(version.revision + 1);
    expect(detail.assignments).toEqual(accepted.value.assignments);
    expect(accepted.value.version.revision).toBe(detail.version.revision);
  });

  it('checks lifecycle revisions under lock and advances revisions for internal writers too', async () => {
    const version = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    const saved = await schedule.putAssignments(
      version.id,
      { items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }] },
      PLANNER,
    );
    expect(saved.version.revision).toBe(version.revision + 1);
    await expect(schedule.submit(version.id, PLANNER, version.revision)).rejects.toMatchObject({
      code: 'SCHEDULE_REVISION_CONFLICT',
    });
    const submitted = await schedule.submit(version.id, PLANNER, saved.version.revision);
    expect(submitted.revision).toBe(saved.version.revision + 1);
    await expect(
      schedule.returnToDraft(
        version.id,
        { comment: 'Return stale review' },
        HEAD,
        saved.version.revision,
      ),
    ).rejects.toMatchObject({ code: 'SCHEDULE_REVISION_CONFLICT' });
    await expect(
      schedule.publish(version.id, {}, HEAD, saved.version.revision),
    ).rejects.toMatchObject({ code: 'SCHEDULE_REVISION_CONFLICT' });
    const published = await schedule.publish(version.id, {}, HEAD, submitted.revision);
    expect(published.revision).toBe(submitted.revision + 1);
    await expect(
      schedule.revise(version.id, { items: [] }, HEAD, submitted.revision),
    ).rejects.toMatchObject({ code: 'SCHEDULE_REVISION_CONFLICT' });
    expect((await schedule.detail(version.id)).version.status).toBe('PUBLISHED');
  });

  it('does not delete a version changed since the deleting editor read it', async () => {
    const version = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    const updated = await schedule.putAssignments(
      version.id,
      { items: [] },
      PLANNER,
      version.revision,
    );
    await expect(
      schedule.deleteVersion(version.id, PLANNER, version.revision),
    ).rejects.toMatchObject({ code: 'SCHEDULE_REVISION_CONFLICT' });
    expect((await schedule.detail(version.id)).version.revision).toBe(updated.version.revision);
    await schedule.deleteVersion(version.id, PLANNER, updated.version.revision);
    await expect(schedule.detail(version.id)).rejects.toMatchObject({
      code: 'SCHEDULE_VERSION_NOT_FOUND',
    });
  });

  it('invalidates a review revision when HR removes an unworked employee and their planned assignments', async () => {
    const version = await schedule.createVersion(
      { siteId, orgUnitId: unitId, periodMonth: MONTH },
      PLANNER,
    );
    await schedule.putAssignments(
      version.id,
      {
        items: [
          { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
          { employeeId: petrova, templateId: nightId, businessDate: day(2), kind: 'REGULAR' },
        ],
      },
      PLANNER,
    );
    const reviewed = await schedule.submit(version.id, PLANNER);
    await employeesService.deleteEmployee(
      ivanov,
      { reason: 'Remove unworked duplicate card' },
      PLANNER,
    );
    const changed = await schedule.detail(version.id);
    expect(changed.version.revision).toBe(reviewed.revision + 1);
    expect(changed.assignments.map((item) => item.employeeId)).toEqual([petrova]);
    await expect(schedule.publish(version.id, {}, HEAD, reviewed.revision)).rejects.toMatchObject({
      code: 'SCHEDULE_REVISION_CONFLICT',
    });
    expect((await schedule.detail(version.id)).version.status).toBe('IN_REVIEW');
  });
  describe('staffing demand and qualifications (#11, SC-01/SC-04)', () => {
    it('audits configuration and blocks an unqualified assignment where every row demands a qualification', async () => {
      const staffing = new StaffingService(testDb.db, new AuditLog());
      const operator = await staffing.createQualification(
        { siteId, code: 'OPERATOR', name: 'Line operator' },
        HEAD,
      );
      await expect(
        staffing.createQualification({ siteId, code: 'OPERATOR', name: 'Duplicate' }, HEAD),
      ).rejects.toMatchObject({ code: 'QUALIFICATION_EXISTS' });
      const requirement = await staffing.setRequirement(
        {
          zoneId,
          templateId: dayId,
          requiredCount: 2,
          qualificationId: operator.id,
          effectiveFrom: day(1),
        },
        HEAD,
      );
      const updated = await staffing.setRequirement(
        {
          id: requirement.id,
          zoneId,
          templateId: dayId,
          requiredCount: 3,
          qualificationId: operator.id,
          effectiveFrom: day(1),
          effectiveTo: day(20),
        },
        HEAD,
      );
      expect(updated).toMatchObject({ id: requirement.id, requiredCount: 3, effectiveTo: day(20) });
      await staffing.recordHolding(
        {
          employeeId: ivanov,
          qualificationId: operator.id,
          validFrom: day(1),
          validUntil: day(10),
        },
        PLANNER,
      );
      const view = await staffing.view(siteId, unitId);
      expect(view.requirements).toHaveLength(1);
      expect(view.holdings).toHaveLength(1);
      const audit = await testDb.db.select().from(auditLog);
      expect(audit.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'staffing.qualification.create',
          'staffing.requirement.set',
          'staffing.qualification.record',
        ]),
      );
      const draft = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      // Ivanov holds the qualification until day 10; Petrova never does.
      await expect(
        schedule.putAssignments(
          draft.id,
          {
            items: [
              {
                employeeId: petrova,
                templateId: dayId,
                businessDate: day(3),
                zoneId,
                kind: 'REGULAR',
              },
            ],
          },
          PLANNER,
          draft.revision,
        ),
      ).rejects.toMatchObject({ code: 'QUALIFICATION_REQUIRED', status: 422 });
      await expect(
        schedule.putAssignments(
          draft.id,
          {
            items: [
              {
                employeeId: ivanov,
                templateId: dayId,
                businessDate: day(12),
                zoneId,
                kind: 'REGULAR',
              },
            ],
          },
          PLANNER,
          draft.revision,
        ),
      ).rejects.toMatchObject({ code: 'QUALIFICATION_REQUIRED' });
      const saved = await schedule.putAssignments(
        draft.id,
        {
          items: [
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(3),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: petrova,
              templateId: nightId,
              businessDate: day(3),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: petrova,
              templateId: dayId,
              businessDate: day(25),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        PLANNER,
        draft.revision,
      );
      expect(saved.assignments).toHaveLength(3);
      // A second row without a qualification makes the zone accept unqualified people again.
      await staffing.setRequirement(
        {
          zoneId,
          templateId: dayId,
          requiredCount: 1,
          qualificationId: null,
          effectiveFrom: day(1),
        },
        HEAD,
      );
      const mixed = await schedule.putAssignments(
        draft.id,
        {
          items: [
            {
              employeeId: petrova,
              templateId: dayId,
              businessDate: day(3),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        PLANNER,
        saved.version.revision,
      );
      expect(mixed.assignments).toHaveLength(1);
      await staffing.removeRequirement(requirement.id, HEAD);
      await expect(staffing.removeRequirement(requirement.id, HEAD)).rejects.toMatchObject({
        code: 'REQUIREMENT_NOT_FOUND',
      });
    });
  });

  describe('eligibility rules (#12, SC-02/05/06/17/33)', () => {
    const item = (employeeId: string, businessDate: string, templateId: string, zone = true) => ({
      employeeId,
      templateId,
      businessDate,
      ...(zone ? { zoneId } : {}),
      kind: 'REGULAR' as const,
    });
    it('rejects a cross-unit overlap even when two units save concurrently, and keeps adjacent shifts', async () => {
      const first = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      const second = await schedule.createVersion(
        { siteId, orgUnitId: otherUnitId, periodMonth: MONTH },
        PLANNER,
      );
      const results = await Promise.allSettled([
        schedule.putAssignments(
          first.id,
          { items: [item(ivanov, day(3), dayId)] },
          PLANNER,
          first.revision,
        ),
        schedule.putAssignments(
          second.id,
          { items: [item(ivanov, day(3), dayId, false)] },
          PLANNER,
          second.revision,
        ),
      ]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'SCHEDULE_ELIGIBILITY',
        status: 422,
      });
      const stored = await testDb.db.select().from(shiftAssignments);
      expect(stored).toHaveLength(1);
      // The night after the day shift ends exactly when it starts elsewhere: adjacent, not overlapping.
      const winner = fulfilled[0]?.status === 'fulfilled' ? fulfilled[0].value.version : null;
      const loser = winner?.id === first.id ? second : first;
      const loserVersion = await schedule.requireVersion(loser.id);
      const saved = await schedule.putAssignments(
        loser.id,
        { items: [item(ivanov, day(3), nightId, loser.id === first.id)] },
        PLANNER,
        loserVersion.revision,
      );
      expect(saved.assignments).toHaveLength(1);
    });
    it('warns about short rest by default, blocks when the site configures it, and blocks approved absences', async () => {
      const staffing = new StaffingService(testDb.db, new AuditLog());
      const draft = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      const tight = { items: [item(ivanov, day(3), nightId), item(ivanov, day(4), dayId)] };
      const saved = await schedule.putAssignments(draft.id, tight, PLANNER, draft.revision);
      expect(saved.assignments).toHaveLength(2);
      const rules = await staffing.setRules(
        {
          siteId,
          minRestMinutes: 660,
          maxMonthMinutes: 12_000,
          restSeverity: 'BLOCK',
          hoursSeverity: 'WARN',
        },
        HEAD,
      );
      expect(rules.configured).toBe(true);
      await expect(
        schedule.putAssignments(
          draft.id,
          { items: [...tight.items, item(petrova, day(5), dayId)] },
          PLANNER,
          saved.version.revision,
        ),
      ).rejects.toMatchObject({ code: 'SCHEDULE_ELIGIBILITY' });
      await testDb.db.insert(requests).values({
        type: 'VACATION',
        employeeId: petrova,
        status: 'APPROVED',
        periodFrom: day(10),
        periodTo: day(12),
        payload: {},
      });
      await expect(
        schedule.putAssignments(
          draft.id,
          { items: [item(petrova, day(11), dayId)] },
          PLANNER,
          saved.version.revision,
        ),
      ).rejects.toMatchObject({ code: 'SCHEDULE_ELIGIBILITY' });
      const candidates = await staffing.candidates({
        siteId,
        orgUnitId: unitId,
        zoneId,
        templateId: dayId,
        businessDate: day(11),
      });
      const petrovaCandidate = candidates.find((candidate) => candidate.employeeId === petrova);
      expect(petrovaCandidate?.status).toBe('BLOCKED');
      expect(petrovaCandidate?.reasons.map((reason) => reason.code)).toEqual(['ABSENCE']);
      expect(candidates.find((candidate) => candidate.employeeId === ivanov)?.status).toBe(
        'ELIGIBLE',
      );
      const context = await staffing.context(siteId, otherUnitId, MONTH);
      expect(context.intervals.filter((row) => row.orgUnitId === unitId)).toHaveLength(2);
      expect(context.absences).toEqual([
        expect.objectContaining({ employeeId: petrova, status: 'APPROVED', type: 'VACATION' }),
      ]);
    });
  });

  describe('saved patterns (#14, SC-26)', () => {
    it('saves, updates by name, lists and removes site patterns with audit', async () => {
      const patterns = new PatternsService(testDb.db, new AuditLog());
      const saved = await patterns.save(
        {
          siteId,
          name: 'Two on two off',
          definition: { pattern: 'DAY_2_2', templateId: null, mode: 'replace', zoneId },
        },
        PLANNER,
      );
      const updated = await patterns.save(
        {
          siteId,
          name: 'Two on two off',
          definition: { pattern: 'DAY_2_2', templateId: null, mode: 'fill', zoneId: null },
        },
        PLANNER,
      );
      expect(updated.id).toBe(saved.id);
      expect(updated.definition.mode).toBe('fill');
      expect(await patterns.list(siteId)).toHaveLength(1);
      expect(await patterns.siteOf(saved.id)).toBe(siteId);
      await patterns.remove(saved.id, PLANNER);
      expect(await patterns.list(siteId)).toEqual([]);
      await expect(patterns.remove(saved.id, PLANNER)).rejects.toMatchObject({
        code: 'PATTERN_NOT_FOUND',
      });
      const audit = await testDb.db.select().from(auditLog);
      expect(audit.map((row) => row.action)).toEqual(
        expect.arrayContaining(['schedule.pattern.save', 'schedule.pattern.remove']),
      );
    });
  });

  describe('custom time and zone segments (#15, SC-32/SC-37, D-04)', () => {
    it('plans custom instants, tiles segments, copies them on revision and rejects bad tilings', async () => {
      const secondZone = (
        await org.createZone(
          {
            siteId,
            orgUnitId: unitId,
            code: 'FILL_2',
            name: 'Линия 2',
            type: 'FILLING',
            isShared: false,
          },
          PLANNER,
        )
      ).id;
      const foreignZone = (
        await org.createZone(
          {
            siteId,
            orgUnitId: otherUnitId,
            code: 'PACK_1',
            name: 'Упаковка',
            type: 'PACKAGING',
            isShared: false,
          },
          PLANNER,
        )
      ).id;
      const v1 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      const base = {
        employeeId: ivanov,
        templateId: dayId,
        businessDate: day(1),
        zoneId,
        kind: 'REGULAR' as const,
      };
      const bad = (
        segments: { zoneId: string; localStart: string; localEnd: string }[],
        custom?: [string, string],
      ) =>
        schedule.putAssignments(
          v1.id,
          {
            items: [
              custom
                ? { ...base, customStart: custom[0], customEnd: custom[1], segments }
                : { ...base, segments },
            ],
          },
          PLANNER,
        );
      await expect(bad([{ zoneId, localStart: '08:00', localEnd: '14:00' }])).rejects.toMatchObject(
        { code: 'SEGMENT_GAP' },
      );
      await expect(
        bad([
          { zoneId, localStart: '08:00', localEnd: '15:00' },
          { zoneId: secondZone, localStart: '14:00', localEnd: '20:00' },
        ]),
      ).rejects.toMatchObject({ code: 'SEGMENT_OVERLAP' });
      await expect(bad([{ zoneId, localStart: '07:00', localEnd: '20:00' }])).rejects.toMatchObject(
        { code: 'SEGMENT_BOUNDS' },
      );
      await expect(
        bad([{ zoneId: foreignZone, localStart: '08:00', localEnd: '20:00' }]),
      ).rejects.toMatchObject({ code: 'ZONE_MISMATCH' });

      const saved = await schedule.putAssignments(
        v1.id,
        {
          items: [
            {
              ...base,
              customStart: '10:00',
              customEnd: '22:00',
              segments: [
                { zoneId, localStart: '10:00', localEnd: '16:00' },
                { zoneId: secondZone, localStart: '16:00', localEnd: '22:00' },
              ],
            },
            {
              employeeId: petrova,
              templateId: nightId,
              businessDate: day(1),
              zoneId,
              kind: 'REGULAR',
              segments: [
                { zoneId, localStart: '20:00', localEnd: '02:00' },
                { zoneId: secondZone, localStart: '02:00', localEnd: '08:00' },
              ],
            },
          ],
        },
        PLANNER,
      );
      const custom = saved.assignments.find((a) => a.employeeId === ivanov);
      expect(custom).toMatchObject({ customStart: '10:00', customEnd: '22:00' });
      // 10:00 Kyiv = 07:00Z in summer time, 08:00Z after the autumn change.
      expect(['07:00', '08:00']).toContain(custom!.planStartAt.slice(11, 16));
      expect(custom!.segments.map((s) => [s.position, s.zoneId, s.localStart, s.localEnd])).toEqual(
        [
          [0, zoneId, '10:00', '16:00'],
          [1, secondZone, '16:00', '22:00'],
        ],
      );
      const night = saved.assignments.find((a) => a.employeeId === petrova);
      expect(night).toMatchObject({ customStart: null, customEnd: null });
      expect(night!.segments).toHaveLength(2);

      await schedule.submit(v1.id, PLANNER);
      await schedule.publish(v1.id, {}, HEAD);
      const reminder = (await timerJobs()).find(
        (job) => job.jobId.startsWith('shift-reminder.') && job.jobId.includes(custom!.id),
      );
      expect(reminder?.fireAt.toISOString()).toBe(
        new Date(new Date(custom!.planStartAt).getTime() - 120 * 60_000).toISOString(),
      );

      const revised = await schedule.revise(
        v1.id,
        {
          items: [
            {
              ...base,
              customStart: '10:00',
              customEnd: '22:00',
              segments: [
                { zoneId, localStart: '10:00', localEnd: '16:00' },
                { zoneId: secondZone, localStart: '16:00', localEnd: '22:00' },
              ],
            },
            {
              employeeId: petrova,
              templateId: nightId,
              businessDate: day(1),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        HEAD,
      );
      const copy = (await schedule.detail(revised.id)).assignments.find(
        (a) => a.employeeId === ivanov,
      );
      expect(copy).toMatchObject({ customStart: '10:00', customEnd: '22:00' });
      expect(copy!.segments).toHaveLength(2);

      const v3 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      const inherited = (await schedule.detail(v3.id)).assignments.find(
        (a) => a.employeeId === ivanov,
      );
      expect(inherited).toMatchObject({ customStart: '10:00', customEnd: '22:00' });
      expect(inherited!.segments.map((s) => s.zoneId)).toEqual([zoneId, secondZone]);
    });
  });

  describe('planned breaks and relief (#16, SC-36)', () => {
    it('stores ordered breaks with valid relief, blocks invalid relief and copies breaks on revision', async () => {
      const v1 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      const ivanovDay = {
        employeeId: ivanov,
        templateId: dayId,
        businessDate: day(1),
        zoneId,
        kind: 'REGULAR' as const,
      };
      const petrovaDay = { ...ivanovDay, employeeId: petrova };
      await expect(
        schedule.putAssignments(
          v1.id,
          { items: [{ ...ivanovDay, breaks: [{ localStart: '19:30', localEnd: '20:30' }] }] },
          PLANNER,
        ),
      ).rejects.toMatchObject({ code: 'BREAK_BOUNDS' });
      await expect(
        schedule.putAssignments(
          v1.id,
          {
            items: [
              {
                ...ivanovDay,
                breaks: [{ localStart: '12:00', localEnd: '12:30', reliefEmployeeId: petrova }],
              },
            ],
          },
          PLANNER,
        ),
      ).rejects.toMatchObject({ code: 'SCHEDULE_ELIGIBILITY' });
      const saved = await schedule.putAssignments(
        v1.id,
        {
          items: [
            {
              ...ivanovDay,
              breaks: [
                { localStart: '12:00', localEnd: '12:30', reliefEmployeeId: petrova },
                { localStart: '16:00', localEnd: '16:15' },
              ],
            },
            petrovaDay,
          ],
        },
        PLANNER,
      );
      const stored = saved.assignments.find((a) => a.employeeId === ivanov);
      expect(
        stored!.breaks.map((b) => [b.position, b.localStart, b.localEnd, b.reliefEmployeeId]),
      ).toEqual([
        [0, '12:00', '12:30', petrova],
        [1, '16:00', '16:15', null],
      ]);
      await schedule.submit(v1.id, PLANNER);
      await schedule.publish(v1.id, {}, HEAD);
      const revised = await schedule.revise(
        v1.id,
        {
          items: [
            {
              ...ivanovDay,
              breaks: [{ localStart: '12:00', localEnd: '12:30', reliefEmployeeId: petrova }],
            },
            petrovaDay,
          ],
        },
        HEAD,
      );
      const copy = (await schedule.detail(revised.id)).assignments.find(
        (a) => a.employeeId === ivanov,
      );
      expect(copy!.breaks).toHaveLength(1);
      const v3 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      const inherited = (await schedule.detail(v3.id)).assignments.find(
        (a) => a.employeeId === ivanov,
      );
      expect(inherited!.breaks.map((b) => b.reliefEmployeeId)).toEqual([petrova]);
    });
  });

  describe('open slots, offers and interest (#13, SC-15/SC-16, D-06)', () => {
    const grants = () => [{ role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: unitId }] as const;
    it('keeps a slot internal until offered, records interest without assigning and fills once', async () => {
      const slots = new OpenSlotsService(
        testDb.db,
        new EventStore(),
        new AuditLog(),
        new NotificationsService(),
        schedule,
      );
      const v1 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      await schedule.putAssignments(
        v1.id,
        {
          items: [
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(2),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        PLANNER,
      );
      const slot = await slots.create(
        {
          siteId,
          orgUnitId: unitId,
          periodMonth: MONTH,
          businessDate: day(3),
          templateId: dayId,
          zoneId,
        },
        PLANNER,
      );
      expect(slot).toMatchObject({ status: 'OPEN', offer: null, offerCount: 0 });
      // An internal slot is neither an assignment nor an employee-visible offer.
      expect((await schedule.detail(v1.id)).assignments).toHaveLength(1);
      expect(await testDb.db.select().from(notificationOutbox)).toHaveLength(0);
      await expect(
        slots.create(
          {
            siteId,
            orgUnitId: unitId,
            periodMonth: MONTH,
            businessDate: `${addMonths(MONTH, 1)}-01`,
            templateId: dayId,
            zoneId,
          },
          PLANNER,
        ),
      ).rejects.toMatchObject({ code: 'DATE_OUTSIDE_MONTH' });

      const offered = await slots.offer(slot.id, { audience: 'UNIT' }, PLANNER);
      expect(offered.status).toBe('OFFERED');
      expect(offered.offer).toMatchObject({ status: 'OPEN', audience: 'UNIT', notifiedCount: 1 });
      const outbox = await testDb.db.select().from(notificationOutbox);
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({ recipientId: ivanov, template: 'SLOT_OFFERED' });
      const offerId = offered.offer!.id;
      expect(outbox[0]?.payload.buttons?.[0]?.[0]?.callbackData).toBe(`slot:${offerId}:yes`);
      await expect(slots.offer(slot.id, { audience: 'UNIT' }, PLANNER)).rejects.toMatchObject({
        code: 'SLOT_NOT_OPEN',
      });

      expect(await slots.respond(offerId, ivanov, 'INTERESTED')).toEqual({
        kind: 'RECORDED',
        response: 'INTERESTED',
      });
      expect(await slots.respond(offerId, ivanov, 'DECLINED')).toEqual({
        kind: 'RECORDED',
        response: 'DECLINED',
      });
      await slots.respond(offerId, ivanov, 'INTERESTED');
      await slots.respond(offerId, petrova, 'INTERESTED');
      const listed = await slots.list({ siteId, orgUnitId: unitId, periodMonth: MONTH });
      expect(listed[0]?.offer?.interests.map((i) => [i.employeeId, i.response])).toEqual([
        [ivanov, 'INTERESTED'],
        [petrova, 'INTERESTED'],
      ]);
      // Interest changed nothing in the plan.
      expect((await schedule.detail(v1.id)).assignments).toHaveLength(1);

      const revision = (await schedule.detail(v1.id)).version.revision;
      await expect(
        slots.select(
          slot.id,
          { employeeId: ivanov, versionId: v1.id, expectedRevision: revision + 5 },
          PLANNER,
          grants(),
        ),
      ).rejects.toMatchObject({ code: 'SCHEDULE_REVISION_CONFLICT' });
      const selected = await slots.select(
        slot.id,
        { employeeId: ivanov, versionId: v1.id, expectedRevision: revision },
        PLANNER,
        grants(),
      );
      expect(selected.slot).toMatchObject({ status: 'FILLED', filledEmployeeId: ivanov });
      expect(selected.slot.offer).toMatchObject({ status: 'CLOSED' });
      expect(selected.slot.offer?.interests).toHaveLength(2);
      expect(selected.detail.assignments.map((a) => [a.employeeId, a.businessDate])).toEqual(
        expect.arrayContaining([
          [ivanov, day(2)],
          [ivanov, day(3)],
        ]),
      );
      const afterSelect = await testDb.db.select().from(notificationOutbox);
      expect(afterSelect.map((row) => row.template)).toEqual(
        expect.arrayContaining(['SLOT_OFFERED', 'SLOT_SELECTED']),
      );
      // The losing decision and stale employee taps change nothing.
      const current = (await schedule.detail(v1.id)).version.revision;
      await expect(
        slots.select(
          slot.id,
          { employeeId: petrova, versionId: v1.id, expectedRevision: current },
          PLANNER,
          grants(),
        ),
      ).rejects.toMatchObject({ code: 'SLOT_FILLED' });
      expect(await slots.respond(offerId, petrova, 'DECLINED')).toEqual({ kind: 'CLOSED' });
      expect((await schedule.detail(v1.id)).assignments).toHaveLength(2);

      // Withdraw keeps the responses in history; cancel closes for good.
      const second = await slots.create(
        {
          siteId,
          orgUnitId: unitId,
          periodMonth: MONTH,
          businessDate: day(4),
          templateId: dayId,
          zoneId,
        },
        PLANNER,
      );
      const secondOffered = await slots.offer(second.id, { audience: 'ALL' }, PLANNER);
      await slots.respond(secondOffered.offer!.id, ivanov, 'INTERESTED');
      const withdrawn = await slots.withdraw(second.id, PLANNER);
      expect(withdrawn.status).toBe('OPEN');
      expect(withdrawn.offer).toMatchObject({ status: 'CANCELLED' });
      expect(withdrawn.offer?.interests).toHaveLength(1);
      expect(await slots.respond(secondOffered.offer!.id, petrova, 'INTERESTED')).toEqual({
        kind: 'CLOSED',
      });
      const reoffered = await slots.offer(second.id, { audience: 'UNIT' }, PLANNER);
      expect(reoffered.offerCount).toBe(2);
      const cancelled = await slots.cancel(second.id, PLANNER);
      expect(cancelled.status).toBe('CANCELLED');
      await expect(slots.offer(second.id, { audience: 'UNIT' }, PLANNER)).rejects.toMatchObject({
        code: 'SLOT_NOT_OPEN',
      });

      // Two competing selections fill a third slot at most once.
      const third = await slots.create(
        {
          siteId,
          orgUnitId: unitId,
          periodMonth: MONTH,
          businessDate: day(5),
          templateId: dayId,
          zoneId,
        },
        PLANNER,
      );
      const base = (await schedule.detail(v1.id)).version.revision;
      const race = await Promise.allSettled([
        slots.select(
          third.id,
          { employeeId: ivanov, versionId: v1.id, expectedRevision: base },
          PLANNER,
          grants(),
        ),
        slots.select(
          third.id,
          { employeeId: petrova, versionId: v1.id, expectedRevision: base },
          PLANNER,
          grants(),
        ),
      ]);
      expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const loser = race.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(['SLOT_FILLED', 'SCHEDULE_REVISION_CONFLICT']).toContain(loser.reason.code);
      const finalSlots = await slots.list({ siteId, orgUnitId: unitId, periodMonth: MONTH });
      expect(finalSlots.find((s) => s.id === third.id)?.status).toBe('FILLED');
      const audit = await testDb.db.select().from(auditLog);
      expect(audit.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'schedule.slot.create',
          'schedule.slot.offer',
          'schedule.slot.select',
          'schedule.slot.withdraw',
          'schedule.slot.cancel',
        ]),
      );
    });
  });

  describe('operational context and borrowing (#17, SC-03/07/13/14/34/38)', () => {
    it('reports presence evidence without inventing no-shows, lists request steps and guards borrowing', async () => {
      const staffing = new StaffingService(testDb.db, new AuditLog());
      const v1 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      await schedule.putAssignments(
        v1.id,
        {
          items: [
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(1),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: petrova,
              templateId: nightId,
              businessDate: day(1),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: petrova,
              templateId: dayId,
              businessDate: day(3),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        PLANNER,
      );
      await schedule.submit(v1.id, PLANNER);
      await schedule.publish(v1.id, {}, HEAD);
      const detail = await schedule.detail(v1.id);
      const ivanovShift = detail.assignments.find((a) => a.employeeId === ivanov)!;
      const petrovaNight = detail.assignments.find(
        (a) => a.employeeId === petrova && a.businessDate === day(1),
      )!;
      await schedule.acknowledge(v1.id, ivanov, 'TELEGRAM');
      const [presence] = await testDb.db
        .insert(presenceSessions)
        .values({
          employeeId: ivanov,
          assignmentId: ivanovShift.id,
          arrivedAt: new Date(ivanovShift.planStartAt),
          arrivalMethod: 'QR',
        })
        .returning();
      await testDb.db.insert(shiftSessions).values({
        employeeId: ivanov,
        assignmentId: ivanovShift.id,
        presenceId: presence!.id,
        businessDate: day(1),
        state: 'WORKING',
        startedAt: new Date(new Date(ivanovShift.planStartAt).getTime() + 5 * 60_000),
        planStartAt: new Date(ivanovShift.planStartAt),
        planEndAt: new Date(ivanovShift.planEndAt),
      });
      await testDb.db.insert(requests).values({
        type: 'SWAP',
        employeeId: ivanov,
        counterpartEmployeeId: petrova,
        assignmentId: ivanovShift.id,
        payload: { counterpartAssignmentId: petrovaNight.id },
        status: 'SUBMITTED',
        currentStep: 0,
        comment: 'swap please',
      });
      await testDb.db.insert(requests).values({
        type: 'VACATION',
        employeeId: petrova,
        periodFrom: day(3),
        periodTo: day(4),
        status: 'APPROVED',
        currentStep: 1,
        comment: 'approved leave',
      });
      const range = { siteId, orgUnitId: unitId, from: day(1), to: day(7) };
      const before = await staffing.operations(range, new Date(`${MONTH}-01T00:00:00Z`));
      const state = (view: typeof before, employeeId: string, date: string) =>
        view.presence.find((p) => p.employeeId === employeeId && p.businessDate === date)?.state;
      expect(state(before, ivanov, day(1))).toBe('STARTED');
      expect(state(before, petrova, day(1))).toBe('SCHEDULED');
      // After the planned start with nothing recorded the state is "no evidence", never a no-show.
      const after = await staffing.operations(range, new Date('2099-01-01T00:00:00Z'));
      expect(state(after, petrova, day(1))).toBe('NO_EVIDENCE');
      expect(state(after, petrova, day(3))).toBe('NO_EVIDENCE');
      expect(before.presence.find((p) => p.employeeId === ivanov)?.acknowledgedAt).not.toBeNull();
      expect(before.requests.map((r) => [r.type, r.status])).toEqual(
        expect.arrayContaining([
          ['SWAP', 'SUBMITTED'],
          ['VACATION', 'APPROVED'],
        ]),
      );
      expect(before.requests.find((r) => r.type === 'SWAP')?.currentStepKey).toEqual(
        expect.any(String),
      );
      const swap = before.requests.find((r) => r.type === 'SWAP')!;
      expect(swap).toMatchObject({
        employeeId: ivanov,
        counterpartEmployeeId: petrova,
        assignmentId: ivanovShift.id,
        assignmentDate: day(1),
        currentStep: 0,
      });
      expect(swap.totalSteps).toBeGreaterThanOrEqual(1);

      // Borrowing (D-06/SC-38): petrova's position is in the other unit.
      const [position] = await testDb.db
        .insert(positions)
        .values({ code: 'OP', name: 'Operator' })
        .returning();
      await testDb.db.insert(employeePositions).values([
        { employeeId: ivanov, orgUnitId: unitId, positionId: position!.id, validFrom: new Date(0) },
        {
          employeeId: petrova,
          orgUnitId: otherUnitId,
          positionId: position!.id,
          validFrom: new Date(0),
        },
      ]);
      const target = { siteId, orgUnitId: unitId };
      const items = [{ employeeId: petrova, businessDate: day(5) }];
      await expect(
        schedule.assertBorrowingAuthority(
          [{ role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: unitId }],
          target,
          items,
        ),
      ).rejects.toMatchObject({ code: 'SCHEDULE_BORROWING_AUTHORITY' });
      await expect(
        schedule.assertBorrowingAuthority(
          [{ role: 'PLANNER', scopeType: 'ORG_UNIT', scopeId: unitId }],
          target,
          [{ employeeId: ivanov, businessDate: day(5) }],
        ),
      ).resolves.toBeUndefined();
      await expect(
        schedule.assertBorrowingAuthority(
          [{ role: 'PRODUCTION_HEAD', scopeType: 'SITE', scopeId: siteId }],
          target,
          items,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('notes and retrospective output (#18, SC-39/41/43)', () => {
    it('keeps planner notes off the bot, shows employee notes in the plan, and reports evidence separately', async () => {
      const notes = new NotesService(testDb.db, new AuditLog());
      const v1 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      await schedule.putAssignments(
        v1.id,
        {
          items: [
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(1),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(2),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(3),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        PLANNER,
      );
      await schedule.submit(v1.id, PLANNER);
      await schedule.publish(v1.id, {}, HEAD);
      const scope = { siteId, orgUnitId: unitId, periodMonth: MONTH };
      await notes.create(
        {
          ...scope,
          businessDate: day(1),
          zoneId: null,
          employeeId: null,
          audience: 'PLANNERS',
          text: 'Audit visit; keep the line staffed',
        },
        PLANNER,
      );
      await notes.create(
        {
          ...scope,
          businessDate: day(2),
          zoneId: null,
          employeeId: ivanov,
          audience: 'EMPLOYEES',
          text: 'Bring the new badge',
        },
        PLANNER,
      );
      await notes.create(
        {
          ...scope,
          businessDate: null,
          zoneId: null,
          employeeId: null,
          audience: 'EMPLOYEES',
          text: 'Canteen closed this month',
        },
        PLANNER,
      );
      await notes.create(
        {
          ...scope,
          businessDate: day(2),
          zoneId: null,
          employeeId: petrova,
          audience: 'EMPLOYEES',
          text: 'Not for Ivanov',
        },
        PLANNER,
      );
      await expect(
        notes.create(
          {
            ...scope,
            businessDate: `${addMonths(MONTH, 1)}-01`,
            zoneId: null,
            employeeId: null,
            audience: 'PLANNERS',
            text: 'x',
          },
          PLANNER,
        ),
      ).rejects.toMatchObject({ code: 'DATE_OUTSIDE_MONTH' });
      expect(await notes.list(scope)).toHaveLength(4);
      const plan = await schedule.myPlan(ivanov, MONTH);
      expect(plan.notes).toHaveLength(2);
      expect(plan.notes).toEqual(
        expect.arrayContaining([
          { date: null, text: 'Canteen closed this month' },
          { date: day(2), text: 'Bring the new badge' },
        ]),
      );
      const screen = planScreen(messages('en'), plan, null);
      expect(screen.text).toContain('📝 Bring the new badge');
      expect(screen.text).toContain('📝 Canteen closed this month');
      expect(screen.text).not.toContain('Audit visit');
      expect(screen.text).not.toContain('Not for Ivanov');

      // Retrospective: recorded, unknown departure and missing actuals stay separate.
      const detail = await schedule.detail(v1.id);
      const first = detail.assignments.find((a) => a.businessDate === day(1))!;
      const second = detail.assignments.find((a) => a.businessDate === day(2))!;
      const [closed] = await testDb.db
        .insert(shiftSessions)
        .values({
          employeeId: ivanov,
          assignmentId: first.id,
          businessDate: day(1),
          state: 'SHIFT_CLOSED',
          startedAt: new Date(first.planStartAt),
          endedAt: new Date(first.planEndAt),
          planStartAt: new Date(first.planStartAt),
          planEndAt: new Date(first.planEndAt),
        })
        .returning();
      await testDb.db.insert(shiftSummaries).values({
        shiftSessionId: closed!.id,
        employeeId: ivanov,
        businessDate: day(1),
        plannedMinutes: 720,
        totalMinutes: 715,
        workMinutes: 600,
        preparationMinutes: 15,
        serviceMinutes: 0,
        breakMinutes: 60,
        mealMinutes: 40,
        downtimeMinutes: 0,
      });
      await testDb.db.insert(shiftSessions).values({
        employeeId: ivanov,
        assignmentId: second.id,
        businessDate: day(2),
        state: 'SHIFT_CLOSED',
        startedAt: new Date(second.planStartAt),
        endedAt: new Date(second.planEndAt),
        autoCloseReason: 'NO_CHECKLIST',
        planStartAt: new Date(second.planStartAt),
        planEndAt: new Date(second.planEndAt),
      });
      const retrospective = new RetrospectiveService(testDb.db);
      const view = await retrospective.view(scope);
      expect(view.version).toMatchObject({ id: v1.id, versionNo: 1 });
      expect(view.rows.map((row) => [row.businessDate, row.departure, row.workMinutes])).toEqual([
        [day(1), 'RECORDED', 600],
        [day(2), 'UNKNOWN', null],
        [day(3), 'NONE', null],
      ]);
      expect(view.totals).toEqual([
        {
          employeeId: ivanov,
          shifts: 3,
          plannedMinutes: 2160,
          workMinutes: 600,
          recordedShifts: 2,
          unknownDepartures: 1,
          missingActuals: 1,
        },
      ]);
      const file = await retrospective.export(scope, {
        id: randomUUID(),
        name: 'Head',
        email: 'head@example.test',
        twoFactorEnabled: true,
        grants: [{ role: 'PRODUCTION_HEAD', scopeType: 'SITE', scopeId: siteId }],
      });
      const book = XLSX.read(file.body, { type: 'buffer' });
      expect(book.SheetNames).toHaveLength(3);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        book.Sheets[book.SheetNames[1]!]!,
      );
      expect(rows).toHaveLength(3);
      expect(Object.values(rows[0]!)).toContain('Иванов Иван');
      const meta = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]!]!, {
        header: 1,
      });
      expect(meta.flat()).toEqual(expect.arrayContaining([v1.id, 'Europe/Kyiv', MONTH]));
    });
  });

  describe('personal calendar feed (#19, SC-44)', () => {
    it('exposes only own published shifts with stable identity, revokes and rotates tokens', async () => {
      const feed = new FeedService(testDb.db, new EventStore(), new AuditLog());
      const v1 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      await schedule.putAssignments(
        v1.id,
        {
          items: [
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(1),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: petrova,
              templateId: nightId,
              businessDate: day(1),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        PLANNER,
      );
      const token = await feed.issue(ivanov);
      expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      expect(await feed.resolve(token)).toBe(ivanov);
      // Before publication the feed is empty: drafts never leak.
      const now = new Date(`${MONTH}-15T12:00:00Z`);
      expect(await feed.ics(ivanov, now)).not.toContain('BEGIN:VEVENT');
      await schedule.submit(v1.id, PLANNER);
      await schedule.publish(v1.id, {}, HEAD);
      const ics = await feed.ics(ivanov, now);
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain(`UID:${ivanov}-${day(1)}@vakhta`);
      expect(ics).not.toContain(petrova);
      expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT3H');
      expect(ics).toContain('SUMMARY:Day shift · Линия 1');
      expect(ics.split('BEGIN:VEVENT')).toHaveLength(2);
      // A revision keeps the event identity and bumps the sequence.
      await schedule.revise(
        v1.id,
        {
          items: [
            {
              employeeId: ivanov,
              templateId: nightId,
              businessDate: day(1),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: petrova,
              templateId: nightId,
              businessDate: day(2),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        HEAD,
      );
      const revised = await feed.ics(ivanov, now);
      expect(revised).toContain(`UID:${ivanov}-${day(1)}@vakhta`);
      expect(revised).toContain('SEQUENCE:2');
      expect(revised).toContain('SUMMARY:Night shift');
      // The home screen offers the link only when the feed is configured.
      const t = messages('en');
      const withFeed = homeScreen(t, {
        employee: { id: ivanov, fullName: 'Иванов Иван', personnelNumber: '1' } as never,
        next: null,
        acknowledgementCallback: null,
        feed: true,
        presenceSince: null,
        timezone: 'Europe/Kyiv',
        pendingSwaps: 0,
        helpUrl: null,
        supportUrl: null,
      });
      expect(JSON.stringify(withFeed.keyboard?.inline_keyboard)).toContain('feed:issue');
      // Rotation and revocation.
      const second = await feed.issue(ivanov);
      expect(await feed.resolve(token)).toBeNull();
      expect(await feed.resolve(second)).toBe(ivanov);
      expect(await feed.hasActive(ivanov)).toBe(true);
      expect(await feed.revoke(ivanov)).toBe(1);
      expect(await feed.resolve(second)).toBeNull();
      expect(await feed.revoke(ivanov)).toBe(0);
      expect(await feed.resolve('short')).toBeNull();
      const audit = await testDb.db.select().from(auditLog);
      expect(audit.map((row) => row.action)).toEqual(
        expect.arrayContaining(['schedule.feed.issue', 'schedule.feed.revoke']),
      );
    });
  });

  describe('calendar events: holidays, birthdays, absences, replacements', () => {
    it('keeps inclusive absence boundaries, pending states and employee selection in both views', async () => {
      await testDb.db.insert(requests).values([
        {
          type: 'SICK',
          employeeId: ivanov,
          status: 'APPROVED',
          periodFrom: day(1),
          periodTo: day(5),
        },
        {
          type: 'VACATION',
          employeeId: ivanov,
          status: 'SUBMITTED',
          periodFrom: day(8),
          periodTo: day(12),
        },
        {
          type: 'DAY_OFF',
          employeeId: petrova,
          status: 'IN_REVIEW',
          periodFrom: day(6),
          periodTo: day(6),
        },
        {
          type: 'SICK',
          employeeId: ivanov,
          status: 'REJECTED',
          periodFrom: day(5),
          periodTo: day(8),
        },
        {
          type: 'SICK',
          employeeId: ivanov,
          status: 'APPROVED',
          periodFrom: day(1),
          periodTo: day(4),
        },
        {
          type: 'SICK',
          employeeId: ivanov,
          status: 'APPROVED',
          periodFrom: day(9),
          periodTo: day(12),
        },
      ]);
      const range = { from: day(5), to: day(8) };
      const expected = [
        { employeeId: ivanov, type: 'SICK', status: 'APPROVED', from: day(1), to: day(5) },
        { employeeId: ivanov, type: 'VACATION', status: 'PENDING', from: day(8), to: day(12) },
        { employeeId: petrova, type: 'DAY_OFF', status: 'PENDING', from: day(6), to: day(6) },
      ];
      const windows = await loadAbsences(testDb.db, range);
      expect(windows).toHaveLength(3);
      expect(windows).toEqual(expect.arrayContaining(expected));
      const events = await loadAbsenceEvents(testDb.db, range);
      expect(events).toHaveLength(3);
      expect(events).toEqual(
        expect.arrayContaining(expected.map((row) => expect.objectContaining(row))),
      );
      for (const employeeIds of [[], [ivanov]]) {
        const selected = expected.filter((row) => employeeIds.includes(row.employeeId));
        expect(await loadAbsences(testDb.db, { ...range, employeeIds })).toEqual(selected);
        const selectedEvents = await loadAbsenceEvents(testDb.db, { ...range, employeeIds });
        expect(selectedEvents).toHaveLength(selected.length);
        expect(selectedEvents).toEqual(
          expect.arrayContaining(selected.map((row) => expect.objectContaining(row))),
        );
      }
    });

    it('overlays the site region holidays, birthdays and approved absences with replacement needs', async () => {
      const staffing = new StaffingService(testDb.db, new AuditLog());
      const [position] = await testDb.db
        .insert(positions)
        .values({ code: 'EV', name: 'Operator' })
        .returning();
      await testDb.db.insert(employeePositions).values([
        { employeeId: ivanov, orgUnitId: unitId, positionId: position!.id, validFrom: new Date(0) },
        {
          employeeId: petrova,
          orgUnitId: unitId,
          positionId: position!.id,
          validFrom: new Date(0),
        },
      ]);
      await testDb.db
        .update(employees)
        .set({ birthDate: `1990-${day(20).slice(5)}` })
        .where(eq(employees.id, petrova));
      const v1 = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      await schedule.putAssignments(
        v1.id,
        {
          items: [
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(5),
              zoneId,
              kind: 'REGULAR',
            },
            {
              employeeId: ivanov,
              templateId: dayId,
              businessDate: day(8),
              zoneId,
              kind: 'REGULAR',
            },
          ],
        },
        PLANNER,
      );
      await schedule.submit(v1.id, PLANNER);
      await schedule.publish(v1.id, {}, HEAD);
      const [sick] = await testDb.db
        .insert(requests)
        .values({
          type: 'SICK',
          employeeId: ivanov,
          status: 'APPROVED',
          currentStep: 1,
          periodFrom: day(4),
          periodTo: day(6),
        })
        .returning();
      await testDb.db.insert(requests).values({
        type: 'VACATION',
        employeeId: petrova,
        status: 'SUBMITTED',
        currentStep: 0,
        periodFrom: day(8),
        periodTo: day(9),
      });
      await testDb.db.insert(wellbeingCheckins).values({
        requestId: sick!.id,
        employeeId: ivanov,
        businessDate: day(5),
        answer: 'WORSE',
      });
      const view = await staffing.events({ siteId, orgUnitId: unitId, from: day(1), to: day(28) });
      expect(view.region).toBe('UA');
      // The site is in Kyiv, so the Ukrainian calendar applies; whichever month the test runs in.
      expect(view.holidays.every((row) => row.date.startsWith(MONTH))).toBe(true);
      expect(view.birthdays).toEqual([{ employeeId: petrova, date: day(20) }]);
      expect(view.absences.map((row) => [row.employeeId, row.type, row.status])).toEqual(
        expect.arrayContaining([
          [ivanov, 'SICK', 'APPROVED'],
          [petrova, 'VACATION', 'PENDING'],
        ]),
      );
      expect(view.absences.find((row) => row.type === 'SICK')?.lastCheckin).toMatchObject({
        businessDate: day(5),
        answer: 'WORSE',
      });
      // Only the shift inside the approved sick leave needs a replacement.
      expect(view.replacements.map((row) => [row.employeeId, row.businessDate, row.type])).toEqual([
        [ivanov, day(5), 'SICK'],
      ]);
      const attention = await staffing.attention(siteId, new Date(`${day(5)}T09:00:00Z`));
      expect(attention.today).toBe(day(5));
      expect(attention.onSickLeave.map((row) => row.employeeId)).toEqual([ivanov]);
      expect(attention.replacements.map((row) => row.businessDate)).toEqual([day(5)]);
      expect(attention.birthdaysToday).toEqual([]);
    });
  });

  describe('master authority (D-01, #8)', () => {
    async function commandsFor(
      ...grants: { role: string; scopeType: string; scopeId: string | null }[]
    ) {
      const userId = randomUUID();
      await testDb.db
        .insert(authUser)
        .values({ id: userId, name: 'Master', email: `${userId}@example.test` });
      for (const grant of grants)
        await testDb.db.insert(webUserRoles).values({
          userId,
          role: grant.role as 'ADMIN',
          scopeType: grant.scopeType as 'ORG_UNIT',
          scopeId: grant.scopeId,
        });
      const user: WebUser = {
        id: userId,
        name: 'Master',
        email: `${userId}@example.test`,
        twoFactorEnabled: true,
        grants: [],
      };
      const roles = new RolesService(testDb.db, new EventStore(), new AuditLog());
      return { user, commands: new ScheduleCommandService(testDb.db, schedule, roles) };
    }
    function created(result: ScheduleCommandResult): ScheduleVersionView {
      if (result.kind !== 'VERSION') throw new Error('Expected a version result');
      return result.version;
    }
    const item = (
      employeeId: string,
      businessDate: string,
      zoneId: string,
      templateId?: string,
    ) => ({
      employeeId,
      businessDate,
      templateId: templateId ?? dayId,
      zoneId,
      kind: 'REGULAR' as const,
    });

    it('lets a unit master prepare, save and submit but not publish, and denies another unit', async () => {
      const { user, commands } = await commandsFor({
        role: 'SHIFT_MASTER',
        scopeType: 'ORG_UNIT',
        scopeId: unitId,
      });
      const draft = created(
        await commands.execute(
          {
            commandId: randomUUID(),
            action: 'CREATE',
            payload: { siteId, orgUnitId: unitId, periodMonth: MONTH },
          },
          user,
        ),
      );
      const saved = await commands.execute(
        {
          commandId: randomUUID(),
          action: 'SAVE',
          versionId: draft.id,
          expectedRevision: draft.revision,
          payload: { items: [item(ivanov, day(3), zoneId)] },
        },
        user,
      );
      if (saved.kind !== 'DETAIL') throw new Error('Expected detail');
      const submitted = created(
        await commands.execute(
          {
            commandId: randomUUID(),
            action: 'SUBMIT',
            versionId: draft.id,
            expectedRevision: saved.detail.version.revision,
          },
          user,
        ),
      );
      expect(submitted.status).toBe('IN_REVIEW');
      await expect(
        commands.execute(
          {
            commandId: randomUUID(),
            action: 'PUBLISH',
            versionId: draft.id,
            expectedRevision: submitted.revision,
            payload: {},
          },
          user,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        commands.execute(
          {
            commandId: randomUUID(),
            action: 'CREATE',
            payload: { siteId, orgUnitId: otherUnitId, periodMonth: MONTH },
          },
          user,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect((await testDb.db.select().from(scheduleVersions)).map((v) => v.status)).toEqual([
        'IN_REVIEW',
      ]);
    });

    it('limits a zone master to changes inside the zone through commands and the direct save path', async () => {
      const otherZone = (
        await org.createZone(
          {
            siteId,
            orgUnitId: unitId,
            code: 'PACK_1',
            name: 'Упаковка',
            type: 'PACKAGING',
            isShared: false,
          },
          PLANNER,
        )
      ).id;
      const planner = await commandsFor({
        role: 'PLANNER',
        scopeType: 'ORG_UNIT',
        scopeId: unitId,
      });
      const draft = created(
        await planner.commands.execute(
          {
            commandId: randomUUID(),
            action: 'CREATE',
            payload: { siteId, orgUnitId: unitId, periodMonth: MONTH },
          },
          planner.user,
        ),
      );
      const seeded = await planner.commands.execute(
        {
          commandId: randomUUID(),
          action: 'SAVE',
          versionId: draft.id,
          expectedRevision: draft.revision,
          payload: { items: [item(ivanov, day(3), zoneId), item(petrova, day(3), otherZone)] },
        },
        planner.user,
      );
      if (seeded.kind !== 'DETAIL') throw new Error('Expected detail');
      let revision = seeded.detail.version.revision;
      const { user, commands } = await commandsFor({
        role: 'SHIFT_MASTER',
        scopeType: 'ZONE',
        scopeId: otherZone,
      });
      // A change inside the zone with the other zone's assignment untouched succeeds.
      const ok = await commands.execute(
        {
          commandId: randomUUID(),
          action: 'SAVE',
          versionId: draft.id,
          expectedRevision: revision,
          payload: {
            items: [
              item(ivanov, day(3), zoneId),
              item(petrova, day(3), otherZone, nightId),
              item(ivanov, day(5), otherZone),
            ],
          },
        },
        user,
      );
      if (ok.kind !== 'DETAIL') throw new Error('Expected detail');
      revision = ok.detail.version.revision;
      expect(ok.detail.assignments).toHaveLength(3);
      // Touching the other zone (removal, move or template change) is rejected without writes.
      for (const items of [
        [item(petrova, day(3), otherZone, nightId), item(ivanov, day(5), otherZone)],
        [
          item(ivanov, day(3), zoneId, nightId),
          item(petrova, day(3), otherZone, nightId),
          item(ivanov, day(5), otherZone),
        ],
        [
          item(ivanov, day(3), otherZone),
          item(petrova, day(3), otherZone, nightId),
          item(ivanov, day(5), otherZone),
        ],
      ]) {
        await expect(
          commands.execute(
            {
              commandId: randomUUID(),
              action: 'SAVE',
              versionId: draft.id,
              expectedRevision: revision,
              payload: { items },
            },
            user,
          ),
        ).rejects.toMatchObject({ status: 403, code: 'SCHEDULE_ZONE_SCOPE' });
      }
      const grants = await new RolesService(testDb.db, new EventStore(), new AuditLog()).grantsOf(
        user.id,
      );
      await expect(
        schedule.editorScope(grants, { siteId, orgUnitId: unitId }, 'DELETE'),
      ).rejects.toMatchObject({ status: 403 });
      const restriction = await schedule.editorScope(grants, { siteId, orgUnitId: unitId }, 'SAVE');
      expect(restriction).toEqual(new Set([otherZone]));
      await expect(
        schedule.putAssignments(
          draft.id,
          {
            items: [
              item(ivanov, day(3), otherZone),
              item(petrova, day(3), otherZone, nightId),
              item(ivanov, day(5), otherZone),
            ],
          },
          webUserActor({ ...user, grants }),
          revision,
          restriction,
        ),
      ).rejects.toMatchObject({ status: 403, code: 'SCHEDULE_ZONE_SCOPE' });
      const stored = await testDb.db
        .select()
        .from(shiftAssignments)
        .where(eq(shiftAssignments.scheduleVersionId, draft.id));
      expect(stored).toHaveLength(3);
      expect((await schedule.requireVersion(draft.id)).revision).toBe(revision);
    });
  });

  describe('durable web commands', () => {
    async function webCommands() {
      const userId = randomUUID();
      await testDb.db
        .insert(authUser)
        .values({ id: userId, name: 'Planner', email: `${userId}@example.test` });
      await testDb.db
        .insert(webUserRoles)
        .values({ userId, role: 'ADMIN', scopeType: 'ORG_UNIT', scopeId: unitId });
      const user: WebUser = {
        id: userId,
        name: 'Planner',
        email: `${userId}@example.test`,
        twoFactorEnabled: true,
        grants: [],
      };
      const roles = new RolesService(testDb.db, new EventStore(), new AuditLog());
      return { user, commands: new ScheduleCommandService(testDb.db, schedule, roles) };
    }
    function version(result: ScheduleCommandResult): ScheduleVersionView {
      if (result.kind === 'DELETED') throw new Error('Expected a version result');
      return result.kind === 'VERSION' ? result.version : result.detail.version;
    }
    function createCommand(): ScheduleWebCommand {
      return {
        commandId: randomUUID(),
        action: 'CREATE',
        payload: { siteId, orgUnitId: unitId, periodMonth: MONTH },
      };
    }
    async function counts() {
      return {
        versions: (await testDb.db.select().from(scheduleVersions)).length,
        events: (await testDb.db.select().from(domainEvents)).length,
        receipts: (await testDb.db.select().from(idempotencyKeys)).length,
        notices: (await testDb.db.select().from(notificationOutbox)).length,
        timers: (await timerJobs()).length,
      };
    }

    it('concurrent create and save retries commit once and replay before revision checks', async () => {
      const { user, commands } = await webCommands();
      const command = createCommand();
      const [first, duplicate] = await Promise.all([
        commands.execute(command, user),
        commands.execute(command, user),
      ]);
      expect(duplicate).toEqual(first);
      expect(await testDb.db.select().from(scheduleVersions)).toHaveLength(1);
      const draft = version(first);
      const save: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'SAVE',
        versionId: draft.id,
        expectedRevision: draft.revision,
        payload: {
          items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }],
        },
      };
      const before = await counts();
      const [saved, retried] = await Promise.all([
        commands.execute(save, user),
        commands.execute(save, user),
      ]);
      expect(retried).toEqual(saved);
      expect(version(saved).revision).toBe(draft.revision + 1);
      expect((await counts()).events).toBe(before.events + 1);
      expect((await counts()).receipts).toBe(before.receipts + 1);
      await expect(
        commands.execute({ ...save, commandId: randomUUID() }, user),
      ).rejects.toMatchObject({ code: 'SCHEDULE_REVISION_CONFLICT' });
      expect(await commands.execute(save, user)).toEqual(saved);
    });

    it('same ID rejects another actor, action, target and payload; normalized object order replays', async () => {
      const { user, commands } = await webCommands();
      const command = createCommand();
      const result = await commands.execute(command, user);
      const other = await webCommands();
      await expect(commands.execute(command, other.user)).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
      if (command.action !== 'CREATE') throw new Error('Expected create');
      await expect(
        commands.execute(
          { ...command, payload: { ...command.payload, periodMonth: addMonths(MONTH, 1) } },
          user,
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      await expect(
        commands.execute(
          {
            commandId: command.commandId,
            action: 'DELETE',
            versionId: version(result).id,
            expectedRevision: 1,
          },
          user,
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      expect(
        await commands.execute(
          {
            action: 'CREATE',
            payload: { periodMonth: MONTH, orgUnitId: unitId, siteId },
            commandId: command.commandId,
          },
          user,
        ),
      ).toEqual(result);
      const save: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'SAVE',
        versionId: version(result).id,
        expectedRevision: 1,
        payload: { items: [] },
      };
      await commands.execute(save, user);
      await expect(
        commands.execute({ ...save, versionId: randomUUID() }, user),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      await expect(
        commands.execute(
          {
            ...save,
            payload: {
              items: [
                { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
              ],
            },
          },
          user,
        ),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });

    it('delete replay needs no live version but still requires current scope', async () => {
      const { user, commands } = await webCommands();
      const draft = version(await commands.execute(createCommand(), user));
      const command: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'DELETE',
        versionId: draft.id,
        expectedRevision: draft.revision,
      };
      const result = await commands.execute(command, user);
      expect(result).toEqual({
        commandId: command.commandId,
        kind: 'DELETED',
        versionId: draft.id,
      });
      expect(await commands.execute(command, user)).toEqual(result);
      await expect(
        commands.execute({ ...command, commandId: randomUUID() }, user),
      ).rejects.toMatchObject({ code: 'SCHEDULE_VERSION_NOT_FOUND' });
      await testDb.db.delete(webUserRoles).where(eq(webUserRoles.userId, user.id));
      await expect(commands.execute(command, user)).rejects.toMatchObject({ status: 403 });
    });

    it('submit, return, publish and revise replay exact first results without repeated publication effects', async () => {
      const { user, commands } = await webCommands();
      const draft = version(await commands.execute(createCommand(), user));
      const items = [
        { employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' },
      ] as const;
      const saved = version(
        await commands.execute(
          {
            commandId: randomUUID(),
            action: 'SAVE',
            versionId: draft.id,
            expectedRevision: draft.revision,
            payload: { items: [...items] },
          },
          user,
        ),
      );
      const submit: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'SUBMIT',
        versionId: saved.id,
        expectedRevision: saved.revision,
      };
      const submitted = await commands.execute(submit, user);
      const back: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'RETURN',
        versionId: saved.id,
        expectedRevision: version(submitted).revision,
        payload: { comment: 'Review again' },
      };
      const returned = await commands.execute(back, user);
      expect(await commands.execute(submit, user)).toEqual(submitted);
      expect(await commands.execute(back, user)).toEqual(returned);
      const reviewed = version(
        await commands.execute(
          { ...submit, commandId: randomUUID(), expectedRevision: version(returned).revision },
          user,
        ),
      );
      const publish: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'PUBLISH',
        versionId: reviewed.id,
        expectedRevision: reviewed.revision,
        payload: {},
      };
      const [published, publishedAgain] = await Promise.all([
        commands.execute(publish, user),
        commands.execute(publish, user),
      ]);
      expect(publishedAgain).toEqual(published);
      const afterPublish = await counts();
      expect(await commands.execute(publish, user)).toEqual(published);
      expect(await counts()).toEqual(afterPublish);
      const revise: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'REVISE',
        versionId: version(published).id,
        expectedRevision: version(published).revision,
        payload: {
          items: [{ ...items[0], businessDate: day(2) }],
          changeReason: 'Move to next day',
        },
      };
      const [revised, revisedAgain] = await Promise.all([
        commands.execute(revise, user),
        commands.execute(revise, user),
      ]);
      expect(revisedAgain).toEqual(revised);
      expect(version(revised).id).not.toBe(version(published).id);
      expect((await counts()).versions).toBe(afterPublish.versions + 1);
      expect((await counts()).notices).toBe(afterPublish.notices + 1);
      const afterRevise = await counts();
      expect(await commands.execute(publish, user)).toEqual(published);
      expect(await commands.execute(revise, user)).toEqual(revised);
      expect(await counts()).toEqual(afterRevise);
    });

    it('receipt insertion failure rolls back publication, events, notifications and timer intents', async () => {
      const { user, commands } = await webCommands();
      const draft = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: MONTH },
        PLANNER,
      );
      await schedule.putAssignments(
        draft.id,
        {
          items: [{ employeeId: ivanov, templateId: dayId, businessDate: day(1), kind: 'REGULAR' }],
        },
        PLANNER,
      );
      const reviewed = await schedule.submit(draft.id, PLANNER);
      const command: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'PUBLISH',
        versionId: reviewed.id,
        expectedRevision: reviewed.revision,
        payload: {},
      };
      const before = await counts();
      await testDb.db.execute(
        sql`CREATE FUNCTION fail_schedule_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected receipt failure'; END $$`,
      );
      await testDb.db.execute(
        sql`CREATE TRIGGER fail_schedule_receipt BEFORE INSERT ON idempotency_keys FOR EACH ROW WHEN (NEW.scope = 'schedule-command:v1') EXECUTE FUNCTION fail_schedule_receipt()`,
      );
      try {
        await expect(commands.execute(command, user)).rejects.toThrow();
        expect(await counts()).toEqual(before);
        expect((await schedule.detail(draft.id)).version).toEqual(reviewed);
      } finally {
        await testDb.db.execute(sql`DROP TRIGGER fail_schedule_receipt ON idempotency_keys`);
        await testDb.db.execute(sql`DROP FUNCTION fail_schedule_receipt()`);
      }
      const result = await commands.execute(command, user);
      expect(version(result).status).toBe('PUBLISHED');
      expect(await commands.execute(command, user)).toEqual(result);
    });

    it('rejects unauthorized source copies and inconsistent source month or unit without a receipt', async () => {
      const { user, commands } = await webCommands();
      const source = await schedule.createVersion(
        { siteId, orgUnitId: otherUnitId, periodMonth: MONTH },
        PLANNER,
      );
      const before = await counts();
      await expect(
        commands.execute(
          {
            commandId: randomUUID(),
            action: 'CREATE',
            payload: { siteId, orgUnitId: unitId, periodMonth: MONTH, basedOnVersionId: source.id },
          },
          user,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(await counts()).toEqual(before);
      const previous = await schedule.createVersion(
        { siteId, orgUnitId: unitId, periodMonth: addMonths(MONTH, -1) },
        PLANNER,
      );
      await expect(
        commands.execute(
          {
            commandId: randomUUID(),
            action: 'CREATE',
            payload: {
              siteId,
              orgUnitId: unitId,
              periodMonth: MONTH,
              basedOnVersionId: previous.id,
            },
          },
          user,
        ),
      ).rejects.toMatchObject({ code: 'SCHEDULE_SOURCE_SCOPE_MISMATCH' });
      await expect(
        schedule.createVersion(
          { siteId, orgUnitId: unitId, periodMonth: MONTH, basedOnVersionId: source.id },
          PLANNER,
        ),
      ).rejects.toMatchObject({ code: 'SCHEDULE_SOURCE_SCOPE_MISMATCH' });
    });

    it('refreshes permission after a command waits for the version lock', async () => {
      const { user, commands } = await webCommands();
      const draft = version(await commands.execute(createCommand(), user));
      let signalAcquired: () => void = () => {
        throw new Error('Acquired signal is not initialized');
      };
      let releaseLock: () => void = () => {
        throw new Error('Release signal is not initialized');
      };
      const acquired = new Promise<void>((resolve) => {
        signalAcquired = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const holder = testDb.db.transaction(async (tx) => {
        await schedule.lockVersion(draft.id, tx);
        signalAcquired();
        await release;
      });
      await acquired;
      const command: ScheduleWebCommand = {
        commandId: randomUUID(),
        action: 'SAVE',
        versionId: draft.id,
        expectedRevision: draft.revision,
        payload: { items: [] },
      };
      const outcome = commands.execute(command, user).then(
        (result) => ({ kind: 'success', result }),
        (error: unknown) => ({ kind: 'error', error }),
      );
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const rows = await testDb.db.execute(
            sql`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%schedule_versions%' AND pid <> pg_backend_pid()`,
          );
          if (rows.length > 0) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        await testDb.db.delete(webUserRoles).where(eq(webUserRoles.userId, user.id));
      } finally {
        releaseLock();
        await holder;
      }
      expect(await outcome).toMatchObject({ kind: 'error', error: { status: 403 } });
      expect((await schedule.detail(draft.id)).version.revision).toBe(draft.revision);
      expect(
        await testDb.db
          .select()
          .from(idempotencyKeys)
          .where(eq(idempotencyKeys.key, command.commandId)),
      ).toHaveLength(0);
    });

    it('validates command IDs and required preconditions at the shared boundary', () => {
      expect(
        ScheduleWebCommand.safeParse({
          action: 'CREATE',
          commandId: 'invalid',
          payload: { siteId, orgUnitId: unitId, periodMonth: MONTH },
        }).success,
      ).toBe(false);
      expect(
        ScheduleWebCommand.safeParse({
          action: 'SUBMIT',
          commandId: randomUUID(),
          versionId: randomUUID(),
        }).success,
      ).toBe(false);
    });
  });
});
