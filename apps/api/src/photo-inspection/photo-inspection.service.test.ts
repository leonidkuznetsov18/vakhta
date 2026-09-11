import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backgroundTasks,
  checklistDefinitions,
  checklistPhotoRules,
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
import {
  AUTOMATIC_INSPECTION_ACTOR,
  InspectionContext,
  PhotoLibraryQuery,
  type InspectionReview,
} from '@vakhta/contracts';
import { ChecklistPhotoRulesService } from './checklist-photo-rules.service.js';
import { PhotoLibraryService } from './photo-library.service.js';
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
  it('persists finding identity through edits and rejects missing source positions without saving', async () => {
    const pending = await service.analyze(id, { requestId: randomUUID(), version: 0 }, master);
    const run = pending.runs[0];
    if (!run) throw new Error('Expected run');
    const geometry = { type: 'RECTANGLE' as const, x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    await fixture.db
      .update(photoInspectionRuns)
      .set({
        status: 'SUCCEEDED',
        completedAt: new Date(),
        prediction: {
          status: 'PROBLEMS',
          summary: 'Possible rag',
          limitations: '',
          findings: [
            { category: 'RAG', comment: 'Rag', geometry },
            { category: 'OTHER', comment: 'Unlocated', geometry: null },
          ],
        },
      })
      .where(eq(photoInspectionRuns.id, run.id));
    const annotation = {
      id: randomUUID(),
      sourceRunId: run.id,
      sourceFindingIndex: 0,
      geometry,
      category: 'OTHER' as const,
      comment: 'Corrected by master',
    };
    const review: InspectionReview = { ...clean, status: 'PROBLEMS', annotations: [annotation] };
    const saved = await service.save(id, { version: 0, review }, master);
    expect(saved.review.annotations[0]).toMatchObject(annotation);
    expect((await service.get(id, master)).review).toEqual(saved.review);
    for (const sourceFindingIndex of [1, 2])
      await expect(
        service.save(
          id,
          {
            version: 1,
            review: { ...review, annotations: [{ ...annotation, sourceFindingIndex }] },
          },
          master,
        ),
      ).rejects.toMatchObject({ code: 'INSPECTION_INVALID_SOURCE' });
    expect((await service.get(id, master)).version).toBe(1);
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(1);
  });
  it('uses unsaved guidance without saving a human review and rejects changed request replays', async () => {
    const request = { requestId: randomUUID(), version: 0, guidance: 'Keep this surface clear' };
    const result = await service.analyze(id, request, master);
    expect(result.version).toBe(0);
    expect(result.review).toMatchObject({ status: 'UNREVIEWED', guidance: '', annotations: [] });
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(0);
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.guidance).toBe(
      request.guidance,
    );
    await service.analyze(id, request, master);
    await expect(
      service.analyze(id, { ...request, guidance: 'Different rules' }, master),
    ).rejects.toMatchObject({ code: 'INSPECTION_CONFLICT' });
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
    expect(
      (await new PhotoLibraryService(db).list(PhotoLibraryQuery.parse({}), scoped)).total,
    ).toBe(1);
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
    expect(await service.get(id, master)).toMatchObject({ canEdit: false, review: clean });
    await expect(service.save(id, { version: 1, review: clean }, master)).rejects.toMatchObject({
      code: 'INSPECTION_READ_ONLY',
    });
    const library = await new PhotoLibraryService(fixture.db).list(
      PhotoLibraryQuery.parse({}),
      master,
    );
    expect(library.rows[0]).toMatchObject({ archived: true, photo: { media: { id: id.mediaId } } });
    expect((await service.get({ ...id, mediaId: replacement }, master)).review.status).toBe(
      'UNREVIEWED',
    );
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(1);
  });
  it('lists only saved human work, filters the whole collection and clamps server pages', async () => {
    const library = new PhotoLibraryService(fixture.db);
    const list = (input: unknown = {}) => library.list(PhotoLibraryQuery.parse(input), master);
    await service.analyze(id, { version: 0, requestId: randomUUID() }, master);
    expect((await list()).total).toBe(0);
    await service.save(
      id,
      { version: 0, review: { ...clean, comment: 'Specific review note' } },
      master,
    );
    const [source] = await fixture.db.select().from(photoInspections);
    if (!source) throw new Error('Expected inspection');
    // Distinct historical item identities exercise database pagination independently of live attachments.
    for (let index = 0; index < 4; index++) {
      await fixture.db.insert(photoInspections).values({
        handoverId: id.handoverId,
        mediaId: id.mediaId,
        itemKey: `archived-${index}`,
        context: { ...InspectionContext.parse(source.context), itemKey: `archived-${index}` },
        version: 1,
        review: { ...clean, status: 'UNREVIEWED', comment: `Archive ${index}` },
        updatedAt: new Date(),
        updatedBy: master.id,
      });
    }
    const first = await list({ pageSize: 2 });
    const second = await list({ pageSize: 2, page: 2 });
    expect(first.total).toBe(5);
    expect(second.rows).toHaveLength(2);
    expect(second.rows.some((row) => first.rows.some((other) => row.id === other.id))).toBe(false);
    expect(await list({ pageSize: 2, page: 99 })).toMatchObject({ page: 3, total: 5 });
    expect((await list({ search: 'specific' })).rows).toHaveLength(1);
    expect((await list({ search: 'Test worker' })).total).toBe(5);
    expect((await list({ search: 'Table' })).total).toBe(5);
    expect((await list({ search: '%' })).total).toBe(0);
    expect((await list({ status: 'COMPLIANT' })).total).toBe(1);
    expect((await list({ from: '2026-09-10', to: '2026-09-10' })).total).toBe(5);
    expect((await list({ from: '2026-09-11' })).total).toBe(0);
    expect((await list({ to: '2026-09-09' })).total).toBe(0);
    const row = (await list({ status: 'COMPLIANT' })).rows[0];
    expect(row).toMatchObject({
      employee: 'Test worker',
      zone: 'Table',
      annotationCount: 0,
      remarks: ['Specific review note'],
      archived: false,
    });
    expect(row?.photo.media).not.toHaveProperty('storageKey');
    await service.save(id, { version: 1, review: { ...clean, comment: 'Updated note' } }, master);
    expect((await list({ search: 'Updated note' })).rows).toHaveLength(1);
    expect((await list({ search: 'Specific review note' })).rows).toHaveLength(0);
  });
  it('filters counts and rows by exact role scopes without combining unrelated grants', async () => {
    await service.save(id, { version: 0, review: clean }, master);
    const library = new PhotoLibraryService(fixture.db);
    const [zone] = await fixture.db.select().from(responsibilityZones);
    if (!zone) throw new Error('Expected zone');
    for (const grant of [
      { role: 'AUDITOR' as const, scopeType: 'SITE' as const, scopeId: siteId },
      { role: 'SHIFT_MASTER' as const, scopeType: 'ORG_UNIT' as const, scopeId: zone.orgUnitId },
      { role: 'HR' as const, scopeType: 'ZONE' as const, scopeId: zone.id },
    ]) {
      expect(
        (await library.list(PhotoLibraryQuery.parse({}), { ...master, grants: [grant] })).total,
      ).toBe(1);
    }
    for (const grants of [
      [],
      [{ role: 'PLANNER' as const, scopeType: 'ENTERPRISE' as const, scopeId: null }],
      [{ role: 'SHIFT_MASTER' as const, scopeType: 'SITE' as const, scopeId: randomUUID() }],
      [{ role: 'SHIFT_MASTER' as const, scopeType: 'TEAM' as const, scopeId: randomUUID() }],
      [{ role: 'SHIFT_MASTER' as const, scopeType: 'SITE' as const, scopeId: null }],
      [
        { role: 'SHIFT_MASTER' as const, scopeType: 'ZONE' as const, scopeId: randomUUID() },
        { role: 'PLANNER' as const, scopeType: 'ENTERPRISE' as const, scopeId: null },
      ],
    ]) {
      expect(await library.list(PhotoLibraryQuery.parse({}), { ...master, grants })).toMatchObject({
        rows: [],
        total: 0,
      });
    }
  });
  it('isolates checklist rules by zone, enforces scope and optimistic concurrency', async () => {
    const db = fixture.db;
    const rules = new ChecklistPhotoRulesService(db, new AuditLog());
    const [report] = await db.select().from(handoverRecords);
    const [zone] = await db.select().from(responsibilityZones);
    if (!report || !zone) throw new Error('Missing fixture');
    const otherZoneId = randomUUID();
    await db.insert(responsibilityZones).values({
      id: otherZoneId,
      siteId: zone.siteId,
      orgUnitId: zone.orgUnitId,
      code: 'other',
      name: 'Other',
    });
    const scoped: WebUser = {
      ...master,
      grants: [{ role: 'SHIFT_MASTER', scopeType: 'ZONE', scopeId: zone.id }],
    };
    const saved = await rules.save(
      report.checklistDefinitionId,
      zone.id,
      { version: 0, items: ['Ганчірки', 'Стаканчики', 'Інструменти'] },
      scoped,
    );
    expect(saved).toMatchObject({
      version: 1,
      canEdit: true,
      items: ['Ганчірки', 'Стаканчики', 'Інструменти'],
    });
    expect((await service.get(id, scoped)).prohibitedItems).toEqual(saved.items);
    expect((await rules.get(report.checklistDefinitionId, otherZoneId, master)).items).toEqual([]);
    await expect(
      rules.save(report.checklistDefinitionId, otherZoneId, { version: 0, items: ['Cup'] }, scoped),
    ).rejects.toMatchObject({ code: 'INSPECTION_FORBIDDEN' });
    await expect(
      rules.save(report.checklistDefinitionId, zone.id, { version: 0, items: ['Cup'] }, scoped),
    ).rejects.toMatchObject({ code: 'INSPECTION_CONFLICT' });
    await expect(
      rules.save(
        report.checklistDefinitionId,
        zone.id,
        { version: 1, items: ['Cup', ' cup '] },
        scoped,
      ),
    ).rejects.toThrow();
    expect(await db.select().from(checklistPhotoRules)).toHaveLength(1);
  });
  it('exposes automatic boxes as an unconfirmed draft and acknowledges only an explicit human save', async () => {
    const baseline = await service.save(id, { version: 0, review: clean }, master);
    const [inspection] = await fixture.db.select().from(photoInspections);
    if (!inspection) throw new Error('Missing inspection');
    const runId = randomUUID();
    await fixture.db.insert(photoInspectionRuns).values({
      id: runId,
      inspectionId: inspection.id,
      reviewVersion: 1,
      context: baseline.context,
      guidance: 'Cups',
      model: 'test',
      promptVersion: 'workplace-prohibited-v1',
      requestedBy: AUTOMATIC_INSPECTION_ACTOR,
      status: 'SUCCEEDED',
      completedAt: new Date(),
      prediction: {
        status: 'PROBLEMS',
        summary: 'Cup',
        limitations: '',
        findings: [
          {
            category: 'OTHER',
            comment: 'Cup on table',
            geometry: { type: 'RECTANGLE', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          },
        ],
      },
    });
    const view = await service.get(id, master);
    expect(view.review).toEqual(clean);
    expect(view.automaticRunId).toBe(runId);
    expect(view.automaticReview).toMatchObject({
      status: 'UNREVIEWED',
      annotations: [{ sourceRunId: runId, sourceFindingIndex: 0, comment: 'Cup on table' }],
    });
    expect((await service.get(id, master)).automaticReview).toEqual(view.automaticReview);
    await expect(
      service.save(
        id,
        { version: 1, review: { ...clean, status: 'UNREVIEWED' }, automaticRunId: runId },
        master,
      ),
    ).rejects.toMatchObject({ code: 'INSPECTION_INVALID_SOURCE' });
    // Rejecting all suggestions is a valid human decision; the original prediction stays recorded.
    const saved = await service.save(
      id,
      { version: 1, review: clean, automaticRunId: runId },
      master,
    );
    expect(saved.automaticRunId).toBeNull();
    expect(saved.review).toEqual(clean);
    expect(saved.runs[0]?.prediction?.findings).toHaveLength(1);
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(2);
  });
});
