import { describe, expect, it } from 'vitest';
import type { ShiftScreenView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { reasonPickerScreen, shiftScreen } from './screens.js';

const t = messages('ru');

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
    pendingHandovers: 0,
    checklistAvailable: true,
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

describe('shift screen in the bot (spec 4.4, FR-UI-01)', () => {
  it('shows the state in site time, the plan and the zone; buttons only for allowed actions', () => {
    const screen = shiftScreen(t, view(), 'Здравствуйте');
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

  it('a temporary state has a single Return button; from downtime it offers two options (FR-DWN-06)', () => {
    const plain = shiftScreen(
      t,
      view({
        session: { ...view().session!, state: 'BREAK', resumeState: 'WORKING' },
        allowedActions: ['RESUME', 'EMERGENCY_EXIT'],
      }),
      'x',
    );
    expect(buttons(plain).flat()).toContain('sh:RESUME:3');
    expect(plain.text).toContain('После возврата: Основная работа');

    const fromDowntime = shiftScreen(
      t,
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

  it('before zone acceptance shows the Accept zone button and a hint', () => {
    const screen = shiftScreen(
      t,
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

  it('after closing shows the summary without shift action buttons', () => {
    const screen = shiftScreen(
      t,
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
    // after closing: My plan, Requests and a correction request; no shift actions
    expect(buttons(screen)).toEqual([
      ['plan:cur', 'rq:menu'],
      ['rq:corr:a0000000-0000-4000-8000-000000000001', 'bn:me'],
    ]);
  });

  it('reason picker: a button per code and a way back', () => {
    const picker = reasonPickerScreen(t, view(), 'DOWNTIME');
    expect(buttons(picker as ReturnType<typeof shiftScreen>)).toEqual([
      ['sh:START_DOWNTIME:3:BREAKDOWN'],
      ['sh:back'],
    ]);
    expect(picker.text).toBe('Укажите причину простоя:');
    expect(reasonPickerScreen(t, view({ emergencyReasons: [] }), 'EMERGENCY').text).toContain(
      'Справочник причин пуст',
    );
  });
});

describe('problem report in the bot (spec 5.5)', () => {
  it('the shift screen has Report a problem with the version; not after closing', async () => {
    const { shiftScreen: build } = await import('./screens.js');
    const active = build(t, view(), 'x');
    expect(buttons(active).flat()).toContain('inc:new:3');
    const closed = build(
      t,
      view({ session: { ...view().session!, state: 'SHIFT_CLOSED' }, allowedActions: [] }),
      'x',
    );
    expect(buttons(closed).flat()).not.toContain('inc:new:3');
  });

  it('step screens: reasons, comment, photo, Is work stopped?, result', async () => {
    const s = await import('./screens.js');
    const reasons = s.incidentReasonScreen(t, [{ code: 'BREAKDOWN', label: 'Поломка' }]);
    expect(buttons(reasons as ReturnType<typeof shiftScreen>)).toEqual([
      ['inc:r:BREAKDOWN'],
      ['inc:cancel'],
    ]);
    expect(buttons(s.incidentPhotoScreen(t) as ReturnType<typeof shiftScreen>).flat()).toEqual([
      'inc:skip',
      'inc:cancel',
    ]);
    const stopped = s.incidentStoppedScreen(t, 'Поломка');
    expect(buttons(stopped as ReturnType<typeof shiftScreen>).flat()).toEqual([
      'inc:stop:1',
      'inc:stop:0',
      'inc:cancel',
    ]);
    expect(stopped.text).toContain('Работа остановлена?');
    const result = s.incidentResultScreen(
      t,
      {
        incidentId: 'a0000000-0000-4000-8000-000000000001',
        linkedToExisting: false,
        severity: 'SAFETY',
        downtimeStarted: true,
        downtimeError: null,
        serverTime: 'x',
      },
      'Безопасность',
    );
    expect(result.text).toContain('Проблема «Безопасность» зарегистрирована.');
    expect(result.text).toContain('эскалация отправлена немедленно');
    expect(result.text).toContain('Открыт личный простой');
    const linked = s.incidentResultScreen(
      t,
      {
        incidentId: 'a0000000-0000-4000-8000-000000000001',
        linkedToExisting: true,
        severity: 'NORMAL',
        downtimeStarted: false,
        downtimeError: 'TEMPORARY_STATE_OPEN',
        serverTime: 'x',
      },
      'Поломка',
    );
    expect(linked.text).toContain('уже зарегистрирована');
    expect(linked.text).toContain('Сначала нажмите «Вернуться».');
  });
});

describe('language of the bot screens', () => {
  it('renders the same shift screen in every catalog language', async () => {
    const { shiftScreen: build } = await import('./screens.js');
    expect(build(messages('en'), view(), 'x').text).toContain('State: Main work since 08:10.');
    expect(build(messages('uk'), view(), 'x').text).toContain('Стан: Основна робота з 08:10.');
    expect(build(messages('ru'), view(), 'x').text).toContain(
      'Состояние: Основная работа с 08:10.',
    );
  });

  it('language picker lists the three locales, marks the current one and leads back', async () => {
    const { languageScreen } = await import('./screens.js');
    const screen = languageScreen(messages('uk'), 'uk');
    expect(buttons(screen as ReturnType<typeof shiftScreen>)).toEqual([
      ['lang:uk'],
      ['lang:en'],
      ['lang:ru'],
      ['sh:back'],
    ]);
    const labels = (screen.keyboard?.inline_keyboard ?? []).flat().map((b) => b.text);
    expect(labels[0]).toBe('✅ Українська');
    expect(labels[1]).toBe('English');
    expect(screen.text).toBe('Оберіть мову інтерфейсу:');
  });

  it('home screen offers the language button', async () => {
    const { homeScreen } = await import('./screens.js');
    const screen = homeScreen(messages('en'), {
      employee: {
        id: 'b0000000-0000-4000-8000-000000000001',
        personnelNumber: '0001',
        fullName: 'Ivan Petrenko',
        status: 'ACTIVE',
        locale: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      next: null,
      unacknowledged: 0,
      presenceSince: null,
      timezone: 'Europe/Kyiv',
      pendingSwaps: 0,
    });
    expect(buttons(screen as ReturnType<typeof shiftScreen>).flat()).toContain('lang:menu');
    expect(screen.text).toContain('There are no upcoming shifts');
  });
});
