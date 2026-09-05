import { describe, expect, it } from 'vitest';
import type { ShiftScreenView } from '@vakhta/contracts';
import { reasonPickerScreen, shiftScreen } from './screens.js';

function view(over: Partial<ShiftScreenView> = {}): ShiftScreenView {
  return {
    session: {
      id: 'a0000000-0000-4000-8000-000000000001',
      employeeId: 'b0000000-0000-4000-8000-000000000001',
      assignmentId: null,
      businessDate: '2026-09-07',
      state: 'WORKING',
      resumeState: null,
      version: 3,
      startedAt: '2026-09-07T05:00:00.000Z',
      endedAt: null,
      stateSince: '2026-09-07T05:10:00.000Z',
      planStartAt: '2026-09-07T05:00:00.000Z',
      planEndAt: '2026-09-07T17:00:00.000Z',
      zoneId: null,
      zoneName: 'Линия 1',
      zoneAccepted: true,
      needsClarification: false,
      clarificationReason: null,
    },
    presenceOpen: true,
    allowedActions: [
      'START_BREAK',
      'START_MEAL',
      'START_SERVICE_TIME',
      'START_DOWNTIME',
      'START_CLEANING',
      'EMERGENCY_EXIT',
    ],
    canAcceptZone: false,
    offerResumeIntoDowntime: false,
    downtimeReasons: [{ code: 'BREAKDOWN', label: 'Поломка' }],
    emergencyReasons: [{ code: 'HEALTH', label: 'Самочувствие' }],
    summary: null,
    timezone: 'Europe/Kyiv',
    serverTime: '2026-09-07T06:00:00.000Z',
    ...over,
  };
}

function buttons(screen: ReturnType<typeof shiftScreen>): string[][] {
  return (screen.keyboard?.inline_keyboard ?? []).map((row) =>
    row.map((b) => ('callback_data' in b ? b.callback_data : '')),
  );
}

describe('екран зміни в боті (ТЗ 4.4, FR-UI-01)', () => {
  it('показує стан із часом за поясом майданчика, план і зону; кнопки лише для дозволених дій', () => {
    const screen = shiftScreen(view(), 'Здравствуйте');
    expect(screen.text).toContain('Основная работа с 08:10');
    expect(screen.text).toContain('08:00–20:00');
    expect(screen.text).toContain('Линия 1');
    const data = buttons(screen).flat();
    expect(data).toContain('sh:START_BREAK:3');
    expect(data).toContain('sh:pick:DOWNTIME:3');
    expect(data).toContain('sh:pick:EMERGENCY:3');
    expect(data).not.toContain('sh:RESUME:3');
    expect(data.every((d) => Buffer.byteLength(d) <= 64)).toBe(true);
  });

  it('у тимчасовому стані одна кнопка «Вернуться»; з простою пропонує два варіанти (FR-DWN-06)', () => {
    const plain = shiftScreen(
      view({
        session: { ...view().session!, state: 'BREAK', resumeState: 'WORKING' },
        allowedActions: ['RESUME', 'EMERGENCY_EXIT'],
      }),
      'x',
    );
    expect(buttons(plain).flat()).toContain('sh:RESUME:3');
    expect(plain.text).toContain('После возврата: Основная работа');

    const fromDowntime = shiftScreen(
      view({
        session: { ...view().session!, state: 'MEAL', resumeState: 'WORKING' },
        allowedActions: ['RESUME', 'EMERGENCY_EXIT'],
        offerResumeIntoDowntime: true,
      }),
      'x',
    );
    const data = buttons(fromDowntime).flat();
    expect(data).toContain('sh:RESUME:3');
    expect(data).toContain('sh:RESUME:3:DT');
    expect(fromDowntime.text).toContain('Работа возобновлена?');
  });

  it('до приймання зони показує кнопку «Принять зону» і підказку', () => {
    const screen = shiftScreen(
      view({
        session: { ...view().session!, state: 'PREPARATION', zoneId: 'z', zoneAccepted: false },
        allowedActions: ['EMERGENCY_EXIT'],
        canAcceptZone: true,
      }),
      'x',
    );
    expect(buttons(screen)[0]).toEqual(['sh:zone:3']);
    expect(screen.text).toContain('Зона ещё не принята');
  });

  it('після закриття показує підсумок без кнопок дій', () => {
    const screen = shiftScreen(
      view({
        session: { ...view().session!, state: 'SHIFT_CLOSED', endedAt: '2026-09-07T17:05:00.000Z' },
        allowedActions: [],
        summary: {
          totalMinutes: 725,
          workMinutes: 640,
          preparationMinutes: 10,
          serviceMinutes: 0,
          breakMinutes: 30,
          mealMinutes: 30,
          downtimeMinutes: 15,
          plannedMinutes: 720,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeMinutes: 5,
          overtimePending: false,
        },
      }),
      'x',
    );
    expect(screen.text).toContain('Смена закрыта.');
    expect(screen.text).toContain('Итого 725 мин: работа 650, перерывы 30, обед 30, простой 15.');
    expect(screen.text).toContain('Сверх плана: 5 мин.');
    expect(screen.keyboard).toBeUndefined();
  });

  it('вибір причини: кнопка на кожен код і повернення назад', () => {
    const picker = reasonPickerScreen(view(), 'DOWNTIME');
    expect(buttons(picker as ReturnType<typeof shiftScreen>)).toEqual([
      ['sh:START_DOWNTIME:3:BREAKDOWN'],
      ['sh:back'],
    ]);
    expect(picker.text).toBe('Укажите причину простоя:');
    expect(reasonPickerScreen(view({ emergencyReasons: [] }), 'EMERGENCY').text).toContain(
      'Справочник причин пуст',
    );
  });
});
