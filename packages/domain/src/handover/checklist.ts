/**
 * Чек-лист фінального прибирання (ТЗ 5.6, FR-CLN-03): обовʼязкові пункти MVP.
 * Ключі стабільні; підписи живуть у каталозі i18n і в checklist_definitions.items.
 */
export const DEFAULT_CHECKLIST_KEYS = [
  'SURFACES',
  'LEFTOVERS',
  'TRASH',
  'TOOLS',
  'FLOOR',
  'PASSAGES',
  'LEAKS_DAMAGE',
  'MESSAGE_NEXT',
] as const;
export type ChecklistKey = (typeof DEFAULT_CHECKLIST_KEYS)[number];

export interface ChecklistItemDefinition {
  readonly key: string;
  readonly label: string;
  /** Пункт-повідомлення наступній зміні: відповідь текстом, а не так/ні. */
  readonly kind?: 'CHECK' | 'NOTE';
}

/** Три обовʼязкові ракурси фото (FR-PHO-01). */
export const HANDOVER_ANGLES = ['OVERVIEW', 'SURFACES', 'FLOOR'] as const;
export type HandoverAngle = (typeof HANDOVER_ANGLES)[number];

export const REMARK_NEEDS = ['MASTER', 'CLEANING', 'REPAIR'] as const;
export type RemarkNeed = (typeof REMARK_NEEDS)[number];

export interface ChecklistAnswer {
  readonly itemKey: string;
  readonly ok: boolean;
  readonly remarkCategory?: string | null;
  readonly remarkText?: string | null;
  readonly safeToWork?: boolean | null;
  readonly needs?: readonly RemarkNeed[] | null;
}

export interface HandoverMediaSlot {
  readonly angle: HandoverAngle;
  readonly mediaObjectId: string;
}

export type HandoverIssueCode =
  | 'ITEM_MISSING'
  | 'REMARK_CATEGORY_REQUIRED'
  | 'REMARK_TEXT_REQUIRED'
  | 'REMARK_SAFETY_REQUIRED'
  | 'PHOTO_MISSING';

export interface HandoverIssue {
  readonly code: HandoverIssueCode;
  readonly itemKey?: string;
  readonly angle?: HandoverAngle;
}

export interface ValidateOptions {
  /** «Не можу завершити прибирання» з причиною: пункти й фото не блокують подання (FR-CLN-05). */
  readonly cannotComplete?: boolean;
}

/**
 * Перевірка чернетки перед поданням (AC-10): кожен пункт має відповідь, зауваження повне
 * (FR-CLN-04), три ракурси є. Порядок issues стабільний для екрана бота.
 */
export function validateHandoverDraft(
  items: readonly ChecklistItemDefinition[],
  answers: readonly ChecklistAnswer[],
  media: readonly HandoverMediaSlot[],
  opts: ValidateOptions = {},
): HandoverIssue[] {
  const issues: HandoverIssue[] = [];
  const byKey = new Map(answers.map((a) => [a.itemKey, a]));
  for (const item of items) {
    const answer = byKey.get(item.key);
    if (!answer) {
      if (!opts.cannotComplete) issues.push({ code: 'ITEM_MISSING', itemKey: item.key });
      continue;
    }
    if (answer.ok) continue;
    if (!answer.remarkCategory)
      issues.push({ code: 'REMARK_CATEGORY_REQUIRED', itemKey: item.key });
    if (!answer.remarkText?.trim())
      issues.push({ code: 'REMARK_TEXT_REQUIRED', itemKey: item.key });
    if (answer.safeToWork === null || answer.safeToWork === undefined) {
      issues.push({ code: 'REMARK_SAFETY_REQUIRED', itemKey: item.key });
    }
  }
  if (!opts.cannotComplete) {
    const present = new Set(media.map((m) => m.angle));
    for (const angle of HANDOVER_ANGLES) {
      if (!present.has(angle)) issues.push({ code: 'PHOTO_MISSING', angle });
    }
  }
  return issues;
}

export function isRemarkComplete(answer: ChecklistAnswer): boolean {
  return (
    answer.ok ||
    (Boolean(answer.remarkCategory) &&
      Boolean(answer.remarkText?.trim()) &&
      answer.safeToWork !== null &&
      answer.safeToWork !== undefined)
  );
}
