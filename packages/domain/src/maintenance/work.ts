import { OperationResult, WorkStatus, WorkType } from './codes.js';

/** Actions on a work order; acceptance of an emergency and a review are facts, not statuses. */
export const WorkAction = {
  START: 'START',
  WAIT: 'WAIT',
  RESUME: 'RESUME',
  SUBMIT: 'SUBMIT',
  ACCEPT_REVIEW: 'ACCEPT_REVIEW',
  RETURN: 'RETURN',
  CANCEL: 'CANCEL',
} as const;
export type WorkAction = (typeof WorkAction)[keyof typeof WorkAction];

export const WorkError = {
  TRANSITION_NOT_ALLOWED: 'WORK_TRANSITION_NOT_ALLOWED',
  NOT_ACCEPTED: 'WORK_NOT_ACCEPTED',
  ANSWERS_MISSING: 'WORK_ANSWERS_MISSING',
  OPERATION_NOT_DONE: 'WORK_OPERATION_NOT_DONE',
  PHOTO_MISSING: 'WORK_PHOTO_MISSING',
  SUMMARY_MISSING: 'WORK_SUMMARY_MISSING',
  MATERIALS_UNCONFIRMED: 'WORK_MATERIALS_UNCONFIRMED',
} as const;
export type WorkError = (typeof WorkError)[keyof typeof WorkError];

export interface OperationSpec {
  readonly id: string;
  readonly photoRequired: boolean;
}

export interface OperationAnswer {
  readonly operationId: string;
  readonly result: OperationResult;
  readonly hasPhoto: boolean;
}

export interface WorkSnapshot {
  readonly type: WorkType;
  readonly status: WorkStatus;
  /** Emergency repairs must be accepted before work starts. */
  readonly accepted: boolean;
  readonly operations: readonly OperationSpec[];
  readonly answers: readonly OperationAnswer[];
  /** What was done, required to finish an emergency repair. */
  readonly summary: string | null;
  /** The plan version lists materials, so submission confirms what was used (FR-051). */
  readonly materialsRequired: boolean;
  /** Materials used as confirmed by the performer. */
  readonly materialsUsed: string | null;
  /**
   * Entered from a paper record by the chief mechanic (FR-054): required photos cannot exist, so
   * they are not demanded; the entry records who entered it.
   */
  readonly paperRecord: boolean;
}

export type WorkTransition =
  | { readonly ok: true; readonly next: WorkStatus }
  | { readonly ok: false; readonly error: WorkError };

const OPEN_BEFORE_REVIEW: readonly WorkStatus[] = [
  WorkStatus.ASSIGNED,
  WorkStatus.IN_PROGRESS,
  WorkStatus.WAITING,
];

const FROM: Readonly<Record<WorkAction, readonly WorkStatus[]>> = {
  START: [WorkStatus.ASSIGNED],
  WAIT: [WorkStatus.IN_PROGRESS],
  RESUME: [WorkStatus.WAITING],
  SUBMIT: [WorkStatus.IN_PROGRESS],
  ACCEPT_REVIEW: [WorkStatus.IN_REVIEW],
  RETURN: [WorkStatus.IN_REVIEW],
  CANCEL: [...OPEN_BEFORE_REVIEW, WorkStatus.IN_REVIEW],
};

function fail(error: WorkError): WorkTransition {
  return { ok: false, error };
}

/** Planned maintenance needs every operation answered, none "not done" and required photos. */
function checklistError(snapshot: WorkSnapshot): WorkError | null {
  const answers = new Map(snapshot.answers.map((answer) => [answer.operationId, answer]));
  for (const operation of snapshot.operations) {
    const answer = answers.get(operation.id);
    if (!answer) return WorkError.ANSWERS_MISSING;
    if (answer.result === OperationResult.NOT_DONE) return WorkError.OPERATION_NOT_DONE;
    if (photoMissing(snapshot, operation, answer)) return WorkError.PHOTO_MISSING;
  }
  return null;
}

function photoMissing(
  snapshot: WorkSnapshot,
  operation: OperationSpec,
  answer: OperationAnswer,
): boolean {
  if (snapshot.paperRecord || !operation.photoRequired) return false;
  return answer.result === OperationResult.DONE && !answer.hasPhoto;
}

function submit(snapshot: WorkSnapshot): WorkTransition {
  if (snapshot.type === WorkType.EMERGENCY_REPAIR) {
    if (!snapshot.summary?.trim()) return fail(WorkError.SUMMARY_MISSING);
    return { ok: true, next: WorkStatus.COMPLETED };
  }
  const error = checklistError(snapshot);
  if (error) return fail(error);
  if (snapshot.materialsRequired && !snapshot.materialsUsed?.trim())
    return fail(WorkError.MATERIALS_UNCONFIRMED);
  return { ok: true, next: WorkStatus.IN_REVIEW };
}

const TARGET: Readonly<Record<Exclude<WorkAction, 'SUBMIT'>, WorkStatus>> = {
  START: WorkStatus.IN_PROGRESS,
  WAIT: WorkStatus.WAITING,
  RESUME: WorkStatus.IN_PROGRESS,
  ACCEPT_REVIEW: WorkStatus.COMPLETED,
  RETURN: WorkStatus.IN_PROGRESS,
  CANCEL: WorkStatus.CANCELLED,
};

/**
 * Pure transition of a work order (FR-050, FR-051). A planned maintenance goes to review; an
 * emergency repair completes on "done", and the machine is released separately (FR-065).
 */
export function transitionWork(snapshot: WorkSnapshot, action: WorkAction): WorkTransition {
  if (!FROM[action].includes(snapshot.status)) return fail(WorkError.TRANSITION_NOT_ALLOWED);
  if (
    action === WorkAction.START &&
    snapshot.type === WorkType.EMERGENCY_REPAIR &&
    !snapshot.accepted
  )
    return fail(WorkError.NOT_ACCEPTED);
  if (action === WorkAction.SUBMIT) return submit(snapshot);
  if (
    (action === WorkAction.ACCEPT_REVIEW || action === WorkAction.RETURN) &&
    snapshot.type !== WorkType.PLANNED_MAINTENANCE
  )
    return fail(WorkError.TRANSITION_NOT_ALLOWED);
  return { ok: true, next: TARGET[action] };
}

/** "Not done" and "not applicable" always carry a reason (TZ-M R05). */
export function answerNeedsReason(result: OperationResult): boolean {
  return result !== OperationResult.DONE;
}
