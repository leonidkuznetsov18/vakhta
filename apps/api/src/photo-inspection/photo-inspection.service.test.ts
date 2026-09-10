import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backgroundTasks,
  checklistDefinitions,
  employees,
  eq,
  handoverMedia,
  handoverRecords,
  mediaObjects,
  orgUnits,
  photoInspectionRevisions,
  photoInspectionRuns,
  photoInspections,
  responsibilityZones,
  shiftAssignments,
  shiftTemplates,
  scheduleVersions,
  shiftSessions,
  sites,
  sql,
} from '@vakhta/db';
import type { InspectionReview } from '@vakhta/contracts';
import type { WebUser } from '../auth/web-auth.guard.js';
import { AuditLog } from '../events/audit-log.js';
import { MediaService } from '../handover/media.service.js';
import { InMemoryObjectStorage } from '../infra/object-storage.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { PhotoInspectionService, type InspectionIdentity } from './photo-inspection.service.js';

const master: WebUser = {
  id: randomUUID(),
  email: 'master@example.test',
  name: 'Master',
  twoFactorEnabled: false,
  grants: [{ role: 'SHIFT_MASTER', scopeType: 'ENTERPRISE', scopeId: null }],
};
const clean: InspectionReview = {
  status: 'COMPLIANT',
  comment: '',
  guidance: 'The table must be empty.',
  annotations: [],
};
describe('photo inspection persistence and access', () => {
  let fixture: TestDatabase;
  let service: PhotoInspectionService;
  let id: InspectionIdentity;
  let siteId: string;
  let employeeId: string;
  beforeAll(async () => {
    fixture = await startTestDatabase();
    const audit = new AuditLog();
    service = new PhotoInspectionService(
      fixture.db,
      audit,
      new MediaService(fixture.db, audit, { linkTtlSeconds: 300 }, new InMemoryObjectStorage()),
    );
  });
  afterAll(async () => {
    await fixture?.stop();
  });
  beforeEach(async () => {
    await fixture.db.execute(
      sql`TRUNCATE sites, employees, checklist_definitions, media_objects, background_tasks CASCADE`,
    );
    const db = fixture.db;
    siteId = randomUUID();
    const unitId = randomUUID();
    const zoneId = randomUUID();
    employeeId = randomUUID();
    const shiftId = randomUUID();
    const definitionId = randomUUID();
    id = { handoverId: randomUUID(), mediaId: randomUUID(), itemKey: 'workplace' };
    await db
      .insert(sites)
      .values({ id: siteId, code: 'test', name: 'Test site', timezone: 'Europe/Kyiv' });
    await db.insert(orgUnits).values({ id: unitId, siteId, name: 'Unit' });
    await db
      .insert(responsibilityZones)
      .values({ id: zoneId, siteId, orgUnitId: unitId, code: 'table', name: 'Table' });
    await db
      .insert(employees)
      .values({ id: employeeId, personnelNumber: 'test', fullName: 'Test worker' });
    await db
      .insert(shiftSessions)
      .values({ id: shiftId, employeeId, businessDate: '2026-09-10', state: 'SHIFT_CLOSED' });
    await db.insert(checklistDefinitions).values({
      id: definitionId,
      version: 1,
      items: [{ key: 'workplace', label: 'Workplace', kind: 'PHOTO' }],
    });
    await db.insert(handoverRecords).values({
      id: id.handoverId,
      shiftSessionId: shiftId,
      zoneId,
      submittedBy: employeeId,
      checklistDefinitionId: definitionId,
      status: 'RESOLVED_ACCEPTED',
    });
    await db.insert(mediaObjects).values({
      id: id.mediaId,
      telegramFileId: 'test',
      telegramFileUniqueId: 'test',
      purpose: 'HANDOVER',
      storageKey: 'private/test.jpg',
      contentType: 'image/jpeg',
      sha256: 'a'.repeat(64),
      width: 1200,
      height: 800,
      processedAt: new Date(),
    });
    await db
      .insert(handoverMedia)
      .values({ handoverId: id.handoverId, mediaObjectId: id.mediaId, itemKey: id.itemKey });
  });
  it('keeps historical operational decisions and records explicit human negatives with append-only revisions', async () => {
    expect((await service.get(id, master)).review.status).toBe('UNREVIEWED');
    await expect(service.export(id, master)).rejects.toMatchObject({
      code: 'INSPECTION_UNREVIEWED',
    });
    const saved = await service.save(id, { version: 0, review: clean }, master);
    expect(saved.version).toBe(1);
    expect((await service.export(id, master)).review.status).toBe('COMPLIANT');
    expect((await fixture.db.select().from(handoverRecords))[0]?.status).toBe('RESOLVED_ACCEPTED');
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(1);
    await expect(
      fixture.db.update(photoInspectionRevisions).set({ actorId: 'changed' }),
    ).rejects.toThrow();
  });
  it('rejects stale saves without overwriting the winning review', async () => {
    const outcomes = await Promise.allSettled([
      service.save(id, { version: 0, review: clean }, master),
      service.save(id, { version: 0, review: { ...clean, comment: 'Other reviewer' } }, master),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await service.get(id, master)).version).toBe(1);
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(1);
  });
  it('enforces role and exact site scope on reads, links, exports and writes', async () => {
    const outside: WebUser = {
      ...master,
      grants: [{ role: 'SHIFT_MASTER', scopeType: 'SITE', scopeId: randomUUID() }],
    };
    for (const action of [
      () => service.get(id, outside),
      () => service.link(id, outside),
      () => service.export(id, outside),
      () => service.save(id, { version: 0, review: clean }, outside),
      () => service.analyze(id, { requestId: randomUUID(), version: 0 }, outside),
    ]) {
      await expect(action()).rejects.toMatchObject({ code: 'INSPECTION_FORBIDDEN' });
    }
    const reader: WebUser = {
      ...master,
      grants: [{ role: 'AUDITOR', scopeType: 'SITE', scopeId: siteId }],
    };
    expect((await service.get(id, reader)).canEdit).toBe(false);
    await expect(service.save(id, { version: 0, review: clean }, reader)).rejects.toMatchObject({
      code: 'INSPECTION_FORBIDDEN',
    });
  });
  it('admits one durable run for simultaneous requests and immutable request replays', async () => {
    const request = { requestId: randomUUID(), version: 0 };
    await Promise.all([service.analyze(id, request, master), service.analyze(id, request, master)]);
    await expect(
      service.analyze(id, { ...request, requestId: randomUUID() }, master),
    ).rejects.toMatchObject({ code: 'INSPECTION_PENDING' });
    const runs = await fixture.db.select().from(photoInspectionRuns);
    expect(runs).toHaveLength(1);
    expect(await fixture.db.select().from(backgroundTasks)).toHaveLength(1);
    expect(runs[0]?.reviewVersion).toBe(0);
    await expect(
      fixture.db.update(photoInspectionRuns).set({ model: 'different' }),
    ).rejects.toThrow();
  });
  it('rolls back labels and revision when audit admission fails', async () => {
    class FailingAudit extends AuditLog {
      override async record(): Promise<void> {
        throw new Error('Audit unavailable');
      }
    }
    const audit = new FailingAudit();
    const broken = new PhotoInspectionService(
      fixture.db,
      audit,
      new MediaService(fixture.db, audit, { linkTtlSeconds: 300 }),
    );
    await expect(broken.save(id, { version: 0, review: clean }, master)).rejects.toThrow(
      'Audit unavailable',
    );
    expect(await fixture.db.select().from(photoInspections)).toHaveLength(0);
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(0);
  });
  it('uses historical assignment scope for a report without a zone', async () => {
    const db = fixture.db;
    const [unit] = await db.select().from(orgUnits);
    const [session] = await db.select().from(shiftSessions);
    if (!unit || !session) throw new Error('Expected fixture ownership');
    const templateId = randomUUID(),
      scheduleVersionId = randomUUID(),
      assignmentId = randomUUID();
    await db.insert(shiftTemplates).values({
      id: templateId,
      siteId,
      code: 'day',
      name: 'Day',
      localStart: '08:00',
      localEnd: '20:00',
    });
    await db.insert(scheduleVersions).values({
      id: scheduleVersionId,
      siteId,
      orgUnitId: unit.id,
      periodMonth: '2026-09',
      versionNo: 1,
    });
    await db.insert(shiftAssignments).values({
      id: assignmentId,
      scheduleVersionId,
      employeeId,
      templateId,
      orgUnitId: unit.id,
      businessDate: '2026-09-10',
      planStartAt: new Date('2026-09-10T05:00:00Z'),
      planEndAt: new Date('2026-09-10T17:00:00Z'),
    });
    await db.update(shiftSessions).set({ assignmentId }).where(eq(shiftSessions.id, session.id));
    await db
      .update(handoverRecords)
      .set({ zoneId: null })
      .where(eq(handoverRecords.id, id.handoverId));
    const scoped: WebUser = {
      ...master,
      grants: [{ role: 'SHIFT_MASTER', scopeType: 'ORG_UNIT', scopeId: unit.id }],
    };
    expect((await service.save(id, { version: 0, review: clean }, scoped)).version).toBe(1);
    await expect(
      service.get(id, {
        ...master,
        grants: [{ role: 'SHIFT_MASTER', scopeType: 'SITE', scopeId: randomUUID() }],
      }),
    ).rejects.toMatchObject({ code: 'INSPECTION_FORBIDDEN' });
  });
  it('exports encoded dimensions separately from upright coordinates and preserves PNG identity', async () => {
    await fixture.db
      .update(mediaObjects)
      .set({ contentType: 'image/png', width: 120, height: 80 })
      .where(eq(mediaObjects.id, id.mediaId));
    await service.save(id, { version: 0, review: clean }, master);
    const exported = await service.export(id, master);
    expect(exported.imageFile).toBe(`${id.mediaId}.png`);
    expect(exported.context).toMatchObject({
      encodedWidth: 120,
      encodedHeight: 80,
      orientationPolicy: 'EXIF_AUTO_ORIENT',
    });
    expect(exported.coordinateSpace).toBe('normalized-after-exif-auto-orientation');
  });
  it('never transfers annotations to a replacement photo', async () => {
    await service.save(id, { version: 0, review: clean }, master);
    const replacement = randomUUID();
    await fixture.db.insert(mediaObjects).values({
      id: replacement,
      telegramFileId: 'new',
      telegramFileUniqueId: 'new',
      purpose: 'HANDOVER',
      storageKey: 'private/new.jpg',
      sha256: 'b'.repeat(64),
      width: 1000,
      height: 800,
    });
    await fixture.db
      .update(handoverMedia)
      .set({ mediaObjectId: replacement })
      .where(eq(handoverMedia.handoverId, id.handoverId));
    await expect(service.get(id, master)).rejects.toMatchObject({ code: 'INSPECTION_NOT_FOUND' });
    expect((await service.get({ ...id, mediaId: replacement }, master)).review.status).toBe(
      'UNREVIEWED',
    );
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(1);
  });
});
