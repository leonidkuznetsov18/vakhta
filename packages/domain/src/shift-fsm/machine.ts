import { SHIFT_ACTIONS, type ShiftAction } from './actions.js';
import {
  ACTIVE_STATES,
  RESUMABLE_STATES,
  TEMPORARY_STATES,
  isResumable,
  isTemporary,
  isTerminal,
  type ResumableState,
  type ShiftState,
} from './states.js';

/** Мінімальний знімок стану shift_session, потрібний машині. */
export interface ShiftSnapshot {
  readonly state: ShiftState;
  /** Куди повертатись після тимчасового стану. Не null тоді й лише тоді, коли state тимчасовий. */
  readonly resumeState: ResumableState | null;
}

export const INITIAL_SNAPSHOT: ShiftSnapshot = Object.freeze({
  state: 'NOT_STARTED',
  resumeState: null,
});

/** Факти, які застосунок збирає перед переходом. Машина їх не перевіряє в I/O, лише читає. */
export interface TransitionContext {
  /** Присутність підтверджена QR або резервним способом (FR-TIME-02). */
  readonly presenceConfirmed?: boolean;
  /** Майстер оформив резервне рішення або дозволений виняток. */
  readonly masterOverride?: boolean;
  /** Контрольну зону прийнято або є дозволений виняток (ТЗ 4.4: PREPARATION → WORKING). */
  readonly zoneAccepted?: boolean;
  /** Звіт передачі заповнений або оформлено виняток (FR-TIME-04). */
  readonly handoverComplete?: boolean;
  /** Код причини; обов'язковий для простою (FR-DWN-01) і екстреного виходу. */
  readonly reasonCode?: string;
  /** Після обіду або перерви перешкода триває: повернутись у DOWNTIME (FR-DWN-06). */
  readonly resumeIntoDowntime?: boolean;
}

/** Що застосунок має зробити в тій самій транзакції окрім закриття та відкриття інтервалу. */
export type TransitionEffect =
  | 'SCHEDULE_RETURN_REMINDER'
  | 'CANCEL_RETURN_REMINDER'
  | 'REQUIRE_DOWNTIME_REPORT'
  | 'SCHEDULE_DOWNTIME_ESCALATION'
  | 'OPEN_HANDOVER_DRAFT'
  | 'MARK_HANDOVER_SUBMITTED'
  | 'SUPERSEDE_HANDOVER'
  | 'FINALIZE_SHIFT'
  | 'NOTIFY_MASTER'
  | 'FLAG_FOR_REVIEW';

export type TransitionErrorCode =
  | 'SHIFT_NOT_STARTED'
  | 'ALREADY_STARTED'
  | 'SHIFT_NOT_ACTIVE'
  | 'ACTION_NOT_ALLOWED'
  | 'TEMPORARY_STATE_OPEN'
  | 'PRESENCE_REQUIRED'
  | 'ZONE_NOT_ACCEPTED'
  | 'HANDOVER_INCOMPLETE'
  | 'REASON_REQUIRED'
  | 'RESUME_STATE_MISSING';

export type TransitionResult =
  | {
      readonly ok: true;
      readonly action: ShiftAction;
      readonly from: ShiftSnapshot;
      readonly next: ShiftSnapshot;
      readonly effects: readonly TransitionEffect[];
    }
  | {
      readonly ok: false;
      readonly action: ShiftAction;
      readonly from: ShiftSnapshot;
      readonly error: TransitionErrorCode;
    };

type Guard = (ctx: TransitionContext) => TransitionErrorCode | null;

/**
 * Як змінюється resumeState:
 * - remember: запам'ятати поточний стан, якщо він resumable; інакше лишити наявний
 *   (DOWNTIME → MEAL зберігає WORKING, FR-DWN-06);
 * - keep: не чіпати;
 * - clear: обнулити.
 */
type ResumePolicy = 'remember' | 'keep' | 'clear';

