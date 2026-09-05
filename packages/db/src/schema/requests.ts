import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { RequestStatus, RequestType, ShiftState } from '@vakhta/domain';
import { employees } from './identity.js';
import { scheduleVersions, shiftAssignments } from './scheduling.js';
import { shiftSessions } from './shift.js';

const REQUEST_TYPE_VALUES = [
  'VACATION',
  'SICK',
  'DAY_OFF',
  'SWAP',
  'EXTRA_SHIFT',
  'CANNOT_ATTEND',
  'LATE',
  'EARLY_LEAVE',
  'TECH_ISSUE',
  'CORRECTION',
  'APPEAL',
] as const satisfies readonly RequestType[];
const REQUEST_STATUS_VALUES = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const satisfies readonly RequestStatus[];

export const requestType = pgEnum('request_type', REQUEST_TYPE_VALUES);
export const requestStatus = pgEnum('request_status', REQUEST_STATUS_VALUES);
export const decisionValue = pgEnum('decision_value', ['APPROVED', 'REJECTED']);
export const overtimeStatus = pgEnum('overtime_status', ['PENDING', 'APPROVED', 'REJECTED']);

/** Пропозиція корекції у payload зберігається з ISO-часом; домен працює з epoch. */
export type StoredCorrectionProposal =
  | { readonly kind: 'MOVE_BOUNDARY'; readonly intervalId: string; readonly newStartedAt: string }
  | { readonly kind: 'RECLASSIFY'; readonly intervalId: string; readonly newState: ShiftState }
  | { readonly kind: 'CLOSE_SHIFT_AT'; readonly endedAt: string };

/** Дані звернення за типом: період, зміна, хвилини, пропозиція корекції тощо. */
export interface RequestPayload {
  readonly minutes?: number;
  readonly counterpartAssignmentId?: string | null;
  readonly templateId?: string;
  readonly zoneId?: string | null;
  readonly proposal?: StoredCorrectionProposal;
  readonly reasonCode?: string;
  readonly scoreId?: string | null;
  readonly approvedMinutes?: number;
  readonly text?: string;
}

/** Звернення працівника (ТЗ 8, FR-REQ-01..04) з маршрутом за матрицею ТЗ 2.1. */
export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: requestType('type').notNull(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    status: requestStatus('status').notNull().default('SUBMITTED'),
    currentStep: integer('current_step').notNull().default(0),
    periodFrom: date('period_from'),
    periodTo: date('period_to'),
    assignmentId: uuid('assignment_id').references(() => shiftAssignments.id),
    counterpartEmployeeId: uuid('counterpart_employee_id').references(() => employees.id),
    shiftSessionId: uuid('shift_session_id').references(() => shiftSessions.id),
    payload: jsonb('payload').$type<RequestPayload>().notNull().default({}),
    comment: text('comment'),
    /** Медичний документ: лише HR (FR-REQ-02). */
    medicalMediaId: uuid('medical_media_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    stepDeadlineAt: timestamp('step_deadline_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Версія графіка, створена схваленням (FR-REQ-04). */
    resultVersionId: uuid('result_version_id').references(() => scheduleVersions.id),
    /** Компенсуюча подія схваленої корекції (FR-COR-03). */
    compensatingEventId: uuid('compensating_event_id'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('requests_employee_idx').on(t.employeeId, t.submittedAt),
    index('requests_status_type_idx').on(t.status, t.type),
    index('requests_counterpart_idx').on(t.counterpartEmployeeId),
  ],
);

/** Кожне рішення з коментарем, автором і кроком (FR-REQ-03, AC-16). */
export const requestDecisions = pgTable(
  'request_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    step: integer('step').notNull(),
    stepKey: text('step_key').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    actingRole: text('acting_role'),
    decision: decisionValue('decision').notNull(),
    comment: text('comment').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('request_decisions_request_idx').on(t.requestId, t.at)],
);

/** Потенційна переробка стає підтвердженою лише рішенням керівника (FR-TIME-06, AC-14). */
export const overtimeApprovals = pgTable(
  'overtime_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shiftSessionId: uuid('shift_session_id')
      .notNull()
      .references(() => shiftSessions.id),
    minutes: integer('minutes').notNull(),
    status: overtimeStatus('status').notNull().default('PENDING'),
    reason: text('reason'),
    decidedBy: text('decided_by'),
    comment: text('comment'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('overtime_approvals_session_idx').on(t.shiftSessionId)],
);
