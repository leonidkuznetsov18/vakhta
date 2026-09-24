import { DocumentUploadQuery, type EquipmentDocumentView } from '@vakhta/contracts';
import { EquipmentDocumentKind, type EquipmentDocumentKind as Kind } from '@vakhta/domain';

/** The server refuses more; checking here saves a 50 MB upload that would fail (FR-010). */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const PDF = 'application/pdf';
const BYTES_PER_MB = 1024 * 1024;

export interface UploadDraft {
  readonly file: File | null;
  readonly title: string;
  readonly kind: Kind;
  readonly language: string;
  readonly edition: string;
  readonly sourceUrl: string;
}

export const EMPTY_UPLOAD: UploadDraft = {
  file: null,
  title: '',
  kind: EquipmentDocumentKind.OPERATING_MANUAL,
  language: '',
  edition: '',
  sourceUrl: '',
};

export const UploadProblem = { FILE: 'FILE', TOO_LARGE: 'TOO_LARGE', FIELDS: 'FIELDS' } as const;
export type UploadProblem = (typeof UploadProblem)[keyof typeof UploadProblem];

export type UploadCheck =
  | { readonly ok: true; readonly file: File; readonly meta: DocumentUploadQuery }
  | { readonly ok: false; readonly problem: UploadProblem };

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function checkUpload(draft: UploadDraft): UploadCheck {
  if (draft.file?.type !== PDF) return { ok: false, problem: UploadProblem.FILE };
  if (draft.file.size > MAX_DOCUMENT_BYTES) return { ok: false, problem: UploadProblem.TOO_LARGE };
  const meta = DocumentUploadQuery.safeParse({
    title: draft.title,
    kind: draft.kind,
    language: optional(draft.language),
    edition: optional(draft.edition),
    sourceUrl: optional(draft.sourceUrl),
  });
  if (!meta.success) return { ok: false, problem: UploadProblem.FIELDS };
  return { ok: true, file: draft.file, meta: meta.data };
}

/** "Service manual.pdf" → "Service manual", the default title of a picked file. */
export function titleFromFile(file: File): string {
  return file.name.replace(/\.pdf$/i, '');
}

export function formatSize(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

/** A machine without an operating manual gets a visible reminder to find one (FR-012). */
export function lacksManual(documents: readonly EquipmentDocumentView[]): boolean {
  return !documents.some((doc) => doc.kind === EquipmentDocumentKind.OPERATING_MANUAL);
}
