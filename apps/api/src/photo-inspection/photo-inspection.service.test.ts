import { PhotoAnalysisConfigSchema } from '../config/photo-analysis.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  photoObjects,
  responsibilityZones,
  shiftAssignments,
  shiftTemplates,
  scheduleVersions,
  shiftSessions,
  sites,
  sql,
} from '@vakhta/db';
import {
  INSPECTION_PROMPT_VERSION,
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
  isReference: false,
  rejectedFindings: [],
};
const RAG_ID = '40000000-0000-4000-8000-000000000001';
const CUP_ID = '40000000-0000-4000-8000-000000000002';
describe('photo inspection persistence and access', () => {
  let fixture: TestDatabase;
  let service: PhotoInspectionService;
  let id: InspectionIdentity;
  let siteId: string;
  let employeeId: string;
  let familyId: string;
  let zoneId: string;
  beforeAll(async () => {
    fixture = await startTestDatabase();
    const audit = new AuditLog();
    service = new PhotoInspectionService(
      fixture.db,
      audit,
      new MediaService(fixture.db, audit, { linkTtlSeconds: 300 }, new InMemoryObjectStorage()),
      PhotoAnalysisConfigSchema.parse({}),
    );
  });
  afterAll(async () => {
    await fixture?.stop();
  });
  beforeEach(async () => {
    await fixture.db.execute(
      sql`TRUNCATE sites, employees, checklist_definitions, media_objects, background_tasks, photo_objects CASCADE`,
    );
    const db = fixture.db;
    siteId = randomUUID();
    const unitId = randomUUID();
    zoneId = randomUUID();
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
    const [definition] = await db
      .insert(checklistDefinitions)
      .values({
        id: definitionId,
        version: 1,
        items: [{ key: 'workplace', label: 'Workplace', kind: 'PHOTO' }],
      })
      .returning();
    familyId = definition!.familyId;
    await db.insert(photoObjects).values([
      { id: RAG_ID, name: 'Ганчірки', updatedBy: 'test' },
      { id: CUP_ID, name: 'Стаканчики', updatedBy: 'test' },
    ]);
    // Analysis needs the checklist object list for this zone; most tests start from one rule.
    await db.insert(checklistPhotoRules).values({
      definitionId,
      familyId,
      zoneId,
      rules: [{ objectId: RAG_ID, note: '' }],
      updatedBy: 'test',
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
      objectId: RAG_ID,
      verdict: 'VIOLATION' as const,
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
  it('snapshots the current checklist rules at request time and refuses analysis without rules', async () => {
    const request = { requestId: randomUUID(), version: 0 };
    const result = await service.analyze(id, request, master);
    expect(result.version).toBe(0);
    expect(result.review).toMatchObject({ status: 'UNREVIEWED', annotations: [] });
    expect(result.rules).toEqual([{ objectId: RAG_ID, name: 'Ганчірки', note: '' }]);
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(0);
    const [run] = await fixture.db.select().from(photoInspectionRuns);
    expect(run?.promptVersion).toBe(INSPECTION_PROMPT_VERSION);
    expect(JSON.parse(run?.guidance ?? '')).toEqual(result.rules);
    await service.analyze(id, request, master);
    await expect(service.analyze(id, { ...request, version: 3 }, master)).rejects.toMatchObject({
      code: 'INSPECTION_CONFLICT',
    });
    await fixture.db.update(checklistPhotoRules).set({ rules: [] });
    await fixture.db
      .update(photoInspectionRuns)
      .set({ status: 'FAILED', errorCode: 'X', completedAt: new Date() });
    await expect(
      service.analyze(id, { requestId: randomUUID(), version: 0 }, master),
    ).rejects.toMatchObject({ code: 'INSPECTION_RULES_MISSING' });
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
      PhotoAnalysisConfigSchema.parse({}),
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
  it('retains named regions without duplicate comments in saved reviews, export and library search', async () => {
    const annotation = {
      id: randomUUID(),
      objectId: null,
      objectName: 'Disposable cups',
      verdict: 'VIOLATION' as const,
      comment: '',
      category: 'OTHER' as const,
      sourceRunId: null,
      geometry: { type: 'RECTANGLE' as const, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    };
    await service.save(
      id,
      { version: 0, review: { ...clean, status: 'PROBLEMS', annotations: [annotation] } },
      master,
    );
    expect((await service.get(id, master)).review.annotations).toEqual([annotation]);
    expect((await service.export(id, master)).review.annotations).toEqual([annotation]);
    const library = await new PhotoLibraryService(fixture.db).list(
      PhotoLibraryQuery.parse({ search: 'disposable' }),
      master,
    );
    expect(library.total).toBe(1);
    expect(library.rows[0]?.remarks).toEqual(['Disposable cups']);
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
  it('isolates checklist rules by zone, enforces scope, catalog identity and optimistic concurrency', async () => {
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
      {
        version: 1,
        rules: [
          { objectId: RAG_ID, note: '' },
          { objectId: CUP_ID, note: 'Стаканчики у гніздах машини є продукцією' },
        ],
      },
      scoped,
    );
    expect(saved).toMatchObject({
      version: 2,
      canEdit: true,
      rules: [
        { objectId: RAG_ID, name: 'Ганчірки', note: '' },
        { objectId: CUP_ID, name: 'Стаканчики', note: 'Стаканчики у гніздах машини є продукцією' },
      ],
    });
    expect((await service.get(id, scoped)).rules).toEqual(saved.rules);
    expect((await rules.get(report.checklistDefinitionId, otherZoneId, master)).rules).toEqual([]);
    const cup = { objectId: CUP_ID, note: '' };
    await expect(
      rules.save(report.checklistDefinitionId, otherZoneId, { version: 0, rules: [cup] }, scoped),
    ).rejects.toMatchObject({ code: 'INSPECTION_FORBIDDEN' });
    await expect(
      rules.save(report.checklistDefinitionId, zone.id, { version: 0, rules: [cup] }, scoped),
    ).rejects.toMatchObject({ code: 'INSPECTION_CONFLICT' });
    await expect(
      rules.save(report.checklistDefinitionId, zone.id, { version: 2, rules: [cup, cup] }, scoped),
    ).rejects.toThrow();
    await expect(
      rules.save(
        report.checklistDefinitionId,
        zone.id,
        { version: 2, rules: [{ objectId: randomUUID(), note: '' }] },
        scoped,
      ),
    ).rejects.toMatchObject({ code: 'PHOTO_OBJECT_NOT_FOUND' });
    expect(await db.select().from(checklistPhotoRules)).toHaveLength(1);
    await expect(
      db.execute(sql`update checklist_photo_rules set rules = '{}'::jsonb`),
    ).rejects.toThrow();
  });
  it('records rejected findings, verdict-driven outcomes and review time as dataset evidence', async () => {
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
          summary: 'Ганчірки: 2',
          limitations: '',
          findings: [
            { objectId: RAG_ID, objectName: 'Ганчірки', comment: 'ганчірка зліва', geometry },
            { objectId: RAG_ID, objectName: 'Ганчірки', comment: 'ганчірка справа', geometry },
          ],
        },
      })
      .where(eq(photoInspectionRuns.id, run.id));
    const allowed = {
      id: randomUUID(),
      sourceRunId: run.id,
      sourceFindingIndex: 0,
      geometry,
      category: 'OTHER' as const,
      objectId: RAG_ID,
      verdict: 'ALLOWED' as const,
      comment: 'На гачку, дозволено',
    };
    const review: InspectionReview = {
      ...clean,
      status: 'COMPLIANT',
      annotations: [allowed],
      isReference: true,
      rejectedFindings: [{ runId: run.id, index: 1, reason: 'NOT_PRESENT' }],
    };
    await expect(
      service.save(id, { version: 0, review: { ...review, status: 'PROBLEMS' } }, master),
    ).rejects.toThrow();
    await expect(
      service.save(
        id,
        {
          version: 0,
          review: {
            ...review,
            rejectedFindings: [{ runId: run.id, index: 5, reason: 'NOT_PRESENT' }],
          },
        },
        master,
      ),
    ).rejects.toMatchObject({ code: 'INSPECTION_INVALID_SOURCE' });
    const saved = await service.save(id, { version: 0, review, durationMs: 4200 }, master);
    expect(saved.review).toEqual(review);
    expect((await fixture.db.select().from(photoInspectionRevisions))[0]?.durationMs).toBe(4200);
    expect(await fixture.db.select().from(photoInspectionRevisions)).toHaveLength(1);
  });
  it.each([
    { perPhoto: 2, global: 20 },
    { perPhoto: 20, global: 2 },
  ])(
    'displays and enforces configured quotas $perPhoto/$global, then recovers after expiry',
    async (limits) => {
      const audit = new AuditLog();
      const limited = new PhotoInspectionService(
        fixture.db,
        audit,
        new MediaService(fixture.db, audit, { linkTtlSeconds: 300 }, new InMemoryObjectStorage()),
        PhotoAnalysisConfigSchema.parse({
          PHOTO_INSPECTION_PER_PHOTO_LIMIT: limits.perPhoto,
          PHOTO_INSPECTION_GLOBAL_LIMIT: limits.global,
          PHOTO_INSPECTION_WINDOW_HOURS: 8,
        }),
      );
      expect(await limited.analysisLimits(id, master)).toEqual({
        windowHours: 8,
        perPhoto: { used: 0, limit: limits.perPhoto },
        global: { used: 0, limit: limits.global },
      });
      await expect(limited.analysisLimits(id, { ...master, grants: [] })).rejects.toMatchObject({
        status: 403,
      });
      const firstRequest = { version: 0, requestId: randomUUID() };
      await limited.analyze(id, firstRequest, master);
      expect((await limited.analysisLimits(id, master)).perPhoto.used).toBe(1);
      await fixture.db
        .update(photoInspectionRuns)
        .set({ status: 'FAILED', errorCode: 'TEST_FAILURE', completedAt: new Date() })
        .where(eq(photoInspectionRuns.status, 'PENDING'));
      const secondRequest = { version: 0, requestId: randomUUID() };
      await limited.analyze(id, secondRequest, master);
      await fixture.db
        .update(photoInspectionRuns)
        .set({ status: 'FAILED', errorCode: 'TEST_FAILURE', completedAt: new Date() })
        .where(eq(photoInspectionRuns.status, 'PENDING'));
      expect(await limited.analysisLimits(id, master)).toEqual({
        windowHours: 8,
        perPhoto: { used: 2, limit: limits.perPhoto },
        global: { used: 2, limit: limits.global },
      });
      await expect(
        limited.analyze(id, { version: 0, requestId: randomUUID() }, master),
      ).rejects.toMatchObject({ code: 'INSPECTION_LIMIT' });
      await limited.analyze(id, secondRequest, master);
      expect(await fixture.db.select().from(photoInspectionRuns)).toHaveLength(2);
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date(Date.now() + 9 * 60 * 60 * 1000));
        expect((await limited.analysisLimits(id, master)).global.used).toBe(0);
        await limited.analyze(id, { version: 0, requestId: randomUUID() }, master);
        expect((await limited.analysisLimits(id, master)).global.used).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
