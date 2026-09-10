import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backgroundTasks,
  checklistDefinitions,
  employees,
  enqueueBackgroundTask,
  handoverRecords,
  mediaObjects,
  photoInspectionRuns,
  photoInspections,
  shiftSessions,
  sql,
} from '@vakhta/db';
import {
  INSPECTION_MODEL,
  INSPECTION_PROMPT_VERSION,
  type InspectionContext,
  type InspectionPrediction,
} from '@vakhta/contracts';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { InspectionFailure, parseInspectionCompletion } from './gemma.js';
import { dispatchInspectionTasks } from './tasks.js';

const prediction: InspectionPrediction = {
  status: 'NOT_ASSESSABLE',
  summary: 'The surface is obscured.',
  limitations: 'Cannot inspect the table.',
  findings: [],
};
describe('durable photo analysis', () => {
  let fixture: TestDatabase;
  let runId: string;
  beforeAll(async () => {
    fixture = await startTestDatabase();
  });
  afterAll(async () => {
    await fixture?.stop();
  });
  beforeEach(async () => {
    const db = fixture.db;
    await db.execute(
      sql`TRUNCATE employees, checklist_definitions, media_objects, background_tasks CASCADE`,
    );
    const employeeId = randomUUID(),
      shiftId = randomUUID(),
      handoverId = randomUUID(),
      mediaId = randomUUID(),
      definitionId = randomUUID(),
      inspectionId = randomUUID();
    runId = randomUUID();
    await db.insert(employees).values({ id: employeeId, personnelNumber: 'qa', fullName: 'QA' });
    await db.insert(shiftSessions).values({ id: shiftId, employeeId, businessDate: '2026-09-10' });
    await db.insert(checklistDefinitions).values({ id: definitionId, version: 1, items: [] });
    await db.insert(handoverRecords).values({
      id: handoverId,
      shiftSessionId: shiftId,
      submittedBy: employeeId,
      checklistDefinitionId: definitionId,
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
    });
    const context: InspectionContext = {
      schemaVersion: 1,
      handoverId,
      mediaId,
      itemKey: 'qa',
      checklistDefinitionId: definitionId,
      checklistVersion: 1,
      photoLabel: 'Table',
      checklist: [],
      zoneId: null,
      zoneName: null,
      shiftSessionId: shiftId,
      businessDate: '2026-09-10',
      sha256: 'a'.repeat(64),
      encodedWidth: 100,
      encodedHeight: 100,
      contentType: 'image/jpeg',
      orientationPolicy: 'EXIF_AUTO_ORIENT',
    };
    await db.insert(photoInspections).values({
      id: inspectionId,
      handoverId,
      mediaId,
      itemKey: 'qa',
      context,
      review: { status: 'UNREVIEWED', annotations: [], comment: '', guidance: '' },
    });
    await db.insert(photoInspectionRuns).values({
      id: runId,
      inspectionId,
      reviewVersion: 0,
      context,
      guidance: '',
      model: INSPECTION_MODEL,
      promptVersion: INSPECTION_PROMPT_VERSION,
      requestedBy: 'qa',
    });
    await db.transaction((tx) =>
      enqueueBackgroundTask(tx, {
        kind: 'PHOTO_INSPECT',
        payloadVersion: 1,
        payload: { runId },
        dedupeKey: `photo-inspect.${runId}`,
        dueAt: new Date(),
      }),
    );
  });
  it('publishes one result under concurrent dispatch without modifying the human review', async () => {
    const analyze = vi.fn(async () => ({ prediction, usage: { total_tokens: 20 } }));
    await Promise.all([
      dispatchInspectionTasks(fixture.db, { analyze }),
      dispatchInspectionTasks(fixture.db, { analyze }),
    ]);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.status).toBe('SUCCEEDED');
    expect((await fixture.db.select().from(backgroundTasks))[0]?.status).toBe('COMPLETED');
    expect((await fixture.db.select().from(photoInspections))[0]?.version).toBe(0);
  });
  it('persists a visible configuration failure and finishes the queue intent', async () => {
    await dispatchInspectionTasks(fixture.db, null);
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.errorCode).toBe(
      'AI_NOT_CONFIGURED',
    );
    expect((await fixture.db.select().from(backgroundTasks))[0]?.status).toBe('COMPLETED');
  });
  it('bounds paid retries and recovers tasks after retry delay', async () => {
    const analyze = vi.fn(async () => {
      throw new InspectionFailure('AI_UNAVAILABLE', true);
    });
    for (let i = 0; i < 3; i++) {
      await dispatchInspectionTasks(fixture.db, { analyze }, { retryMs: 1 });
      if (i < 2) await fixture.db.update(backgroundTasks).set({ availableAt: new Date() });
    }
    expect(analyze).toHaveBeenCalledTimes(3);
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.status).toBe('FAILED');
    await dispatchInspectionTasks(fixture.db, { analyze });
    expect(analyze).toHaveBeenCalledTimes(3);
  });
  it('rejects late I/O completion after losing the task lease', async () => {
    await dispatchInspectionTasks(fixture.db, {
      analyze: async () => {
        await fixture.db.update(backgroundTasks).set({ leaseUntil: new Date(0) });
        return { prediction, usage: null };
      },
    });
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.status).toBe('PENDING');
    await dispatchInspectionTasks(fixture.db, {
      analyze: async () => ({ prediction, usage: null }),
    });
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.status).toBe('SUCCEEDED');
  });
  it('times out dependencies that ignore abort without publishing a late result', async () => {
    await dispatchInspectionTasks(
      fixture.db,
      {
        analyze: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { prediction, usage: null };
        },
      },
      { timeoutMs: 5 },
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect((await fixture.db.select().from(photoInspectionRuns))[0]?.status).toBe('PENDING');
    expect((await fixture.db.select().from(backgroundTasks))[0]?.lastErrorCode).toBe(
      'DEPENDENCY_UNAVAILABLE',
    );
  });
  it('does not publish a partially assigned result when boundary validation fails', async () => {
    await dispatchInspectionTasks(fixture.db, {
      analyze: async () => ({ prediction: { ...prediction, summary: '' }, usage: null }),
    });
    const [run] = await fixture.db.select().from(photoInspectionRuns);
    expect(run?.status).toBe('FAILED');
    expect(run?.prediction).toBeNull();
    expect(run?.errorCode).toBe('ANALYSIS_FAILED');
    expect((await fixture.db.select().from(backgroundTasks))[0]?.status).toBe('COMPLETED');
  });
  it('rejects malformed and truncated model results', () => {
    expect(() =>
      parseInspectionCompletion({ choices: [{ message: { content: 'not json' } }] }),
    ).toThrow('INVALID_RESPONSE');
    expect(() =>
      parseInspectionCompletion({
        choices: [{ finish_reason: 'length', message: { content: JSON.stringify(prediction) } }],
      }),
    ).toThrow('INVALID_RESPONSE');
    expect(
      parseInspectionCompletion({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(prediction) } }],
      }).prediction,
    ).toEqual(prediction);
  });
});
