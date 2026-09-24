import { EquipmentInput, EquipmentUpdate, type EquipmentDetail } from '@vakhta/contracts';
import { EquipmentCriticality, type EquipmentCriticality as Criticality } from '@vakhta/domain';

/** What the equipment form edits: every field as the control holds it. */
export interface EquipmentDraft {
  readonly code: string;
  readonly name: string;
  readonly orgUnitId: string;
  readonly zoneId: string;
  readonly equipmentType: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly manufacturedYear: string;
  readonly commissionedOn: string;
  readonly criticality: Criticality;
  readonly responsibleEmployeeId: string;
  readonly backupEmployeeId: string;
  readonly notes: string;
  readonly reassignOpenWork: boolean;
}

export type EquipmentField = keyof EquipmentDraft;

export const EMPTY_EQUIPMENT: EquipmentDraft = {
  code: '',
  name: '',
  orgUnitId: '',
  zoneId: '',
  equipmentType: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  manufacturedYear: '',
  commissionedOn: '',
  criticality: EquipmentCriticality.MEDIUM,
  responsibleEmployeeId: '',
  backupEmployeeId: '',
  notes: '',
  reassignOpenWork: true,
};

/** A missing value as the empty text the input shows. */
function orEmpty(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function draftFromDetail(detail: EquipmentDetail): EquipmentDraft {
  return {
    code: detail.code,
    name: detail.name,
    orgUnitId: detail.orgUnitId,
    zoneId: orEmpty(detail.zoneId),
    equipmentType: orEmpty(detail.equipmentType),
    manufacturer: orEmpty(detail.manufacturer),
    model: orEmpty(detail.model),
    serialNumber: orEmpty(detail.serialNumber),
    manufacturedYear: orEmpty(detail.manufacturedYear),
    commissionedOn: orEmpty(detail.commissionedOn),
    criticality: detail.criticality,
    responsibleEmployeeId: detail.responsible.id,
    backupEmployeeId: orEmpty(detail.backup?.id),
    notes: orEmpty(detail.notes),
    reassignOpenWork: true,
  };
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function candidate(draft: EquipmentDraft) {
  return {
    code: draft.code,
    name: draft.name,
    orgUnitId: draft.orgUnitId,
    zoneId: draft.zoneId || null,
    equipmentType: optional(draft.equipmentType),
    manufacturer: optional(draft.manufacturer),
    model: optional(draft.model),
    serialNumber: optional(draft.serialNumber),
    manufacturedYear: draft.manufacturedYear ? Number(draft.manufacturedYear) : null,
    commissionedOn: draft.commissionedOn || null,
    criticality: draft.criticality,
    responsibleEmployeeId: draft.responsibleEmployeeId,
    backupEmployeeId: draft.backupEmployeeId || null,
    notes: optional(draft.notes),
  };
}

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly fields: ReadonlySet<EquipmentField> };

function isField(value: PropertyKey | undefined): value is EquipmentField {
  return typeof value === 'string' && Object.hasOwn(EMPTY_EQUIPMENT, value);
}

function fieldsOf(
  issues: readonly { readonly path: readonly PropertyKey[] }[],
): Set<EquipmentField> {
  const fields = new Set<EquipmentField>();
  for (const issue of issues) {
    const [field] = issue.path;
    if (isField(field)) fields.add(field);
  }
  return fields;
}

/** The create command, or the fields the contract refuses. */
export function toCreate(draft: EquipmentDraft): Validated<EquipmentInput> {
  const parsed = EquipmentInput.safeParse(candidate(draft));
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, fields: fieldsOf(parsed.error.issues) };
}

/** The update command with the version the form was opened on (optimistic concurrency). */
export function toUpdate(
  draft: EquipmentDraft,
  expectedVersion: number,
): Validated<EquipmentUpdate> {
  const parsed = EquipmentUpdate.safeParse({
    ...candidate(draft),
    expectedVersion,
    reassignOpenWork: draft.reassignOpenWork,
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, fields: fieldsOf(parsed.error.issues) };
}

export function sameDraft(a: EquipmentDraft, b: EquipmentDraft): boolean {
  return Object.keys(a).every((field) => !isField(field) || a[field] === b[field]);
}
