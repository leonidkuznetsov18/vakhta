import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { EquipmentDetail, PlanDetail } from '@vakhta/contracts';
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
import { PlanEditor } from './plan-editor';

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
  plans: [],
  materials: [],
  openStop: null,
  history: [],
};

const PLAN: PlanDetail = {
  id: '55555555-5555-4555-8555-555555555555',
  equipmentId: MACHINE.id,
  state: PlanState.ACTIVE,
  stateReason: null,
  activeRevision: 1,
  draft: null,
  version: 1,
  active: {
    title: 'Щотижневе ТО',
    intervalUnit: IntervalUnit.WEEK,
    intervalCount: 1,
    anchorMode: AnchorMode.FROM_COMPLETION,
    firstDueOn: '2026-09-26',
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('opens one sheet and keeps it while the plan loads instead of mounting a second one', async () => {
  let deliver: (plan: PlanDetail) => void = () => undefined;
  vi.spyOn(maintenanceApi, 'plan').mockReturnValue(
    new Promise<PlanDetail>((resolve) => {
      deliver = resolve;
    }),
  );
  vi.spyOn(maintenanceApi, 'equipmentDetail').mockResolvedValue(MACHINE);
  vi.spyOn(maintenanceApi, 'mechanics').mockResolvedValue([]);
  vi.spyOn(maintenanceApi, 'policy').mockResolvedValue({
    reminderOffsets: [7, 3, 1],
    reminderTime: '09:00',
  });
  render(
    <PlanEditor equipmentId={MACHINE.id} planId={PLAN.id} canManage onClose={() => undefined} />,
  );
  const loading = await screen.findByRole('dialog');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);

  await act(async () => {
    deliver(PLAN);
  });
  await waitFor(() => expect(screen.getByDisplayValue('Щотижневе ТО')).toBeTruthy());
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('dialog')).toBe(loading);
});