interface Rule {
  readonly action: ShiftAction;
  readonly from: readonly ShiftState[];
  readonly to: ShiftState | 'RESUME_STATE';
  readonly guard?: Guard;
  readonly effects?: readonly TransitionEffect[];
  readonly resume: ResumePolicy;
}

const requirePresence: Guard = (ctx) =>
  ctx.presenceConfirmed === true || ctx.masterOverride === true ? null : 'PRESENCE_REQUIRED';

const requireZone: Guard = (ctx) =>
  ctx.zoneAccepted === true || ctx.masterOverride === true ? null : 'ZONE_NOT_ACCEPTED';

const requireHandover: Guard = (ctx) =>
  ctx.handoverComplete === true || ctx.masterOverride === true ? null : 'HANDOVER_INCOMPLETE';

const requireReason: Guard = (ctx) =>
  typeof ctx.reasonCode === 'string' && ctx.reasonCode.trim().length > 0 ? null : 'REASON_REQUIRED';

/** Перерву, обід і службовий час можна відкрити з робочого стану або з простою (FR-DWN-06). */
const TEMPORARY_ENTRY_FROM: readonly ShiftState[] = [...RESUMABLE_STATES, 'DOWNTIME'];

/** Таблиця переходів ТЗ 4.4. Порядок важливий лише для читання; пари (action, from) не перетинаються. */
export const TRANSITION_RULES: readonly Rule[] = [
  {
    action: 'START_SHIFT',
    from: ['NOT_STARTED'],
    to: 'PREPARATION',
    guard: requirePresence,
    resume: 'clear',
  },
  {
    action: 'START_WORK',
    from: ['PREPARATION'],
    to: 'WORKING',
    guard: requireZone,
    resume: 'clear',
  },
  {
    action: 'START_BREAK',
    from: TEMPORARY_ENTRY_FROM,
    to: 'BREAK',
    resume: 'remember',
    effects: ['SCHEDULE_RETURN_REMINDER'],
  },
  {
    action: 'START_MEAL',
    from: TEMPORARY_ENTRY_FROM,
    to: 'MEAL',
    resume: 'remember',
    effects: ['SCHEDULE_RETURN_REMINDER'],
  },
  {
    action: 'START_SERVICE_TIME',
    from: TEMPORARY_ENTRY_FROM,
    to: 'SERVICE_TIME',
    resume: 'remember',
    effects: ['SCHEDULE_RETURN_REMINDER'],
  },
  {
    action: 'START_DOWNTIME',
    from: RESUMABLE_STATES,
    to: 'DOWNTIME',
    guard: requireReason,
    resume: 'remember',
    effects: ['REQUIRE_DOWNTIME_REPORT', 'SCHEDULE_DOWNTIME_ESCALATION'],
  },
  {
    action: 'RESUME',
    from: TEMPORARY_STATES,
    to: 'RESUME_STATE',
    resume: 'clear',
    effects: ['CANCEL_RETURN_REMINDER'],
  },
  { action: 'START_CLEANING', from: ['WORKING'], to: 'CLEANING', resume: 'clear' },
  {
    action: 'CLEANING_DONE',
    from: ['CLEANING'],
    to: 'HANDOVER',
    resume: 'clear',
    effects: ['OPEN_HANDOVER_DRAFT'],
  },
  { action: 'BACK_TO_CLEANING', from: ['HANDOVER'], to: 'CLEANING', resume: 'clear' },
  {
    action: 'SUBMIT_HANDOVER',
    from: ['HANDOVER'],
    to: 'READY_TO_CLOSE',
    guard: requireHandover,
    resume: 'clear',
    effects: ['MARK_HANDOVER_SUBMITTED'],
  },
  {
    action: 'CONTINUE_WORK',
    from: ['READY_TO_CLOSE'],
    to: 'WORKING',
    resume: 'clear',
    effects: ['SUPERSEDE_HANDOVER'],
  },
  {
    action: 'CLOSE_SHIFT',
    from: ['READY_TO_CLOSE'],
    to: 'SHIFT_CLOSED',
    resume: 'clear',
    effects: ['FINALIZE_SHIFT'],
  },
  {
    action: 'EMERGENCY_EXIT',
    from: ACTIVE_STATES,
    to: 'EMERGENCY_EXIT',
    guard: requireReason,
    resume: 'clear',
    effects: ['NOTIFY_MASTER', 'FLAG_FOR_REVIEW'],
  },
];

