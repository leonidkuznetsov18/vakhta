import { PlanContent, type EquipmentDetail } from '@vakhta/contracts';
import {
  AnchorMode,
  DEFAULT_MAINTENANCE_REMINDER_OFFSETS,
  IntervalUnit,
  MaterialKind,
  MaterialMode,
  PlanSourceKind,
  addDays,
  addInterval,
  type AnchorMode as Anchor,
  type IntervalUnit as Unit,
  type MaterialKind as Kind,
  type MaterialMode as Mode,
  type PlanSourceKind as SourceKind,
} from '@vakhta/domain';

/** One operation row of the editor; `key` is its identity while it is edited or moved. */
export interface OperationDraft {
  readonly key: string;
  readonly text: string;
  readonly place: string;
  readonly photoRequired: boolean;
}

export interface MaterialDraft {
  readonly key: string;
  readonly kind: Kind;
  readonly name: string;
  readonly article: string;
  readonly quantity: string;
  readonly unit: string;
  readonly mode: Mode;
}

/** The plan as the form holds it: numbers as typed text, rows with their own identity. */
export interface PlanDraft {
  readonly title: string;
  readonly intervalUnit: Unit;
  readonly intervalCount: string;
  readonly anchorMode: Anchor;
  readonly firstDueOn: string;
  readonly sourceKind: SourceKind;
  readonly sourceDocumentId: string;
  readonly sourceReference: string;
  readonly sourceNote: string;
  readonly estimatedMinutes: string;
  readonly requiresStop: boolean;
  readonly assigneeEmployeeId: string;
  readonly operations: readonly OperationDraft[];
  readonly materials: readonly MaterialDraft[];
}

const DEFAULT_MINUTES = 60;
const DEFAULT_UNIT = 'pcs';

export function newKey(): string {
  return crypto.randomUUID();
}

export function newOperation(): OperationDraft {
  return { key: newKey(), text: '', place: '', photoRequired: false };
}

export function newMaterial(): MaterialDraft {
  return {
    key: newKey(),
    kind: MaterialKind.MATERIAL,
    name: '',
    article: '',
    quantity: '1',
    unit: DEFAULT_UNIT,
    mode: MaterialMode.EVERY_CYCLE,
  };
}

/** A new plan starts from the machine: its mechanic and, when there is one, its manual (FR-020). */
export function emptyPlan(machine: EquipmentDetail): PlanDraft {
  const manual = machine.documents.at(0);
  return {
    title: '',
    intervalUnit: IntervalUnit.MONTH,
    intervalCount: '1',
    anchorMode: AnchorMode.FROM_COMPLETION,
    firstDueOn: '',
    sourceKind: manual ? PlanSourceKind.DOCUMENT : PlanSourceKind.PLANT_DECISION,
    sourceDocumentId: manual?.id ?? '',
    sourceReference: '',
    sourceNote: '',
    estimatedMinutes: String(DEFAULT_MINUTES),
    requiresStop: true,
    assigneeEmployeeId: machine.responsible.id,
    operations: [newOperation()],
    materials: [],
  };
}

