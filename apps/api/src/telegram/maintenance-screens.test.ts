import { describe, expect, it } from 'vitest';
import type { WorkNoticeContext } from '@vakhta/db';
import {
  MaintenanceCallbackAction,
  MaterialMode,
  MaterialsReadiness,
  OperationResult,
  WorkPriority,
  WorkStatus,
  WorkType,
  maintenanceCallback,
} from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import type { MechanicCard } from '../maintenance/mechanic-work.service.js';
import {
  MissingStep,
  currentOperation,
  equipmentPickScreen,
  materialsUsedScreen,
  missingNote,
  missingScreen,
  parseAnswerArg,
  parseMissingArg,
  workCardScreen,
} from './maintenance-screens.js';

const t = messages('en');
const ID = '0b4a0c1e-5d1f-4d8e-9a55-3c0e3b1d2f10';

function card(overrides: {
  readonly type?: WorkType;
  readonly status?: WorkStatus;
  readonly acceptedAt?: Date | null;
  readonly answers?: ReadonlyMap<number, OperationResult>;
  readonly readiness?: MaterialsReadiness;
}): MechanicCard {
  const type = overrides.type ?? WorkType.PLANNED_MAINTENANCE;
  const notice: WorkNoticeContext = {
    data: {
      workOrderId: ID,
      number: 1001,
      type,
      priority: WorkPriority.P3,
      title: 'Monthly lubrication',
      equipmentCode: 'FB-100',
      equipmentName: 'Cup machine',
      equipmentModel: null,
      location: 'Cups · Line 1',
      plannedOn: '15.10.2026',
      estimatedMinutes: 30,
      requiresStop: true,
      operations: [
        { text: 'Lubricate the cam', photoRequired: false },
        { text: 'Check the chain', photoRequired: true },
      ],
      materials: [{ name: 'Grease', quantity: '0.2', unit: 'kg', mode: MaterialMode.EVERY_CYCLE }],
      source: null,
      hasDocument: true,
      description: null,
      reporterName: null,
      reportedAtLocal: null,
      ackDueLocal: null,
    },
    status: overrides.status ?? WorkStatus.ASSIGNED,
    type,
    assigneeId: 'mechanic',
    backupId: null,
    masterId: null,
    timezone: 'Europe/Kyiv',
    reminderDays: null,
    plannedOn: '2026-10-15',
    dueOn: '2026-10-15',
    acceptedAt: overrides.acceptedAt ?? null,
    ackDueAt: null,
  };
  return {
    notice,
    equipmentId: 'machine',
    sourceDocumentId: null,
    leadId: null,
    readiness: overrides.readiness ?? MaterialsReadiness.UNKNOWN,
    answers: overrides.answers ?? new Map(),
    waitingFor: null,
  };
}

function buttons(screen: ReturnType<typeof workCardScreen>): string[] {
  return (screen.keyboard?.inline_keyboard ?? [])
    .flat()
    .map((button) => ('callback_data' in button ? button.callback_data : ''));
}

const call = (action: MaintenanceCallbackAction, arg?: string) =>
  maintenanceCallback(action, ID, arg);

