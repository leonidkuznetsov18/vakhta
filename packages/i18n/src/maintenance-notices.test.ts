import { describe, expect, it } from 'vitest';
import { MaterialMode, WorkPriority, WorkType, type MaintenanceNoticeData } from '@vakhta/domain';
import { messages } from './index.js';
import {
  EmergencyNoticeKind,
  MaintenanceNoticeKind,
  emergencyNotice,
  maintenanceNotice,
} from './maintenance-notices.js';

const DATA: MaintenanceNoticeData = {
  workOrderId: '0b4a0c1e-5d1f-4d8e-9a55-3c0e3b1d2f10',
  number: 1043,
  type: WorkType.PLANNED_MAINTENANCE,
  priority: WorkPriority.P1,
  title: 'Щомісячне ТО',
  equipmentCode: 'M-02',
  equipmentName: 'Сервоприводна машина для стаканів',
  equipmentModel: 'NEWTOP-FB158SV1',
  location: 'Цех стаканів · Лінія 2',
  plannedOn: '30.09.2026',
  estimatedMinutes: 90,
  requiresStop: true,
  operations: [{ text: 'Клеми в шафі', photoRequired: true }],
  materials: [{ name: 'Мастило', quantity: '0.2', unit: 'л', mode: MaterialMode.EVERY_CYCLE }],
  source: null,
  hasDocument: true,
  description: 'Не формується дно',
  reporterName: 'Мельник О.',
  reportedAtLocal: '10:41',
  ackDueLocal: '10:46',
};

describe('maintenance notices (prototype 08)', () => {
  it('names the machine by its model and counts reminder days in words', () => {
    const uk = messages('uk');
    const lines = maintenanceNotice(uk, DATA, {
      kind: MaintenanceNoticeKind.REMINDER,
      offsetDays: 7,
    }).text.split('\n');
    expect(lines.slice(0, 3)).toEqual([
      '🔧 ТО через 7 днів',
      'M-02 NEWTOP-FB158SV1',
      'Цех стаканів · Лінія 2',
    ]);
    const three = maintenanceNotice(uk, DATA, {
      kind: MaintenanceNoticeKind.REMINDER,
      offsetDays: 3,
    });
    expect(three.text.split('\n')[0]).toBe('🔧 ТО через 3 дні');
    const ru = maintenanceNotice(messages('ru'), DATA, {
      kind: MaintenanceNoticeKind.REMINDER,
      offsetDays: 5,
    });
    expect(ru.text.split('\n')[0]).toBe('🔧 ТО через 5 дней');
  });

  it('falls back to the machine name without a model', () => {
    const notice = maintenanceNotice(
      messages('en'),
      { ...DATA, equipmentModel: null },
      { kind: MaintenanceNoticeKind.ASSIGNED },
    );
    expect(notice.text.split('\n')[1]).toBe('M-02 Сервоприводна машина для стаканів');
  });

  it('heads an emergency with the priority code and asks to accept by the deadline', () => {
    const repair = { ...DATA, type: WorkType.EMERGENCY_REPAIR };
    const notice = emergencyNotice(messages('uk'), repair, EmergencyNoticeKind.ASSIGNED);
    const lines = notice.text.split('\n');
    expect(lines[0]).toBe('🚨 Аварійний ремонт №1043 · P1');
    expect(lines[1]).toBe('M-02 NEWTOP-FB158SV1 зупинено');
    expect(lines.at(-1)).toBe('⏱ Прийміть до 10:46');
  });
});