export function draftFromContent(content: PlanContent): PlanDraft {
  return {
    title: content.title,
    intervalUnit: content.intervalUnit,
    intervalCount: String(content.intervalCount),
    anchorMode: content.anchorMode,
    firstDueOn: content.firstDueOn ?? '',
    sourceKind: content.sourceKind,
    sourceDocumentId: content.sourceDocumentId ?? '',
    sourceReference: content.sourceReference ?? '',
    sourceNote: content.sourceNote ?? '',
    estimatedMinutes: String(content.estimatedMinutes),
    requiresStop: content.requiresStop,
    assigneeEmployeeId: content.assigneeEmployeeId ?? '',
    operations: content.operations.map((operation) => ({
      key: newKey(),
      text: operation.text,
      place: operation.place ?? '',
      photoRequired: operation.photoRequired,
    })),
    materials: content.materials.map((material) => ({
      key: newKey(),
      kind: material.kind,
      name: material.name,
      article: material.article ?? '',
      quantity: String(material.quantity),
      unit: material.unit,
      mode: material.mode,
    })),
  };
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function candidate(draft: PlanDraft) {
  const document = draft.sourceKind === PlanSourceKind.DOCUMENT;
  return {
    title: draft.title,
    intervalUnit: draft.intervalUnit,
    intervalCount: Number(draft.intervalCount),
    anchorMode: draft.anchorMode,
    firstDueOn: draft.firstDueOn || null,
    sourceKind: draft.sourceKind,
    sourceDocumentId: document && draft.sourceDocumentId ? draft.sourceDocumentId : null,
    sourceReference: document ? optional(draft.sourceReference) : undefined,
    sourceNote: optional(draft.sourceNote),
    estimatedMinutes: Number(draft.estimatedMinutes),
    requiresStop: draft.requiresStop,
    assigneeEmployeeId: draft.assigneeEmployeeId || null,
    // Empty rows are what "add" leaves behind; they are not operations yet.
    operations: draft.operations
      .filter((operation) => operation.text.trim())
      .map((operation) => ({
        text: operation.text,
        place: optional(operation.place),
        photoRequired: operation.photoRequired,
      })),
    materials: draft.materials
      .filter((material) => material.name.trim())
      .map((material) => ({
        kind: material.kind,
        name: material.name,
        article: optional(material.article),
        quantity: Number(material.quantity.replace(',', '.')),
        unit: material.unit,
        mode: material.mode,
      })),
  };
}

export type ContentCheck =
  | { readonly ok: true; readonly content: PlanContent }
  | { readonly ok: false; readonly fields: ReadonlySet<string> };

/** The save command, or the top-level fields the contract refuses. */
export function toContent(draft: PlanDraft): ContentCheck {
  const parsed = PlanContent.safeParse(candidate(draft));
  if (parsed.success) return { ok: true, content: parsed.data };
  const fields = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')));
  return { ok: false, fields };
}

export const PublishIssue = {
  TITLE_REQUIRED: 'TITLE_REQUIRED',
  FIRST_DUE_REQUIRED: 'FIRST_DUE_REQUIRED',
  OPERATIONS_REQUIRED: 'OPERATIONS_REQUIRED',
  SOURCE_DOCUMENT_REQUIRED: 'SOURCE_DOCUMENT_REQUIRED',
  SOURCE_NOTE_REQUIRED: 'SOURCE_NOTE_REQUIRED',
  ASSIGNEE_REQUIRED: 'ASSIGNEE_REQUIRED',
} as const;
export type PublishIssue = (typeof PublishIssue)[keyof typeof PublishIssue];

function sourceIssue(draft: PlanDraft): PublishIssue | null {
  if (draft.sourceKind === PlanSourceKind.PLANT_DECISION)
    return draft.sourceNote.trim() ? null : PublishIssue.SOURCE_NOTE_REQUIRED;
  return draft.sourceDocumentId ? null : PublishIssue.SOURCE_DOCUMENT_REQUIRED;
}

/**
 * What stops publication, named before the request (FR-022). The server checks the same rules and
 * answers PLAN_INVALID if something slipped through, for example a document unlinked meanwhile.
 */
export function publishIssues(draft: PlanDraft, published: boolean): PublishIssue[] {
  const checks: readonly (readonly [boolean, PublishIssue])[] = [
    [!draft.title.trim(), PublishIssue.TITLE_REQUIRED],
    [!published && !draft.firstDueOn, PublishIssue.FIRST_DUE_REQUIRED],
    [
      !draft.operations.some((operation) => operation.text.trim()),
      PublishIssue.OPERATIONS_REQUIRED,
    ],
    [!draft.assigneeEmployeeId, PublishIssue.ASSIGNEE_REQUIRED],
  ];
  const issues = checks.filter(([failed]) => failed).map(([, issue]) => issue);
  const source = sourceIssue(draft);
  return source ? [...issues, source] : issues;
}

export interface SchedulePreview {
  readonly firstDueOn: string;
  readonly reminders: readonly string[];
  readonly nextDueOn: string;
}

/** The first date, its reminder days and the date after it, as the scheduler will compute them. */
export function schedulePreview(draft: PlanDraft): SchedulePreview | null {
  const count = Number(draft.intervalCount);
  if (!draft.firstDueOn || !Number.isInteger(count) || count < 1) return null;
  return {
    firstDueOn: draft.firstDueOn,
    reminders: DEFAULT_MAINTENANCE_REMINDER_OFFSETS.map((offset) =>
      addDays(draft.firstDueOn, -offset),
    ),
    nextDueOn: addInterval(draft.firstDueOn, draft.intervalUnit, count),
  };
}

/** Whether the form differs from what was loaded; row keys are identity, not content. */
export function sameDraft(a: PlanDraft, b: PlanDraft): boolean {
  return JSON.stringify(candidate(a)) === JSON.stringify(candidate(b));
}

/** Moves a row up or down by one place; out of range leaves the list as it is. */
export function move<T>(rows: readonly T[], index: number, step: -1 | 1): readonly T[] {
  const target = index + step;
  const row = rows[index];
  const other = rows[target];
  if (row === undefined || other === undefined) return rows;
  const next = [...rows];
  next[index] = other;
  next[target] = row;
  return next;
}

/** A list row replaced by its identity. */
export function replaceRow<T extends { readonly key: string }>(
  rows: readonly T[],
  row: T,
): readonly T[] {
  return rows.map((item) => (item.key === row.key ? row : item));
}

export function removeRow<T extends { readonly key: string }>(
  rows: readonly T[],
  key: string,
): readonly T[] {
  return rows.filter((item) => item.key !== key);
}
