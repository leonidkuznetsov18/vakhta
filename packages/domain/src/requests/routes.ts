/**
 * Звернення працівника (ТЗ 8.1, FR-REQ-01..04) і маршрути погодження за матрицею ТЗ 2.1.
 * Маршрут — послідовність кроків; кожен крок вирішує роль панелі або другий працівник.
 */
export const REQUEST_TYPES = [
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
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Хто вирішує крок: роль панелі або другий працівник (обмін змінами). */
export type StepDecider =
  { readonly kind: 'ROLE'; readonly roles: readonly string[] } | { readonly kind: 'COUNTERPART' };

export interface RouteStep {
  readonly key: string;
  readonly decider: StepDecider;
  /** Строк рішення кроку в годинах (FR-REQ-01). */
  readonly slaHours: number;
}

const MASTER = ['SHIFT_MASTER', 'PRODUCTION_HEAD', 'ADMIN'] as const;
const HEAD = ['PRODUCTION_HEAD', 'ADMIN'] as const;
const HR = ['HR', 'ADMIN'] as const;
const ADMIN = ['ADMIN'] as const;

const ROUTES: Readonly<Record<RequestType, readonly RouteStep[]>> = {
  VACATION: [
    { key: 'HEAD', decider: { kind: 'ROLE', roles: HEAD }, slaHours: 72 },
    { key: 'HR', decider: { kind: 'ROLE', roles: HR }, slaHours: 72 },
  ],
  DAY_OFF: [
    { key: 'HEAD', decider: { kind: 'ROLE', roles: HEAD }, slaHours: 48 },
    { key: 'HR', decider: { kind: 'ROLE', roles: HR }, slaHours: 48 },
  ],
  SICK: [{ key: 'HR', decider: { kind: 'ROLE', roles: HR }, slaHours: 72 }],
  SWAP: [
    { key: 'COUNTERPART', decider: { kind: 'COUNTERPART' }, slaHours: 24 },
    { key: 'MASTER', decider: { kind: 'ROLE', roles: MASTER }, slaHours: 24 },
    { key: 'HEAD', decider: { kind: 'ROLE', roles: HEAD }, slaHours: 24 },
  ],
  EXTRA_SHIFT: [{ key: 'HEAD', decider: { kind: 'ROLE', roles: HEAD }, slaHours: 24 }],
  CANNOT_ATTEND: [{ key: 'MASTER', decider: { kind: 'ROLE', roles: MASTER }, slaHours: 4 }],
  LATE: [{ key: 'MASTER', decider: { kind: 'ROLE', roles: MASTER }, slaHours: 4 }],
  EARLY_LEAVE: [{ key: 'MASTER', decider: { kind: 'ROLE', roles: MASTER }, slaHours: 4 }],
  TECH_ISSUE: [{ key: 'ADMIN', decider: { kind: 'ROLE', roles: ADMIN }, slaHours: 24 }],
  CORRECTION: [{ key: 'MASTER', decider: { kind: 'ROLE', roles: MASTER }, slaHours: 24 }],
  /** Апеляцію розглядає керівник, що не є автором рішення (ТЗ 7.7). */
  APPEAL: [{ key: 'HEAD', decider: { kind: 'ROLE', roles: HEAD }, slaHours: 72 }],
};

export function routeFor(type: RequestType): readonly RouteStep[] {
  return ROUTES[type];
}

/** Типи, які змінюють графік: схвалення створює нову версію призначень (FR-REQ-04). */
export const SCHEDULE_AFFECTING: readonly RequestType[] = [
  'VACATION',
  'DAY_OFF',
  'SICK',
  'SWAP',
  'EXTRA_SHIFT',
  'CANNOT_ATTEND',
];

/** Типи з періодом дат; решта стосуються конкретної зміни або події. */
export const PERIOD_TYPES: readonly RequestType[] = ['VACATION', 'DAY_OFF', 'SICK'];

/** Медичні документи бачить лише HR (FR-REQ-02). */
export function medicalOnly(type: RequestType): boolean {
  return type === 'SICK';
}

const OPEN: readonly RequestStatus[] = ['SUBMITTED', 'IN_REVIEW'];

export function isRequestOpen(status: RequestStatus): boolean {
  return OPEN.includes(status);
}

export interface RouteProgress {
  readonly currentStep: number;
  readonly status: RequestStatus;
}

/**
 * Рішення на кроці: відмова закриває звернення; схвалення переводить на наступний крок,
 * а після останнього — у APPROVED. Кроки не можна пропускати.
 */
export function applyDecision(
  type: RequestType,
  progress: RouteProgress,
  decision: 'APPROVED' | 'REJECTED',
): RouteProgress {
  const steps = routeFor(type);
  if (!isRequestOpen(progress.status))
    throw new RangeError(`Звернення вже закрите: ${progress.status}`);
  if (decision === 'REJECTED') return { currentStep: progress.currentStep, status: 'REJECTED' };
  const next = progress.currentStep + 1;
  if (next >= steps.length) return { currentStep: progress.currentStep, status: 'APPROVED' };
  return { currentStep: next, status: 'IN_REVIEW' };
}

/** Чи може актор вирішувати поточний крок. */
export function canDecideStep(
  step: RouteStep,
  actor: { readonly roles: readonly string[]; readonly employeeId?: string | null },
  counterpartEmployeeId: string | null,
): boolean {
  if (step.decider.kind === 'COUNTERPART') {
    return (
      actor.employeeId !== undefined &&
      actor.employeeId !== null &&
      actor.employeeId === counterpartEmployeeId
    );
  }
  return step.decider.roles.some((r) => actor.roles.includes(r));
}

export function stepDeadline(step: RouteStep, from: Date): Date {
  return new Date(from.getTime() + step.slaHours * 3_600_000);
}
