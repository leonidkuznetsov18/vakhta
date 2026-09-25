import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { EquipmentDetail, PlanDetail, PlanRow } from '@vakhta/contracts';
import {
  AnchorMode,
  EquipmentCriticality,
  EquipmentState,
  IntervalUnit,
  PlanSourceKind,
  PlanState,
} from '@vakhta/domain';
import { maintenanceApi } from '@/entities/maintenance';
import { render } from '@/test-utils';
import { MaintenanceTab } from '../model/tabs';
import { MaintenancePage } from './maintenance-page';

const PLAN_ROW: PlanRow = {
  id: '55555555-5555-4555-8555-555555555555',
  title: 'Щотижневе ТО',
  state: PlanState.ACTIVE,
  intervalUnit: IntervalUnit.WEEK,
  intervalCount: 1,
  anchorMode: AnchorMode.FROM_COMPLETION,
  lastPerformedOn: null,
  nextDueOn: '2026-09-28',
  readiness: null,
  sourceLabel: 'Каталог виробника',
  hasDraft: false,
};

const MACHINE: EquipmentDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'M-01',
  name: 'Лінія фасування 1',
  equipmentType: null,
  model: 'TC-100',
  siteId: '22222222-2222-4222-8222-222222222222',
  orgUnitId: '33333333-3333-4333-8333-333333333333',
  unitName: 'Цех фасовки',
  zoneId: null,
  zoneName: null,
  state: EquipmentState.AVAILABLE,
  stateChangedAt: '2026-09-01T00:00:00.000Z',
  restriction: null,
  criticality: EquipmentCriticality.HIGH,
  responsible: { id: '44444444-4444-4444-8444-444444444444', fullName: 'Механік Тестовий' },
  backup: null,
  nextMaintenance: null,
  activeEmergency: null,
  archivedAt: null,
  version: 1,
  manufacturer: null,
  serialNumber: null,
  manufacturedYear: null,
  commissionedOn: null,
  notes: null,
  documents: [],
  plans: [PLAN_ROW],
  materials: [],
  openStop: null,
  history: [],
};

const PLAN: PlanDetail = {
  id: PLAN_ROW.id,
  equipmentId: MACHINE.id,
  state: PlanState.ACTIVE,
  stateReason: null,
  activeRevision: 1,
  draft: null,
  version: 1,
  active: {
    title: PLAN_ROW.title,
    intervalUnit: IntervalUnit.WEEK,
    intervalCount: 1,
    anchorMode: AnchorMode.FROM_COMPLETION,
    firstDueOn: '2026-09-28',
    sourceKind: PlanSourceKind.PLANT_DECISION,
    sourceDocumentId: null,
    estimatedMinutes: 45,
    requiresStop: true,
    assigneeEmployeeId: MACHINE.responsible.id,
    reminderDays: null,
    operations: [{ text: 'Змастити напрямні', photoRequired: false }],
    materials: [],
  },
};

beforeEach(() => {
  // The register, calendar and queue behind the card are not under test: they stay loading.
  for (const key of Object.keys(maintenanceApi) as (keyof typeof maintenanceApi)[])
    vi.spyOn(maintenanceApi, key).mockReturnValue(new Promise<never>(() => undefined));
  vi.spyOn(maintenanceApi, 'equipmentDetail').mockResolvedValue(MACHINE);
  vi.spyOn(maintenanceApi, 'plan').mockResolvedValue(PLAN);
  vi.spyOn(maintenanceApi, 'mechanics').mockResolvedValue([]);
  vi.spyOn(maintenanceApi, 'policy').mockResolvedValue({
    reminderOffsets: [7, 3, 1],
    reminderTime: '09:00',
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openCard(): Promise<HTMLElement> {
  render(
    <MaintenancePage tab={MaintenanceTab.EQUIPMENT} id={MACHINE.id} onNavigate={() => undefined} />,
  );
  const title = await screen.findByText('M-01 · TC-100');
  const card = title.closest<HTMLElement>('[role="dialog"]');
  if (!card) throw new Error('The machine card is not a dialog');
  return card;
}

it('opens a plan over the machine card without unmounting the card', async () => {
  const card = await openCard();

  fireEvent.click(screen.getByText(PLAN_ROW.title));
  await screen.findByDisplayValue(PLAN.active?.title ?? '');

  // Replacing the card's sheet re-ran its enter animation: the page flashed between the two.
  expect(card.isConnected).toBe(true);
  expect(screen.getAllByRole('dialog')).toHaveLength(2);
});
