import { describe, expect, it } from 'vitest';
import type { EquipmentDetail } from '@vakhta/contracts';
import { IntervalUnit, PlanSourceKind } from '@vakhta/domain';
import {
  PublishIssue,
  emptyPlan,
  move,
  newOperation,
  publishIssues,
  schedulePreview,
  toContent,
} from './plan-draft';

const machine = {
  documents: [],
  responsible: { id: '0b4a0c1e-5d1f-4d8e-9a55-3c0e3b1d2f10', fullName: 'Mechanic' },
} as unknown as EquipmentDetail;

describe('maintenance plan draft', () => {
  it('starts from the machine mechanic and a plant decision without a manual', () => {
    const draft = emptyPlan(machine);
    expect(draft.assigneeEmployeeId).toBe(machine.responsible.id);
    expect(draft.sourceKind).toBe(PlanSourceKind.PLANT_DECISION);
  });

  it('names what blocks publication', () => {
    const issues = publishIssues(emptyPlan(machine), false);
    expect(issues).toEqual([
      PublishIssue.TITLE_REQUIRED,
      PublishIssue.FIRST_DUE_REQUIRED,
      PublishIssue.OPERATIONS_REQUIRED,
      PublishIssue.SOURCE_NOTE_REQUIRED,
    ]);
    expect(publishIssues({ ...emptyPlan(machine), title: 'Weekly' }, true)).not.toContain(
      PublishIssue.FIRST_DUE_REQUIRED,
    );
  });

  it('drops empty rows and reads decimal commas', () => {
    const draft = {
      ...emptyPlan(machine),
      title: 'Monthly',
      sourceNote: 'Plant decision',
      operations: [{ ...newOperation(), text: 'Lubricate' }, newOperation()],
      materials: [
        {
          key: 'k',
          kind: 'MATERIAL',
          name: 'Grease',
          article: '',
          quantity: '0,2',
          unit: 'l',
          mode: 'EVERY_CYCLE',
        },
      ],
    } as const;
    const checked = toContent(draft);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.content.operations).toHaveLength(1);
    expect(checked.content.materials[0]?.quantity).toBe(0.2);
  });

  it('previews the reminder days and the next date', () => {
    const preview = schedulePreview({ ...emptyPlan(machine), firstDueOn: '2026-09-30' }, [1, 7, 3]);
    expect(preview).toEqual({
      firstDueOn: '2026-09-30',
      reminders: ['2026-09-23', '2026-09-27', '2026-09-29'],
      nextDueOn: '2026-10-30',
      interval: { intervalUnit: IntervalUnit.MONTH, intervalCount: 1 },
    });
  });

  it('moves a row within bounds', () => {
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });
});