function fail(
  from: ShiftSnapshot,
  action: ShiftAction,
  error: TransitionErrorCode,
): TransitionResult {
  return { ok: false, action, from, error };
}

/** Пояснення для користувача, чому дія недоступна, коли правила немає. */
function explainRejection(snapshot: ShiftSnapshot, action: ShiftAction): TransitionErrorCode {
  if (snapshot.state === 'NOT_STARTED') return 'SHIFT_NOT_STARTED';
  if (isTerminal(snapshot.state)) return 'SHIFT_NOT_ACTIVE';
  if (action === 'START_SHIFT') return 'ALREADY_STARTED';
  if (isTemporary(snapshot.state)) return 'TEMPORARY_STATE_OPEN';
  return 'ACTION_NOT_ALLOWED';
}

function nextResumeState(policy: ResumePolicy, snapshot: ShiftSnapshot): ResumableState | null {
  switch (policy) {
    case 'clear':
      return null;
    case 'keep':
      return snapshot.resumeState;
    case 'remember':
      return isResumable(snapshot.state) ? snapshot.state : snapshot.resumeState;
  }
}

/**
 * Чистий перехід. Не читає час і не пише нікуди: застосунок сам закриває інтервал,
 * відкриває новий, пише подію й аутбокс у одній транзакції (ТЗ 4.5, документ 3.7).
 */
export function transition(
  snapshot: ShiftSnapshot,
  action: ShiftAction,
  ctx: TransitionContext = {},
): TransitionResult {
  const rule = TRANSITION_RULES.find((r) => r.action === action && r.from.includes(snapshot.state));
  if (!rule) return fail(snapshot, action, explainRejection(snapshot, action));

  const guardError = rule.guard?.(ctx) ?? null;
  if (guardError) return fail(snapshot, action, guardError);

  if (rule.to === 'RESUME_STATE') {
    if (snapshot.resumeState === null) return fail(snapshot, action, 'RESUME_STATE_MISSING');

    if (ctx.resumeIntoDowntime === true && snapshot.state !== 'DOWNTIME') {
      return {
        ok: true,
        action,
        from: snapshot,
        next: { state: 'DOWNTIME', resumeState: snapshot.resumeState },
        effects: ['CANCEL_RETURN_REMINDER', 'SCHEDULE_DOWNTIME_ESCALATION'],
      };
    }

    return {
      ok: true,
      action,
      from: snapshot,
      next: { state: snapshot.resumeState, resumeState: null },
      effects: rule.effects ?? [],
    };
  }

  return {
    ok: true,
    action,
    from: snapshot,
    next: { state: rule.to, resumeState: nextResumeState(rule.resume, snapshot) },
    effects: rule.effects ?? [],
  };
}

/** Дії, доступні з поточного стану за наявних фактів. Для рендеру кнопок (FR-UI-01). */
export function allowedActions(
  snapshot: ShiftSnapshot,
  ctx: TransitionContext = {},
): readonly ShiftAction[] {
  return SHIFT_ACTIONS.filter((action) => transition(snapshot, action, ctx).ok);
}

/** Перевірка структурного інваріанту знімка (ТЗ 4.5): resumeState є тоді й лише тоді, коли стан тимчасовий. */
export function isConsistentSnapshot(snapshot: ShiftSnapshot): boolean {
  return isTemporary(snapshot.state)
    ? snapshot.resumeState !== null
    : snapshot.resumeState === null;
}
