/**
 * Final-cleaning checklist (spec 5.6, FR-CLN-03). A checklist is an ordered list of items the
 * employee walks through in the bot before handing the zone over:
 *
 * - `CHECK`: yes / no; "no" opens a remark (category, text, safety, needs) per FR-CLN-04;
 * - `NOTE`: a free-text message to the next shift;
 * - `PHOTO`: a photo the employee must send; every checklist has at least one (FR-PHO-01).
 *
 * Admins build checklists in the panel per position and zone type; the keys below only name the
 * items of the default checklist that the system creates when nobody has defined one yet.
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

export const CHECKLIST_ITEM_KINDS = ['CHECK', 'NOTE', 'PHOTO'] as const;
export type ChecklistItemKind = (typeof CHECKLIST_ITEM_KINDS)[number];

export interface ChecklistItemDefinition {
  readonly key: string;
  readonly label: string;
  /** Missing on rows written before photo items existed: those are plain checks. */
  readonly kind?: ChecklistItemKind;
}

/** Photo items of the default checklist: the three angles of FR-PHO-01. */
export const HANDOVER_ANGLES = ['OVERVIEW', 'SURFACES', 'FLOOR'] as const;
export type HandoverAngle = (typeof HANDOVER_ANGLES)[number];

/** Photo items get their own key space so they never collide with the check named the same. */
export const PHOTO_KEY_PREFIX = 'PHOTO_';

/** Item keys travel inside Telegram callback data (64 bytes) and must stay short and plain. */
export const CHECKLIST_ITEM_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;

export const CHECKLIST_LIMITS = {
  maxItems: 40,
  maxLabelLength: 120,
  maxNameLength: 120,
} as const;

export function itemKind(item: ChecklistItemDefinition): ChecklistItemKind {
  return item.kind ?? 'CHECK';
}

export function photoItems(items: readonly ChecklistItemDefinition[]): ChecklistItemDefinition[] {
  return items.filter((item) => itemKind(item) === 'PHOTO');
}

/**
 * The default checklist of spec 5.6: seven checks, the message to the next shift and the three
 * photo angles. Labels come from the message catalog of the base language.
 */
export function defaultChecklistItems(labels: {
  readonly items: Readonly<Record<ChecklistKey, string>>;
  readonly angles: Readonly<Record<HandoverAngle, string>>;
}): ChecklistItemDefinition[] {
  const checks = DEFAULT_CHECKLIST_KEYS.map((key): ChecklistItemDefinition => ({
    key,
    label: labels.items[key],
    kind: key === 'MESSAGE_NEXT' ? 'NOTE' : 'CHECK',
  }));
  const photos = HANDOVER_ANGLES.map((angle): ChecklistItemDefinition => ({
    key: `${PHOTO_KEY_PREFIX}${angle}`,
    label: labels.angles[angle],
    kind: 'PHOTO',
  }));
  return [...checks, ...photos];
}

/** Stable key for the n-th item of an admin-built checklist (1-based, zero-padded). */
export function checklistItemKey(index: number): string {
  return `ITEM_${String(index + 1).padStart(2, '0')}`;
}

export type ChecklistDefinitionIssue =
  'NO_ITEMS' | 'TOO_MANY_ITEMS' | 'NO_PHOTO_ITEM' | 'EMPTY_LABEL' | 'DUPLICATE_KEY' | 'INVALID_KEY';

/**
 * Rules for a checklist an admin saves: at least one item, at least one photo item (the photo is
 * mandatory by design), every label filled in, keys unique and callback-safe.
 */
export function validateChecklistItems(
  items: readonly ChecklistItemDefinition[],
): ChecklistDefinitionIssue[] {
  const issues = new Set<ChecklistDefinitionIssue>();
  if (items.length === 0) issues.add('NO_ITEMS');
  if (items.length > CHECKLIST_LIMITS.maxItems) issues.add('TOO_MANY_ITEMS');
  if (items.length > 0 && photoItems(items).length === 0) issues.add('NO_PHOTO_ITEM');
  const seen = new Set<string>();
  for (const item of items) {
    if (item.label.trim().length === 0) issues.add('EMPTY_LABEL');
    if (!CHECKLIST_ITEM_KEY_PATTERN.test(item.key)) issues.add('INVALID_KEY');
    if (seen.has(item.key)) issues.add('DUPLICATE_KEY');
    seen.add(item.key);
  }
  return [...issues];
}

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

/** A photo attached to one PHOTO item of the checklist. */
export interface HandoverMediaSlot {
  readonly itemKey: string;
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
}

export interface ValidateOptions {
  /** "Cannot finish cleaning" with a reason: items and photos stop blocking submission (FR-CLN-05). */
  readonly cannotComplete?: boolean;
}

/**
 * Draft check before submission (AC-10): every check and note answered, every remark complete
 * (FR-CLN-04), every photo item has a photo. Issues follow the checklist order so the bot screen
 * is stable.
 */
export function validateHandoverDraft(
  items: readonly ChecklistItemDefinition[],
  answers: readonly ChecklistAnswer[],
  media: readonly HandoverMediaSlot[],
  opts: ValidateOptions = {},
): HandoverIssue[] {
  const issues: HandoverIssue[] = [];
  const byKey = new Map(answers.map((a) => [a.itemKey, a]));
  const photos = new Set(media.map((m) => m.itemKey));
  for (const item of items) {
    if (itemKind(item) === 'PHOTO') {
      if (!opts.cannotComplete && !photos.has(item.key)) {
        issues.push({ code: 'PHOTO_MISSING', itemKey: item.key });
      }
      continue;
    }
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