describe('mechanic screens (spec 014)', () => {
  it('an assigned maintenance offers start, readiness and the manual', () => {
    expect(buttons(workCardScreen(t, card({})))).toEqual(
      expect.arrayContaining([
        call(MaintenanceCallbackAction.START),
        call(MaintenanceCallbackAction.READY),
        call(MaintenanceCallbackAction.MISSING),
        call(MaintenanceCallbackAction.MANUAL),
      ]),
    );
    const answered = card({ readiness: MaterialsReadiness.READY });
    expect(buttons(workCardScreen(t, answered))).not.toContain(
      call(MaintenanceCallbackAction.READY),
    );
  });

  it('work in progress asks the next open operation, then offers submission', () => {
    const first = card({ status: WorkStatus.IN_PROGRESS });
    expect(buttons(workCardScreen(t, first))).toContain(
      call(MaintenanceCallbackAction.ANSWER, '1.d'),
    );
    const notDone = new Map([
      [1, OperationResult.NOT_DONE],
      [2, OperationResult.DONE],
    ]);
    expect(currentOperation(card({ status: WorkStatus.IN_PROGRESS, answers: notDone }))).toBe(1);
    const done = new Map([
      [1, OperationResult.DONE],
      [2, OperationResult.NOT_APPLICABLE],
    ]);
    const finished = workCardScreen(t, card({ status: WorkStatus.IN_PROGRESS, answers: done }));
    expect(buttons(finished)).toContain(call(MaintenanceCallbackAction.SUBMIT));
    expect(finished.text).toContain(t.maintenance.bot.allAnswered);
  });

  it('a repair must be accepted before it starts; in review nothing can change', () => {
    const repair = card({ type: WorkType.EMERGENCY_REPAIR });
    expect(buttons(workCardScreen(t, repair))).toEqual(
      expect.arrayContaining([
        call(MaintenanceCallbackAction.ACCEPT),
        call(MaintenanceCallbackAction.DECLINE),
      ]),
    );
    expect(buttons(workCardScreen(t, repair))).not.toContain(call(MaintenanceCallbackAction.START));
    const review = card({ status: WorkStatus.IN_REVIEW });
    expect(buttons(workCardScreen(t, review))).toEqual([
      call(MaintenanceCallbackAction.MANUAL),
      maintenanceCallback(MaintenanceCallbackAction.LIST),
    ]);
  });

  it('parses answer buttons and rejects anything else', () => {
    expect(parseAnswerArg('2.n')).toEqual({ ordinal: 2, result: OperationResult.NOT_DONE });
    expect(parseAnswerArg('0.d')).toBeNull();
    expect(parseAnswerArg('1.x')).toBeNull();
    expect(parseAnswerArg(null)).toBeNull();
  });

  it('offers the zone machines and "don\'t know" after the reason (FR-060)', () => {
    const screen = equipmentPickScreen(t, {
      machines: [
        { id: 'm1', code: 'M-01', name: 'Cup machine', model: 'NEWTOP-FB100S' },
        { id: 'm2', code: 'M-09', name: 'Sleeve machine', model: null },
      ],
      zone: 'Line 2',
      cancel: { text: t.incidents.cancel, data: 'inc:cancel' },
    });
    expect(screen.text).toBe('Which equipment? (zone “Line 2”)');
    expect(buttons(screen)).toEqual(['inc:eq:0', 'inc:eq:1', 'inc:eq:none', 'inc:cancel']);
    // The floor names a machine by its model; the name is the fallback.
    const labels = screen.keyboard?.inline_keyboard.flat().map((button) => button.text);
    expect(labels?.slice(0, 2)).toEqual(['M-01 NEWTOP-FB100S', 'M-09 Sleeve machine']);
  });

  it('a missing checklist toggles through its button data and names the checked materials', () => {
    expect(parseMissingArg(null)).toEqual({ step: MissingStep.OPEN, mask: 0 });
    expect(parseMissingArg('m1c')).toEqual({ step: MissingStep.TOGGLE, mask: 48 });
    expect(parseMissingArg('s')).toEqual({ step: MissingStep.SEND, mask: 0 });
    expect(parseMissingArg('x1')).toBeNull();
    expect(parseMissingArg(`m${(2 ** 30).toString(36)}`)).toBeNull();

    const screen = missingScreen(t, card({}), 1);
    expect(buttons(screen)).toEqual([
      call(MaintenanceCallbackAction.MISSING, 'm0'),
      call(MaintenanceCallbackAction.MISSING, 's1'),
      call(MaintenanceCallbackAction.MISSING, 'w1'),
      call(MaintenanceCallbackAction.OPEN),
    ]);
    expect(screen.keyboard?.inline_keyboard[0]?.[0]?.text).toBe('☑️ Grease — 0.2 kg');
    expect(missingNote(card({}), 1, 'rags')).toBe('Grease 0.2 kg; rags');
    expect(missingNote(card({}), 0, 'rags')).toBe('rags');
  });

  it('asks which materials were used before a planned maintenance is submitted', () => {
    const screen = materialsUsedScreen(t, card({ status: WorkStatus.IN_PROGRESS }));
    expect(screen.text).toContain(t.maintenance.bot.usedTitle);
    expect(screen.text).toContain('Grease');
    expect(buttons(screen)).toEqual([
      call(MaintenanceCallbackAction.SUBMIT, 'p'),
      call(MaintenanceCallbackAction.SUBMIT, 'w'),
      call(MaintenanceCallbackAction.OPEN),
    ]);
  });
});
