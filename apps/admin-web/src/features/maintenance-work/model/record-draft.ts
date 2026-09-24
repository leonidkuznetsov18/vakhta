import {
  MaterialsUsedKind,
  type MaterialsUsed,
  type RecordCompletionCommand,
  type WorkDetail,
} from '@vakhta/contracts';
import {
  OperationResult,
  WorkStatus,
  WorkType,
  answerNeedsReason,
  type OperationResult as Result,
} from '@vakhta/domain';

/** A paper record completes the work, so "not done" is not offered: such work is not finished. */
export const RECORDABLE_RESULTS = [OperationResult.DONE, OperationResult.NOT_APPLICABLE] as const;
export type RecordableResult = (typeof RECORDABLE_RESULTS)[number];

const RECORDABLE = new Set<string>(RECORDABLE_RESULTS);

function isRecordable(result: Result | undefined): result is RecordableResult {
  return result !== undefined && RECORDABLE.has(result);
}

export interface AnswerDraft {
  readonly result: RecordableResult | null;
  readonly reason: string;
}

export interface RecordDraft {
  readonly performerId: string;
  readonly performedOn: string;
  /** Keyed by operation ordinal. */
  readonly answers: ReadonlyMap<number, AnswerDraft>;
  readonly materialsKind: MaterialsUsedKind;
  readonly materialsText: string;
}

/** Field keys of inline errors; an answer is keyed by its operation ordinal. */
export type RecordField = 'performerId' | 'performedOn' | 'materialsText' | `answer:${number}`;

export type RecordValidated =
  | { readonly ok: true; readonly value: RecordCompletionCommand }
  | { readonly ok: false; readonly fields: ReadonlySet<RecordField> };

const OPEN_FOR_RECORD = new Set<string>([
  WorkStatus.ASSIGNED,
  WorkStatus.IN_PROGRESS,
  WorkStatus.WAITING,
]);

/** Only open planned maintenance can be entered from paper (FR-054). */
export function canRecordCompletion(work: WorkDetail): boolean {
  return work.type === WorkType.PLANNED_MAINTENANCE && OPEN_FOR_RECORD.has(work.status);
}

/** Starts from the assignee, today and whatever the mechanic already answered in the bot. */
export function initialRecord(work: WorkDetail, today: string): RecordDraft {
  const answers = new Map<number, AnswerDraft>();
  for (const operation of work.operations) {
    const answered = operation.answer?.result;
    answers.set(operation.ordinal, {
      result: isRecordable(answered) ? answered : null,
      reason: operation.answer?.reason ?? '',
    });
  }
  return {
    performerId: work.assignee.id,
    performedOn: today,
    answers,
    materialsKind: MaterialsUsedKind.AS_PLANNED,
    materialsText: '',
  };
}

export function withAnswer(
  draft: RecordDraft,
  ordinal: number,
  patch: Partial<AnswerDraft>,
): RecordDraft {
  const answers = new Map(draft.answers);
  const current = answers.get(ordinal) ?? { result: null, reason: '' };
  answers.set(ordinal, { ...current, ...patch });
  return { ...draft, answers };
}

function materialsOf(work: WorkDetail, draft: RecordDraft): MaterialsUsed | null {
  if (!work.materials.length) return null;
  if (draft.materialsKind === MaterialsUsedKind.AS_PLANNED)
    return { kind: MaterialsUsedKind.AS_PLANNED };
  return { kind: MaterialsUsedKind.OTHER, text: draft.materialsText.trim() };
}

function answerProblem(answer: AnswerDraft | undefined): boolean {
  if (!answer?.result) return true;
  return answerNeedsReason(answer.result) && !answer.reason.trim();
}

/** The command, or every field that still needs input (shown inline, like the server checks). */
export function toRecordCommand(
  work: WorkDetail,
  draft: RecordDraft,
  today: string,
): RecordValidated {
  const fields = new Set<RecordField>();
  if (!draft.performerId) fields.add('performerId');
  if (!draft.performedOn || draft.performedOn > today) fields.add('performedOn');
  for (const operation of work.operations)
    if (answerProblem(draft.answers.get(operation.ordinal)))
      fields.add(`answer:${operation.ordinal}`);
  const otherMaterials = draft.materialsKind === MaterialsUsedKind.OTHER;
  if (work.materials.length && otherMaterials && !draft.materialsText.trim())
    fields.add('materialsText');
  if (fields.size) return { ok: false, fields };
  const answers = work.operations.map((operation) => {
    const answer = draft.answers.get(operation.ordinal);
    const result = answer?.result ?? OperationResult.DONE;
    const reason = answer?.reason.trim() ?? '';
    return {
      ordinal: operation.ordinal,
      result,
      ...(answerNeedsReason(result) ? { reason } : {}),
    };
  });
  return {
    ok: true,
    value: {
      expectedVersion: work.version,
      performerId: draft.performerId,
      performedOn: draft.performedOn,
      answers,
      materialsUsed: materialsOf(work, draft),
    },
  };
}
