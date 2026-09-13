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
import type { WebUser } from '../auth/web-auth.guard.js';
import { RolesService } from '../auth/roles.service.js';
import { ScheduleCommandService } from './schedule-command.service.js';
import { backgroundTasks } from '@vakhta/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assignmentAcknowledgements, shiftAssignments } from '@vakhta/db';
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
