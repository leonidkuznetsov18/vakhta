import {
  DocumentLinkInput,
  DocumentUploadQuery,
  type EquipmentDocumentView,
} from '@vakhta/contracts';
import { EquipmentDocumentKind, type EquipmentDocumentKind as Kind } from '@vakhta/domain';

/** The server refuses more; checking here saves a 50 MB upload that would fail (FR-010). */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const PDF = 'application/pdf';
const BYTES_PER_MB = 1024 * 1024;

/** How a document is added: a stored PDF, or a link the browser opens (FR-008). */
export const DocumentMode = { FILE: 'FILE', LINK: 'LINK' } as const;
export type DocumentMode = (typeof DocumentMode)[keyof typeof DocumentMode];

export interface UploadDraft {
  readonly mode: DocumentMode;
  readonly file: File | null;
  readonly title: string;
  readonly kind: Kind;
  readonly language: string;
  readonly edition: string;
  readonly sourceUrl: string;
}

export const EMPTY_UPLOAD: UploadDraft = {
  mode: DocumentMode.FILE,
  file: null,
  title: '',
  kind: EquipmentDocumentKind.OPERATING_MANUAL,
  language: '',
  edition: '',
  sourceUrl: '',
};

export const UploadProblem = {
  FILE: 'FILE',
  TOO_LARGE: 'TOO_LARGE',
  FIELDS: 'FIELDS',
  LINK: 'LINK',
} as const;
export type UploadProblem = (typeof UploadProblem)[keyof typeof UploadProblem];

export type UploadCheck =
  | { readonly ok: true; readonly file: File; readonly meta: DocumentUploadQuery }
  | { readonly ok: false; readonly problem: UploadProblem };

export type LinkCheck =
  | { readonly ok: true; readonly input: DocumentLinkInput }
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

/** A link document needs an http(s) address and the same descriptive fields as a file. */
export function checkLink(draft: UploadDraft): LinkCheck {
  const address = DocumentLinkInput.shape.sourceUrl.safeParse(draft.sourceUrl);
  if (!address.success) return { ok: false, problem: UploadProblem.LINK };
  const input = DocumentLinkInput.safeParse({
    title: draft.title,
    kind: draft.kind,
    language: optional(draft.language),
    edition: optional(draft.edition),
    sourceUrl: address.data,
  });
  if (!input.success) return { ok: false, problem: UploadProblem.FIELDS };
  return { ok: true, input: input.data };
}

/** Whether the draft can be sent: a picked file, or an address, with a title either way. */
export function canSubmit(draft: UploadDraft): boolean {
  if (!draft.title.trim()) return false;
  return draft.mode === DocumentMode.FILE ? draft.file !== null : draft.sourceUrl.trim() !== '';
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
