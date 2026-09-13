import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  auditLog,
  employeePositions,
  employees,
  eq,
  mediaObjects,
  orgUnits,
  positions,
  responsibilityZones,
  scheduleVersions,
  shiftAssignments,
  shiftTemplates,
  sites,
  type Database,
} from '@vakhta/db';
import type { RoleGrant, WebRole } from '@vakhta/domain';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import type { WebUser } from '../auth/web-auth.guard.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UnitMasterService } from '../org/unit-master.service.js';
import { EmployeesService } from './employees.service.js';
import { EmployeeProfileService } from './employee-profile.service.js';
import { EmployeeCompensationService } from './employee-compensation.service.js';
import { EmployeeAvatarService, normalizeEmployeeAvatar } from './employee-avatar.service.js';
import { EmployeeAvatarCleanupService } from './employee-avatar-cleanup.service.js';

export const profileTestUser = (...grants: RoleGrant[]): WebUser => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Synthetic QA',
  email: 'profile@example.test',
  twoFactorEnabled: false,
  grants,
});
const admin = profileTestUser({ role: 'ADMIN', scopeType: 'ENTERPRISE', scopeId: null });
const actor = { id: admin.id, type: 'WEB_USER' as const, role: 'ADMIN' };

describe('employee profile integration', () => {
  let test: TestDatabase;
  let db: Database;
  let directory: EmployeesService;
  let profiles: EmployeeProfileService;
  let compensation: EmployeeCompensationService;
  let masters: UnitMasterService;
  let avatars: EmployeeAvatarService;
  let cleanup: EmployeeAvatarCleanupService;
  let a: string;
  let b: string;
  let personA: string;
  let personB: string;
  let unassigned: string;
  const now = new Date('2026-09-13T10:00:00Z');
  const objects = new Map<string, Uint8Array>();
  let failUpload = false;
  let failDelete = false;
  let failedKey: string | null = null;
  const scoped = (role: WebRole, unit: string) =>
    profileTestUser({ role, scopeType: 'ORG_UNIT', scopeId: unit });
  const version = async (id: string) => (await profiles.get(id, admin, now)).version;
  beforeAll(async () => {
    test = await startTestDatabase();
    db = test.db;
    const audit = new AuditLog();
    directory = new EmployeesService(db, new EventStore(), audit, new NotificationsService());
    compensation = new EmployeeCompensationService(db, audit);
    profiles = new EmployeeProfileService(db, directory, compensation);
    masters = new UnitMasterService(db, audit);
    const storage = {
      async presignGet(key: string) {
        return `https://private.example.test/${key}`;
      },
      async put(key: string, data: Uint8Array) {
        if (failUpload) throw new Error('upload unavailable');
        objects.set(key, data);
      },
      async delete(key: string) {
        if (failDelete || key === failedKey) throw new Error('delete unavailable');
        objects.delete(key);
      },
    };
    avatars = new EmployeeAvatarService(db, storage, audit);
    cleanup = new EmployeeAvatarCleanupService(db, storage);
    const [site] = await db
      .insert(sites)
      .values({ code: 'profile-test', name: 'Site', timezone: 'Europe/Kyiv' })
      .returning();
    if (!site) throw new Error('Missing site');
    const units = await db
      .insert(orgUnits)
      .values([
        { siteId: site.id, name: 'Unit A' },
        { siteId: site.id, name: 'Unit B' },
      ])
      .returning();
    const [unitA, unitB] = units;
    if (!unitA || !unitB) throw new Error('Missing units');
    a = unitA.id;
    b = unitB.id;
    const [position] = await db
      .insert(positions)
      .values({ code: 'PROFILE', name: 'Operator' })
      .returning();
    if (!position) throw new Error('Missing position');
    const people = await db
      .insert(employees)
      .values(
        ['A', 'B', 'U'].map((key) => ({
          personnelNumber: `PROFILE-${key}`,
          fullName: `Synthetic ${key}`,
          birthDate: '1990-02-28',
          maritalStatus: 'MARRIED' as const,
          email: `${key}@example.test`,
        })),
      )
      .returning();
    const [pa, pb, pu] = people;
    if (!pa || !pb || !pu) throw new Error('Missing people');
    personA = pa.id;
    personB = pb.id;
    unassigned = pu.id;
    await db.insert(employeePositions).values([
      {
        employeeId: personA,
        orgUnitId: a,
        positionId: position.id,
        validFrom: new Date('2026-01-01'),
      },
      {
        employeeId: personB,
        orgUnitId: b,
        positionId: position.id,
        validFrom: new Date('2026-01-01'),
      },
    ]);
    const [zone] = await db
      .insert(responsibilityZones)
      .values({ siteId: site.id, orgUnitId: a, code: 'profile', name: 'Zone A' })
      .returning();
    const [template] = await db
      .insert(shiftTemplates)
      .values({
        siteId: site.id,
        code: 'PROFILE',
        name: 'Day',
        localStart: '08:00',
        localEnd: '20:00',
      })
      .returning();
    if (!zone || !template) throw new Error('Missing shift details');
    const versions = await db
      .insert(scheduleVersions)
      .values([
        {
          siteId: site.id,
          orgUnitId: a,
          periodMonth: '2026-09',
          versionNo: 1,
          status: 'PUBLISHED',
        },
        { siteId: site.id, orgUnitId: a, periodMonth: '2026-09', versionNo: 2, status: 'DRAFT' },
      ])
      .returning();
    for (const schedule of versions)
      await db.insert(shiftAssignments).values({
        scheduleVersionId: schedule.id,
        employeeId: personA,
        templateId: template.id,
        orgUnitId: a,
        zoneId: zone.id,
        businessDate: '2026-09-14',
        planStartAt: new Date('2026-09-14T05:00:00Z'),
        planEndAt: new Date('2026-09-14T17:00:00Z'),
      });
    await compensation.add(
      personA,
      {
        effectiveFrom: '2026-09-01',
        employmentRate: '1.00',
        hourlyRate: '95.00',
        monthlySalary: null,
        reason: null,
        correctsEntryId: null,
      },
      admin,
    );
  }, 180_000);
  afterAll(async () => {
    await test?.stop();
  });

  it.each<WebRole>(['ADMIN', 'HR', 'ACCOUNTANT', 'PRODUCTION_HEAD', 'PLANNER', 'SHIFT_MASTER'])(
    'serializes only permitted fields for %s',
    async (role) => {
      const profile = await profiles.get(personA, scoped(role, a), now);
      const editor = role === 'ADMIN' || role === 'HR';
      expect('maritalStatus' in profile).toBe(editor);
      expect('compensation' in profile).toBe(editor || role === 'ACCOUNTANT');
      expect(profile.birthDate).toEqual(
        editor || role === 'ACCOUNTANT' ? '1990-02-28' : { day: 28, month: 2 },
      );
      expect(profile.employee).not.toHaveProperty('birthDate');
      await expect(profiles.get(personB, scoped(role, a), now)).rejects.toMatchObject({
        status: 403,
      });
      await expect(profiles.get(unassigned, scoped(role, a), now)).rejects.toMatchObject({
        status: 403,
      });
    },
  );
  it('does not borrow a privileged role from another scope', async () => {
    const mixed = profileTestUser(
      { role: 'HR', scopeType: 'ORG_UNIT', scopeId: b },
      { role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: a },
    );
    const profile = await profiles.get(personA, mixed, now);
    expect(profile).not.toHaveProperty('compensation');
    expect(profile).not.toHaveProperty('maritalStatus');
    await expect(compensation.get(personA, mixed)).rejects.toMatchObject({ status: 403 });
    for (const role of ['AUDITOR', 'CLEANLINESS_CONTROLLER'] as const)
      await expect(profiles.get(personA, scoped(role, a))).rejects.toMatchObject({ status: 403 });
  });
  it('shows only published shifts and derives their zone', async () => {
    const profile = await profiles.get(personA, admin, now);
    expect(profile.schedule.shiftCount).toBe(1);
    expect(profile.schedule.plannedMinutes).toBe(720);
    expect(profile.schedule.nextShifts).toHaveLength(1);
    expect(profile.work.zone.current?.name).toBe('Zone A');
    expect((await profiles.get(personB, admin, now)).schedule.published).toBe(false);
  });
  it('designates active masters and shows missing/inactive/panel-access warnings', async () => {
    expect((await profiles.get(personA, admin, now)).work.master.state).toBe('MISSING');
    await masters.set(a, personA, admin);
    const profile = await profiles.get(personA, admin, now);
    expect(profile.work.master.isSelf).toBe(true);
    expect(profile.work.master.state).toBe('NO_PANEL_ACCESS');
    expect(profile.work.masterOf[0]?.id).toBe(a);
    await db.update(employees).set({ status: 'BLOCKED' }).where(eq(employees.id, personA));
    expect((await profiles.get(personA, admin, now)).work.master.state).toBe('INACTIVE');
    await expect(masters.set(b, personA, admin)).rejects.toMatchObject({
      code: 'MASTER_NOT_ACTIVE',
    });
    await db.update(employees).set({ status: 'ACTIVE' }).where(eq(employees.id, personA));
  });
  it('rejects versionless and concurrent stale writes and redacts restricted audit values', async () => {
    await expect(
      directory.update(personA, { fullName: 'No version' }, actor, admin),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_VERSION_REQUIRED' });
    const expectedVersion = await version(personA);
    const outcomes = await Promise.allSettled([
      directory.update(personA, { maritalStatus: 'SINGLE', expectedVersion }, actor, admin),
      directory.update(personA, { maritalStatus: 'DIVORCED', expectedVersion }, actor, admin),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, 'employee.update'));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toMatch(/SINGLE|DIVORCED|MARRIED/);
  });
  it('audits denied compensation and preserves original/correction history', async () => {
    await expect(compensation.get(personA, scoped('SHIFT_MASTER', a))).rejects.toMatchObject({
      status: 403,
    });
    const original = (await compensation.get(personA, admin, '2026-09-13')).current;
    if (!original) throw new Error('Missing compensation');
    const correction = {
      effectiveFrom: original.effectiveFrom,
      employmentRate: '0.50',
      hourlyRate: '100',
      monthlySalary: null,
      correctsEntryId: original.id,
      reason: 'Synthetic correction',
    };
    await expect(
      compensation.add(personA, correction, scoped('ACCOUNTANT', a)),
    ).rejects.toMatchObject({ status: 403 });
    await compensation.add(personA, correction, admin);
    await expect(compensation.add(personA, correction, admin)).rejects.toMatchObject({
      code: 'COMPENSATION_VERSION_CONFLICT',
    });
    const view = await compensation.get(personA, admin, '2026-09-13');
    expect(view.history).toHaveLength(2);
    expect(view.current?.employmentRate).toBe('0.50');
    expect(
      view.history.some((entry) => entry.id === original.id && entry.state === 'CORRECTED'),
    ).toBe(true);
    expect(
      (await db.select().from(auditLog).where(eq(auditLog.action, 'employee.compensation.denied')))
        .length,
    ).toBeGreaterThanOrEqual(2);
  });
  it('normalizes avatars and keeps the current reference on storage or conflict failures', async () => {
    const png = await sharp({
      create: { width: 100, height: 80, channels: 3, background: '#446688' },
    })
      .png()
      .toBuffer();
    const normalized = await normalizeEmployeeAvatar(png);
    const metadata = await sharp(normalized).metadata();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    await expect(normalizeEmployeeAvatar(Buffer.from('<svg/>'))).rejects.toMatchObject({
      code: 'AVATAR_INVALID',
    });
    await expect(normalizeEmployeeAvatar(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toMatchObject(
      { code: 'AVATAR_TOO_LARGE' },
    );
    const first = await avatars.save(personA, png, await version(personA), admin);
    expect(first.avatarVersion).not.toBeNull();
    failUpload = true;
    await expect(avatars.save(personA, png, await version(personA), admin)).rejects.toThrow(
      'upload unavailable',
    );
    failUpload = false;
    await expect(
      avatars.save(personA, png, '2000-01-01T00:00:00.000Z', admin),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_VERSION_CONFLICT' });
    expect((await profiles.get(personA, admin, now)).avatarVersion).toBe(first.avatarVersion);
    await expect(avatars.get(personA, scoped('SHIFT_MASTER', b))).rejects.toMatchObject({
      status: 403,
    });
    await avatars.save(personA, null, await version(personA), admin);
    failDelete = true;
    await expect(cleanup.cleanupOnce()).rejects.toThrow('Employee avatar cleanup failed');
    failDelete = false;
    await cleanup.cleanupOnce();
    const [retired] = await db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, first.avatarVersion ?? randomUUID()));
    expect(retired?.storageKey).toBeNull();
    expect((await profiles.get(personA, admin, now)).avatarVersion).toBeNull();
  });
  it('serializes competing compensation originals and corrections without losing history', async () => {
    const command = {
      effectiveFrom: '2026-09-01',
      employmentRate: '1.00',
      hourlyRate: '75',
      monthlySalary: null,
      reason: null,
      correctsEntryId: null,
    };
    const originals = await Promise.allSettled([
      compensation.add(personB, command, admin),
      compensation.add(personB, command, admin),
    ]);
    expect(originals.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const original = (await compensation.get(personB, admin, '2026-09-13')).current;
    if (!original) throw new Error('Missing original');
    const correction = {
      ...command,
      hourlyRate: '80',
      reason: 'Correction after verification',
      correctsEntryId: original.id,
    };
    const corrections = await Promise.allSettled([
      compensation.add(personB, correction, admin),
      compensation.add(personB, correction, admin),
    ]);
    expect(corrections.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const latest = (await compensation.get(personB, admin, '2026-09-13')).current;
    if (!latest) throw new Error('Missing correction');
    await compensation.add(
      personB,
      { ...correction, hourlyRate: '85', correctsEntryId: latest.id },
      admin,
    );
    const result = await compensation.get(personB, admin, '2026-09-13');
    expect(result.current?.hourlyRate).toBe('85');
    expect(result.history).toHaveLength(3);
    expect(result.history.filter((row) => row.state === 'CORRECTED')).toHaveLength(2);
    await expect(
      compensation.add(personA, { ...correction, correctsEntryId: latest.id }, admin),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('continues cleaning other retired avatars when one object cannot be deleted', async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#668844' },
    })
      .png()
      .toBuffer();
    const first = await avatars.save(personB, png, await version(personB), admin);
    const second = await avatars.save(unassigned, png, await version(unassigned), admin);
    await avatars.save(personB, null, await version(personB), admin);
    await avatars.save(unassigned, null, await version(unassigned), admin);
    const [media] = await db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, first.avatarVersion ?? randomUUID()));
    failedKey = media?.storageKey ?? null;
    await expect(cleanup.cleanupOnce()).rejects.toThrow('Employee avatar cleanup failed');
    const [cleaned] = await db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, second.avatarVersion ?? randomUUID()));
    expect(cleaned?.storageKey).toBeNull();
    const [retained] = await db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, first.avatarVersion ?? randomUUID()));
    expect(retained?.storageKey).toBe(failedKey);
    failedKey = null;
    await cleanup.cleanupOnce();
  });
  it('preserves compensation and designated-master history when deletion is requested', async () => {
    await expect(
      directory.deleteEmployee(personB, { reason: 'Synthetic deletion attempt' }, actor),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_HAS_HISTORY' });
    await masters.set(b, unassigned, admin);
    await expect(
      directory.deleteEmployee(unassigned, { reason: 'Synthetic deletion attempt' }, actor),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_HAS_HISTORY' });
    expect((await profiles.get(personB, admin, now)).employee.id).toBe(personB);
    await masters.set(b, null, admin);
  });
});
