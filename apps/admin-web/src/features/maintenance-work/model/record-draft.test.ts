import { describe, expect, it } from 'vitest';
import { MaterialsUsedKind, type WorkDetail } from '@vakhta/contracts';
import { OperationResult, WorkStatus, WorkType } from '@vakhta/domain';
import { canRecordCompletion, initialRecord, toRecordCommand, withAnswer } from './record-draft';

const TODAY = '2026-09-24';
const ASSIGNEE = '0b4a0c1e-5d1f-4d8e-9a55-3c0e3b1d2f10';

function work(overrides: Partial<WorkDetail> = {}): WorkDetail {
  return {
    id: '7c1e9a55-3c0e-4d8e-9a55-3c0e3b1d2f10',
    type: WorkType.PLANNED_MAINTENANCE,
    status: WorkStatus.ASSIGNED,
    version: 4,
    assignee: { id: ASSIGNEE, fullName: 'Mechanic' },
    operations: [
      { id: 'a', ordinal: 1, text: 'Clean', place: null, photoRequired: false, answer: null },
      {
        id: 'b',
        ordinal: 2,
        text: 'Check belt',
        place: null,
        photoRequired: true,
        answer: {
          result: OperationResult.DONE,
          reason: null,
          mediaObjectId: null,
          answeredAt: '2026-09-23T09:00:00Z',
          answeredBy: 'Mechanic',
        },
      },
    ],
    materials: [
      {
        id: 'm',
        kind: 'MATERIAL',
        name: 'Grease',
        quantity: 50,
        unit: 'g',
        mode: 'EVERY_CYCLE',
      },
    ],
    ...overrides,
  } as unknown as WorkDetail;
}

describe('recording completion on behalf of a mechanic (AC-039)', () => {
  it('is offered only for open planned maintenance', () => {
    expect(canRecordCompletion(work())).toBe(true);
    expect(canRecordCompletion(work({ status: WorkStatus.IN_REVIEW }))).toBe(false);
    expect(canRecordCompletion(work({ type: WorkType.EMERGENCY_REPAIR }))).toBe(false);
  });

  it('starts from the assignee, today and the answers already given in the bot', () => {
    const draft = initialRecord(work(), TODAY);
    expect(draft.performerId).toBe(ASSIGNEE);
    expect(draft.performedOn).toBe(TODAY);
    expect(draft.answers.get(1)?.result).toBeNull();
    expect(draft.answers.get(2)?.result).toBe(OperationResult.DONE);
  });

  it('asks for every answer, a reason for "not applicable", other materials and a past date', () => {
    const base = initialRecord(work(), TODAY);
    const invalid = toRecordCommand(
      work(),
      {
        ...withAnswer(base, 1, { result: OperationResult.NOT_APPLICABLE }),
        performedOn: '2026-09-25',
        materialsKind: MaterialsUsedKind.OTHER,
      },
      TODAY,
    );
    expect(invalid).toEqual({
      ok: false,
      fields: new Set(['performedOn', 'answer:1', 'materialsText']),
    });
  });

  it('builds the command the server expects', () => {
    const draft = withAnswer(initialRecord(work(), TODAY), 1, {
      result: OperationResult.NOT_APPLICABLE,
      reason: '  no dust ',
    });
    expect(toRecordCommand(work(), draft, TODAY)).toEqual({
      ok: true,
      value: {
        expectedVersion: 4,
        performerId: ASSIGNEE,
        performedOn: TODAY,
        answers: [
          { ordinal: 1, result: OperationResult.NOT_APPLICABLE, reason: 'no dust' },
          { ordinal: 2, result: OperationResult.DONE },
        ],
        materialsUsed: { kind: MaterialsUsedKind.AS_PLANNED },
      },
    });
    expect(toRecordCommand(work({ materials: [] }), draft, TODAY)).toMatchObject({
      ok: true,
      value: { materialsUsed: null },
    });
  });
});
