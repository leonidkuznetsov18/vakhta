import type { DomainEventView } from '@vakhta/contracts';

/** Long evidence exercises nested-table intrinsic sizing in the real Audit renderer. */
export const tableLayoutEvent = {
  id: 'd0000000-0000-4000-8000-000000000001',
  type: 'SHIFT_STARTED',
  occurredAt: '2026-09-10T12:00:00.000Z',
  receivedAt: '2026-09-10T12:00:00.000Z',
  source: 'PREVIEW',
  actorId: null,
  actingRole: null,
  employeeId: null,
  employeeName: 'QA employee',
  shiftSessionId: null,
  reasonCode: null,
  comment: null,
  correctsEventId: null,
  payload: {
    note: 'Long recorded evidence must remain readable without resizing the parent columns. '.repeat(
      20,
    ),
    reference: 'unbroken-reference-'.repeat(30),
  },
} satisfies DomainEventView;
