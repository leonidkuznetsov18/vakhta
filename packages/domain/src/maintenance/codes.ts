/**
 * Codes of the equipment maintenance module (spec 014). Each set is one `as const` object with its
 * derived type and a values list for `z.enum` and `pgEnum` (rule C9).
 */

export const EquipmentCriticality = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' } as const;
export type EquipmentCriticality = (typeof EquipmentCriticality)[keyof typeof EquipmentCriticality];
export const EQUIPMENT_CRITICALITIES = [
  EquipmentCriticality.HIGH,
  EquipmentCriticality.MEDIUM,
  EquipmentCriticality.LOW,
] as const;

/** Confirmed operating state; independent of work status and overdue maintenance (TZ-M R03). */
export const EquipmentState = {
  AVAILABLE: 'AVAILABLE',
  RESTRICTED: 'RESTRICTED',
  STOPPED: 'STOPPED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type EquipmentState = (typeof EquipmentState)[keyof typeof EquipmentState];
export const EQUIPMENT_STATES = [
  EquipmentState.AVAILABLE,
  EquipmentState.RESTRICTED,
  EquipmentState.STOPPED,
  EquipmentState.UNKNOWN,
] as const;

export const EquipmentDocumentKind = {
  OPERATING_MANUAL: 'OPERATING_MANUAL',
  SERVICE_MANUAL: 'SERVICE_MANUAL',
  PARTS_LIST: 'PARTS_LIST',
  WIRING_DIAGRAM: 'WIRING_DIAGRAM',
  OTHER: 'OTHER',
} as const;
export type EquipmentDocumentKind =
  (typeof EquipmentDocumentKind)[keyof typeof EquipmentDocumentKind];
export const EQUIPMENT_DOCUMENT_KINDS = [
  EquipmentDocumentKind.OPERATING_MANUAL,
  EquipmentDocumentKind.SERVICE_MANUAL,
  EquipmentDocumentKind.PARTS_LIST,
  EquipmentDocumentKind.WIRING_DIAGRAM,
  EquipmentDocumentKind.OTHER,
] as const;

export const PlanState = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type PlanState = (typeof PlanState)[keyof typeof PlanState];
export const PLAN_STATES = [
  PlanState.DRAFT,
  PlanState.ACTIVE,
  PlanState.PAUSED,
  PlanState.ARCHIVED,
] as const;

export const IntervalUnit = { DAY: 'DAY', WEEK: 'WEEK', MONTH: 'MONTH' } as const;
export type IntervalUnit = (typeof IntervalUnit)[keyof typeof IntervalUnit];
export const INTERVAL_UNITS = [IntervalUnit.DAY, IntervalUnit.WEEK, IntervalUnit.MONTH] as const;

/** How the next due date is counted after a cycle (TZ-M §19). */
export const AnchorMode = {
  FROM_COMPLETION: 'FROM_COMPLETION',
  FIXED_CALENDAR: 'FIXED_CALENDAR',
} as const;
export type AnchorMode = (typeof AnchorMode)[keyof typeof AnchorMode];
export const ANCHOR_MODES = [AnchorMode.FROM_COMPLETION, AnchorMode.FIXED_CALENDAR] as const;

export const PlanSourceKind = { DOCUMENT: 'DOCUMENT', PLANT_DECISION: 'PLANT_DECISION' } as const;
export type PlanSourceKind = (typeof PlanSourceKind)[keyof typeof PlanSourceKind];
export const PLAN_SOURCE_KINDS = [PlanSourceKind.DOCUMENT, PlanSourceKind.PLANT_DECISION] as const;

export const MaterialKind = { PART: 'PART', MATERIAL: 'MATERIAL', TOOL: 'TOOL' } as const;
export type MaterialKind = (typeof MaterialKind)[keyof typeof MaterialKind];
export const MATERIAL_KINDS = [
  MaterialKind.PART,
  MaterialKind.MATERIAL,
  MaterialKind.TOOL,
] as const;

export const MaterialMode = { EVERY_CYCLE: 'EVERY_CYCLE', IF_NEEDED: 'IF_NEEDED' } as const;
export type MaterialMode = (typeof MaterialMode)[keyof typeof MaterialMode];
export const MATERIAL_MODES = [MaterialMode.EVERY_CYCLE, MaterialMode.IF_NEEDED] as const;

export const WorkType = {
  PLANNED_MAINTENANCE: 'PLANNED_MAINTENANCE',
  EMERGENCY_REPAIR: 'EMERGENCY_REPAIR',
} as const;
export type WorkType = (typeof WorkType)[keyof typeof WorkType];
export const WORK_TYPES = [WorkType.PLANNED_MAINTENANCE, WorkType.EMERGENCY_REPAIR] as const;

/** P0 safety, P1 stopped, P2 fault without a stop, P3 planned (TZ-M §12). */
export const WorkPriority = { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' } as const;
export type WorkPriority = (typeof WorkPriority)[keyof typeof WorkPriority];
export const WORK_PRIORITIES = [
  WorkPriority.P0,
  WorkPriority.P1,
  WorkPriority.P2,
  WorkPriority.P3,
] as const;

export const WorkStatus = {
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING: 'WAITING',
  IN_REVIEW: 'IN_REVIEW',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type WorkStatus = (typeof WorkStatus)[keyof typeof WorkStatus];
export const WORK_STATUSES = [
  WorkStatus.ASSIGNED,
  WorkStatus.IN_PROGRESS,
  WorkStatus.WAITING,
  WorkStatus.IN_REVIEW,
  WorkStatus.COMPLETED,
  WorkStatus.CANCELLED,
] as const;
export const FINAL_WORK_STATUSES: readonly WorkStatus[] = [
  WorkStatus.COMPLETED,
  WorkStatus.CANCELLED,
];

export function isOpenWork(status: WorkStatus): boolean {
  return !FINAL_WORK_STATUSES.includes(status);
}

export const OperationResult = {
  DONE: 'DONE',
  NOT_DONE: 'NOT_DONE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const;
export type OperationResult = (typeof OperationResult)[keyof typeof OperationResult];
export const OPERATION_RESULTS = [
  OperationResult.DONE,
  OperationResult.NOT_DONE,
  OperationResult.NOT_APPLICABLE,
] as const;

export const WaitReason = {
  NO_PART: 'NO_PART',
  NEED_SPECIALIST: 'NEED_SPECIALIST',
  WAITING_WINDOW: 'WAITING_WINDOW',
  OTHER: 'OTHER',
} as const;
export type WaitReason = (typeof WaitReason)[keyof typeof WaitReason];
export const WAIT_REASONS = [
  WaitReason.NO_PART,
  WaitReason.NEED_SPECIALIST,
  WaitReason.WAITING_WINDOW,
  WaitReason.OTHER,
] as const;

export const MaterialsReadiness = {
  UNKNOWN: 'UNKNOWN',
  READY: 'READY',
  MISSING: 'MISSING',
} as const;
export type MaterialsReadiness = (typeof MaterialsReadiness)[keyof typeof MaterialsReadiness];
export const MATERIALS_READINESS = [
  MaterialsReadiness.UNKNOWN,
  MaterialsReadiness.READY,
  MaterialsReadiness.MISSING,
] as const;

export const ReviewDecision = { ACCEPTED: 'ACCEPTED', RETURNED: 'RETURNED' } as const;
export type ReviewDecision = (typeof ReviewDecision)[keyof typeof ReviewDecision];
export const REVIEW_DECISIONS = [ReviewDecision.ACCEPTED, ReviewDecision.RETURNED] as const;

export const ReleaseMode = { AVAILABLE: 'AVAILABLE', RESTRICTED: 'RESTRICTED' } as const;
export type ReleaseMode = (typeof ReleaseMode)[keyof typeof ReleaseMode];
export const RELEASE_MODES = [ReleaseMode.AVAILABLE, ReleaseMode.RESTRICTED] as const;

/** Whether a stop episode started at the report time or at a confirmed moment. */
export const StopStartQuality = { FROM_REPORT: 'FROM_REPORT', CONFIRMED: 'CONFIRMED' } as const;
export type StopStartQuality = (typeof StopStartQuality)[keyof typeof StopStartQuality];
export const STOP_START_QUALITIES = [
  StopStartQuality.FROM_REPORT,
  StopStartQuality.CONFIRMED,
] as const;
