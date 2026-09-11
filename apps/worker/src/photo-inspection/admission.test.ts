import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  auditLog,
  backgroundTasks,
  checklistDefinitions,
  checklistPhotoRules,
  sites,
  orgUnits,
  responsibilityZones,
  employees,
  eq,
  handoverMedia,
  handoverRecords,
  mediaObjects,
  photoInspectionRuns,
  photoInspections,
  shiftSessions,
  sql,
} from '@vakhta/db';
import {
  AUTOMATIC_INSPECTION_ACTOR,
  prohibitedPhotoInstruction,
  AUTOMATIC_INSPECTION_PROMPT_VERSION,
} from '@vakhta/contracts';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { admitSubmittedPhotoInspections } from './admission.js';
import { dispatchInspectionTasks } from './tasks.js';
import { advanceCompletedPhotoReviews } from './review-stage.js';
import { inspectionPrompt } from './gemma.js';

describe('automatic admission from submitted checklist photos', () => {
  let fixture: TestDatabase;
  let handoverId: string;
  let mediaId: string;
  beforeAll(async () => {
    fixture = await startTestDatabase();
  });
  afterAll(async () => {
    await fixture?.stop();
  });
  beforeEach(async () => {
    const db = fixture.db;
    await db.execute(
      sql`TRUNCATE sites, employees, checklist_definitions, media_objects, background_tasks CASCADE`,
    );
    const employeeId = randomUUID(),
      shiftId = randomUUID(),
      definitionId = randomUUID();
    handoverId = randomUUID();
    mediaId = randomUUID();
    await db.insert(employees).values({ id: employeeId, personnelNumber: 'qa', fullName: 'QA' });
    await db.insert(shiftSessions).values({ id: shiftId, employeeId, businessDate: '2026-09-11' });
    const siteId = randomUUID(),
      unitId = randomUUID(),
      zoneId = randomUUID();
    await db.insert(sites).values({ id: siteId, code: 'qa', name: 'QA', timezone: 'Europe/Kyiv' });
    await db.insert(orgUnits).values({ id: unitId, siteId, name: 'QA' });
    await db
      .insert(responsibilityZones)
      .values({ id: zoneId, siteId, orgUnitId: unitId, code: 'qa', name: 'QA zone' });
    await db.insert(checklistDefinitions).values({
      id: definitionId,
      familyId: definitionId,
      version: 1,
      items: [{ key: 'table', label: 'Table', kind: 'PHOTO' }],
    });
    await db.insert(checklistPhotoRules).values({
      definitionId,
      familyId: definitionId,
      zoneId,
      items: ['Ганчірки', 'Стаканчики', 'Інструменти'],
      updatedBy: 'master',
    });
    await db.insert(handoverRecords).values({
      zoneId,
      id: handoverId,
      shiftSessionId: shiftId,
      submittedBy: employeeId,
      checklistDefinitionId: definitionId,
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });
    await db.insert(mediaObjects).values({
      id: mediaId,
      telegramFileId: 'qa',
      telegramFileUniqueId: 'qa',
      purpose: 'HANDOVER',
      storageKey: 'qa.jpg',
      sha256: 'a'.repeat(64),
      width: 100,
      height: 100,
      processedAt: new Date(),
    });
    await db.insert(handoverMedia).values({ handoverId, mediaObjectId: mediaId, itemKey: 'table' });
  });
  it('waits for submission and media readiness, then snapshots the existing photo without page access', async () => {
    await fixture.db.update(handoverRecords).set({ status: 'DRAFT' });
    expect(await admitSubmittedPhotoInspections(fixture.db)).toBe(0);
    await fixture.db.update(handoverRecords).set({ status: 'SUBMITTED' });
    await fixture.db.update(mediaObjects).set({ processedAt: null });
    expect(await admitSubmittedPhotoInspections(fixture.db)).toBe(0);
    await fixture.db.update(mediaObjects).set({ processedAt: new Date() });
    expect(await admitSubmittedPhotoInspections(fixture.db)).toBe(1);
    const [run] = await fixture.db.select().from(photoInspectionRuns);
    expect(run).toMatchObject({
      requestedBy: AUTOMATIC_INSPECTION_ACTOR,
      guidance: prohibitedPhotoInstruction(['Ганчірки', 'Стаканчики', 'Інструменти']),
      promptVersion: AUTOMATIC_INSPECTION_PROMPT_VERSION,
    });
    expect(run?.context).toMatchObject({
      handoverId,
      mediaId,
      photoLabel: 'Table',
      itemKey: 'table',
    });
    expect(await fixture.db.select().from(backgroundTasks)).toHaveLength(1);
    expect(
      await fixture.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'photo_inspection.auto_analyze')),
    ).toHaveLength(1);
  });
  it('admits once under concurrent polls and retains terminal failure without automatic resubmission', async () => {
    await Promise.all([
      admitSubmittedPhotoInspections(fixture.db),
      admitSubmittedPhotoInspections(fixture.db),
    ]);
    expect(await fixture.db.select().from(photoInspectionRuns)).toHaveLength(1);
    await dispatchInspectionTasks(fixture.db, null);
    expect(await admitSubmittedPhotoInspections(fixture.db)).toBe(0);
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.status).toBe('FAILED');
  });
  it('preserves human review data when publishing AI output', async () => {
    await admitSubmittedPhotoInspections(fixture.db);
    const review = {
      status: 'COMPLIANT',
      comment: 'Master checked before AI finished',
      guidance: '',
      annotations: [],
    };
    await fixture.db.update(photoInspections).set({ version: 1, review });
    await dispatchInspectionTasks(fixture.db, {
      analyze: async (input) => {
        expect(inspectionPrompt(input)).toContain('Стаканчики');
        return {
          prediction: {
            status: 'PROBLEMS',
            summary: 'Чашка на столі заборонена.',
            limitations: '',
            findings: [
              {
                category: 'OTHER',
                comment: 'Чашка на столі заборонена.',
                geometry: { type: 'RECTANGLE', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
              },
            ],
          },
          usage: null,
        };
      },
    });
    expect((await fixture.db.select().from(photoInspections))[0]?.review).toEqual(review);
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.status).toBe('SUCCEEDED');
  });
  it('retries automatic output that cannot locate a prohibited object', async () => {
    await admitSubmittedPhotoInspections(fixture.db);
    await dispatchInspectionTasks(
      fixture.db,
      {
        analyze: async () => ({
          prediction: {
            status: 'PROBLEMS',
            summary: 'Cup',
            limitations: '',
            findings: [{ category: 'OTHER', comment: 'Cup', geometry: null }],
          },
          usage: null,
        }),
      },
      { retryMs: 1 },
    );
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.status).toBe('PENDING');
    expect((await fixture.db.select().from(backgroundTasks))[0]?.attempts).toBe(1);
  });
  it('skips blocked early candidates before limiting the batch', async () => {
    const db = fixture.db;
    const [definition] = await db.select().from(checklistDefinitions);
    if (!definition) throw new Error('Expected checklist');
    const items = Array.from({ length: 25 }, (_, index) => ({
      key: `pending-${index}`,
      label: 'Pending photo',
      kind: 'PHOTO' as const,
    }));
    await db.update(checklistDefinitions).set({ items: [...definition.items, ...items] });
    for (const [index, item] of items.entries()) {
      const blockedMediaId = randomUUID(),
        inspectionId = randomUUID();
      await db.insert(mediaObjects).values({
        id: blockedMediaId,
        purpose: 'HANDOVER',
        telegramFileId: item.key,
        telegramFileUniqueId: item.key,
        storageKey: 'qa.jpg',
        sha256: 'a'.repeat(64),
        width: 100,
        height: 100,
        processedAt: new Date(),
      });
      await db.insert(handoverMedia).values({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        handoverId,
        mediaObjectId: blockedMediaId,
        itemKey: item.key,
      });
      await db.insert(photoInspections).values({
        id: inspectionId,
        handoverId,
        mediaId: blockedMediaId,
        itemKey: item.key,
        context: {},
        review: {},
      });
      await db.insert(photoInspectionRuns).values({
        id: randomUUID(),
        inspectionId,
        reviewVersion: 0,
        context: {},
        guidance: '',
        model: 'test',
        promptVersion: 'test',
        requestedBy: 'master',
      });
    }
    expect(await admitSubmittedPhotoInspections(db)).toBe(1);
    const [automatic] = await db
      .select()
      .from(photoInspectionRuns)
      .where(eq(photoInspectionRuns.requestedBy, AUTOMATIC_INSPECTION_ACTOR));
    expect(automatic?.context).toMatchObject({ mediaId });
  });
  it('moves only terminal automatic reports to master review without resolving them', async () => {
    await admitSubmittedPhotoInspections(fixture.db);
    expect(await advanceCompletedPhotoReviews(fixture.db)).toBe(0);
    await dispatchInspectionTasks(fixture.db, null);
    expect(await advanceCompletedPhotoReviews(fixture.db)).toBe(1);
    expect(await advanceCompletedPhotoReviews(fixture.db)).toBe(0);
    expect((await fixture.db.select().from(handoverRecords))[0]?.status).toBe('MASTER_REVIEW');
  });
  it('does not admit photos when the zone has no prohibited items', async () => {
    await fixture.db.update(checklistPhotoRules).set({ items: [] });
    expect(await admitSubmittedPhotoInspections(fixture.db)).toBe(0);
  });
  it('keeps the report instruction snapshot when zone rules change while a later photo is processing', async () => {
    await admitSubmittedPhotoInspections(fixture.db);
    await fixture.db.update(checklistPhotoRules).set({ items: [] });
    const [definition] = await fixture.db.select().from(checklistDefinitions);
    if (!definition) throw new Error('Missing definition');
    await fixture.db
      .update(checklistDefinitions)
      .set({ items: [...definition.items, { key: 'later', label: 'Later', kind: 'PHOTO' }] });
    await fixture.db
      .insert(handoverMedia)
      .values({ handoverId, mediaObjectId: mediaId, itemKey: 'later' });
    expect(await advanceCompletedPhotoReviews(fixture.db)).toBe(0);
    expect(await admitSubmittedPhotoInspections(fixture.db)).toBe(1);
    const runs = await fixture.db.select().from(photoInspectionRuns);
    expect(runs[1]?.guidance).toBe(runs[0]?.guidance);
    await dispatchInspectionTasks(fixture.db, null);
    expect(await advanceCompletedPhotoReviews(fixture.db)).toBe(0);
    await dispatchInspectionTasks(fixture.db, null);
    expect(await advanceCompletedPhotoReviews(fixture.db)).toBe(1);
  });
  it('does not reopen a report resolved while AI was running', async () => {
    await admitSubmittedPhotoInspections(fixture.db);
    await fixture.db.update(handoverRecords).set({ status: 'RESOLVED_ACCEPTED' });
    await dispatchInspectionTasks(fixture.db, null);
    expect(await advanceCompletedPhotoReviews(fixture.db)).toBe(0);
  });
  it('hands an entirely corrupt report to the master without pretending AI inspected it', async () => {
    await fixture.db.update(mediaObjects).set({ quality: 'CORRUPT', width: null, height: null });
    expect(await admitSubmittedPhotoInspections(fixture.db)).toBe(0);
    expect(await advanceCompletedPhotoReviews(fixture.db)).toBe(1);
    expect(await fixture.db.select().from(photoInspectionRuns)).toHaveLength(0);
  });
  it('does not analyze a previously completed handover', async () => {
    await fixture.db.update(handoverRecords).set({ status: 'RESOLVED_ACCEPTED' });
    expect(await admitSubmittedPhotoInspections(fixture.db)).toBe(0);
  });
});
