import { z } from 'zod';
import {
  ANCHOR_MODES,
  EQUIPMENT_CRITICALITIES,
  EQUIPMENT_DOCUMENT_KINDS,
  EQUIPMENT_STATES,
  INTERVAL_UNITS,
  MAINTENANCE_TEMPLATES,
  MATERIALS_READINESS,
  MATERIAL_KINDS,
  MATERIAL_MODES,
  NOTICE_DELIVERIES,
  OPERATION_RESULTS,
  PLAN_DIFF_FIELDS,
  PLAN_SOURCE_KINDS,
  PLAN_STATES,
  PlanState,
  RELEASE_MODES,
  REVIEW_DECISIONS,
  ReleaseMode,
  ReviewDecision,
  WAIT_REASONS,
  WORK_PRIORITIES,
  WORK_STATUSES,
  WORK_TYPES,
} from '@vakhta/domain';
import { BusinessDate, ExpectedVersion, IsoDateTime, Uuid } from './common.js';

/** Equipment maintenance (spec 014): panel commands and views. */

export const EquipmentCriticalitySchema = z.enum(EQUIPMENT_CRITICALITIES);
export const EquipmentStateSchema = z.enum(EQUIPMENT_STATES);
export const EquipmentDocumentKindSchema = z.enum(EQUIPMENT_DOCUMENT_KINDS);
export const PlanStateSchema = z.enum(PLAN_STATES);
export const IntervalUnitSchema = z.enum(INTERVAL_UNITS);
export const AnchorModeSchema = z.enum(ANCHOR_MODES);
export const PlanSourceKindSchema = z.enum(PLAN_SOURCE_KINDS);
export const MaterialKindSchema = z.enum(MATERIAL_KINDS);
export const MaterialModeSchema = z.enum(MATERIAL_MODES);
export const WorkTypeSchema = z.enum(WORK_TYPES);
export const WorkPrioritySchema = z.enum(WORK_PRIORITIES);
export const WorkStatusSchema = z.enum(WORK_STATUSES);
export const OperationResultSchema = z.enum(OPERATION_RESULTS);
export const WaitReasonSchema = z.enum(WAIT_REASONS);
export const MaterialsReadinessSchema = z.enum(MATERIALS_READINESS);
export const ReviewDecisionSchema = z.enum(REVIEW_DECISIONS);
export const ReleaseModeSchema = z.enum(RELEASE_MODES);
export const MaintenanceTemplateSchema = z.enum(MAINTENANCE_TEMPLATES);
export const NoticeDeliverySchema = z.enum(NOTICE_DELIVERIES);
export const PlanDiffFieldSchema = z.enum(PLAN_DIFF_FIELDS);

const Text = (max: number) => z.string().trim().min(1).max(max);
const OptionalText = (max: number) => z.string().trim().max(max).optional();
const Reason = Text(500);

export const PersonRef = z.object({ id: Uuid, fullName: z.string() });
export type PersonRef = z.infer<typeof PersonRef>;

export const EquipmentInput = z.object({
  code: Text(40),
  name: Text(200),
  orgUnitId: Uuid,
  zoneId: Uuid.nullable().optional(),
  equipmentType: OptionalText(120),
  manufacturer: OptionalText(200),
  model: OptionalText(200),
  serialNumber: OptionalText(120),
  manufacturedYear: z.number().int().min(1900).max(2100).nullable().optional(),
  commissionedOn: BusinessDate.nullable().optional(),
  criticality: EquipmentCriticalitySchema,
  responsibleEmployeeId: Uuid,
  backupEmployeeId: Uuid.nullable().optional(),
  notes: OptionalText(2000),
});
export type EquipmentInput = z.infer<typeof EquipmentInput>;

export const EquipmentUpdate = EquipmentInput.extend({
  expectedVersion: ExpectedVersion,
  /** Move open planned work to the new responsible mechanic (AC-006); default yes. */
  reassignOpenWork: z.boolean().default(true),
});
export type EquipmentUpdate = z.infer<typeof EquipmentUpdate>;

export const ReasonCommand = z.object({ reason: Reason });
export type ReasonCommand = z.infer<typeof ReasonCommand>;

/** Pause, resume or archive a published plan; stopping planned work needs a reason (FR-025). */
export const PlanStateCommand = z
  .object({
    state: z.enum([PlanState.ACTIVE, PlanState.PAUSED, PlanState.ARCHIVED]),
    reason: Reason.optional(),
  })
  .refine((c) => c.state === PlanState.ACTIVE || c.reason !== undefined, {
    path: ['reason'],
    message: 'A reason is required',
  });
export type PlanStateCommand = z.infer<typeof PlanStateCommand>;

export const EquipmentQuery = z.object({
  unitId: Uuid.optional(),
  state: EquipmentStateSchema.optional(),
  q: z.string().trim().max(100).optional(),
  // A query string carries "false" as text; coercion would read any text as true.
  archived: z.stringbool().default(false),
});
export type EquipmentQuery = z.infer<typeof EquipmentQuery>;

export const NextMaintenanceView = z.object({
  workOrderId: Uuid,
  title: z.string(),
  dueOn: BusinessDate,
  plannedOn: BusinessDate,
  overdue: z.boolean(),
  readiness: MaterialsReadinessSchema,
});
export type NextMaintenanceView = z.infer<typeof NextMaintenanceView>;

export const EquipmentRow = z.object({
  id: Uuid,
  code: z.string(),
  name: z.string(),
  equipmentType: z.string().nullable(),
  model: z.string().nullable(),
  siteId: Uuid,
  orgUnitId: Uuid,
  unitName: z.string(),
  zoneId: Uuid.nullable(),
  zoneName: z.string().nullable(),
  state: EquipmentStateSchema,
  stateChangedAt: IsoDateTime,
  restriction: z.string().nullable(),
  criticality: EquipmentCriticalitySchema,
  responsible: PersonRef,
  backup: PersonRef.nullable(),
  nextMaintenance: NextMaintenanceView.nullable(),
  activeEmergency: z.object({ workOrderId: Uuid, number: z.number().int() }).nullable(),
  archivedAt: IsoDateTime.nullable(),
  version: z.number().int().positive(),
});
export type EquipmentRow = z.infer<typeof EquipmentRow>;

export const EquipmentDocumentView = z.object({
  id: Uuid,
  title: z.string(),
  kind: EquipmentDocumentKindSchema,
  language: z.string().nullable(),
  edition: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  /** Null for a document kept only as a link to the manufacturer's site. */
  sizeBytes: z.number().int().positive().nullable(),
  hasFile: z.boolean(),
  uploadedBy: z.string(),
  createdAt: IsoDateTime,
  linkedAt: IsoDateTime,
});
export type EquipmentDocumentView = z.infer<typeof EquipmentDocumentView>;

export const LibraryDocumentView = EquipmentDocumentView.omit({ linkedAt: true }).extend({
  equipmentCodes: z.array(z.string()),
});
export type LibraryDocumentView = z.infer<typeof LibraryDocumentView>;

export const DocumentUploadQuery = z.object({
  title: Text(200),
  kind: EquipmentDocumentKindSchema,
  language: z.string().trim().max(10).optional(),
  edition: OptionalText(120),
  sourceUrl: z
    .string()
    .trim()
    .max(1000)
    .regex(/^https?:\/\//)
    .optional(),
});
export type DocumentUploadQuery = z.infer<typeof DocumentUploadQuery>;

/** A document that lives on the web: the machine keeps the link, not a file (FR-008). */
export const DocumentLinkInput = DocumentUploadQuery.extend({
  sourceUrl: z
    .string()
    .trim()
    .max(1000)
    .regex(/^https?:\/\//),
});
export type DocumentLinkInput = z.infer<typeof DocumentLinkInput>;

export const DocumentLinkView = z.object({ url: z.string(), expiresAt: IsoDateTime });
export type DocumentLinkView = z.infer<typeof DocumentLinkView>;

export const PlanOperationInput = z.object({
  text: Text(500),
  place: OptionalText(200),
  photoRequired: z.boolean().default(false),
});
export type PlanOperationInput = z.infer<typeof PlanOperationInput>;

export const PlanMaterialInput = z.object({
  kind: MaterialKindSchema,
  name: Text(200),
  article: OptionalText(120),
  quantity: z.number().positive().max(1_000_000),
  unit: Text(20),
  mode: MaterialModeSchema,
});
export type PlanMaterialInput = z.infer<typeof PlanMaterialInput>;

/** A draft may be incomplete; publication checks it (FR-022). */
export const PlanContent = z.object({
  title: Text(200),
  intervalUnit: IntervalUnitSchema,
  intervalCount: z.number().int().min(1).max(3650),
  anchorMode: AnchorModeSchema,
  firstDueOn: BusinessDate.nullable(),
  sourceKind: PlanSourceKindSchema,
  sourceDocumentId: Uuid.nullable(),
  sourceReference: OptionalText(200),
  sourceNote: OptionalText(2000),
  estimatedMinutes: z.number().int().min(1).max(10_000),
  requiresStop: z.boolean(),
  assigneeEmployeeId: Uuid.nullable(),
  /** Days before the planned date for this plan's reminders; null follows the client parameters. */
  reminderDays: z.array(z.number().int().min(1).max(90)).max(5).nullable().default(null),
  operations: z.array(PlanOperationInput).max(100),
  materials: z.array(PlanMaterialInput).max(100),
});
export type PlanContent = z.infer<typeof PlanContent>;

/** The master or chief mechanic answers for the materials from the panel (owner decision 2026-09-25). */
export const WorkReadinessCommand = z.object({
  ready: z.boolean(),
  note: OptionalText(500),
});
export type WorkReadinessCommand = z.infer<typeof WorkReadinessCommand>;

export const PlanSaveCommand = PlanContent.extend({ expectedVersion: ExpectedVersion.optional() });
export type PlanSaveCommand = z.infer<typeof PlanSaveCommand>;

export const PlanRow = z.object({
  id: Uuid,
  title: z.string(),
  state: PlanStateSchema,
  intervalUnit: IntervalUnitSchema,
  intervalCount: z.number().int(),
  anchorMode: AnchorModeSchema,
  lastPerformedOn: BusinessDate.nullable(),
  nextDueOn: BusinessDate.nullable(),
  readiness: MaterialsReadinessSchema.nullable(),
  sourceLabel: z.string(),
  hasDraft: z.boolean(),
});
export type PlanRow = z.infer<typeof PlanRow>;

export const PlanDetail = z.object({
  id: Uuid,
  equipmentId: Uuid,
  state: PlanStateSchema,
  stateReason: z.string().nullable(),
  /** The published content that generates work; null before the first publication. */
  active: PlanContent.nullable(),
  activeRevision: z.number().int().nullable(),
  /** The editable next version; null when there is nothing unpublished. */
  draft: PlanContent.nullable(),
  version: z.number().int().positive(),
});
export type PlanDetail = z.infer<typeof PlanDetail>;

/** The tenant's reminder rule, for the plan editor's schedule preview (spec A-4, FR-040). */
export const MaintenancePolicyView = z.object({
  reminderOffsets: z.array(z.number().int().positive()),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/),
});
export type MaintenancePolicyView = z.infer<typeof MaintenancePolicyView>;

export const PlanIssue = z.object({ field: z.string(), code: z.string() });
export type PlanIssue = z.infer<typeof PlanIssue>;

/** Queue filters of the Work tab. */
export const WorkViewCode = {
  URGENT: 'URGENT',
  TODAY: 'TODAY',
  REVIEW: 'REVIEW',
  ALL: 'ALL',
} as const;
export const WorkView = z.enum([
  WorkViewCode.URGENT,
  WorkViewCode.TODAY,
  WorkViewCode.REVIEW,
  WorkViewCode.ALL,
]);
export type WorkView = z.infer<typeof WorkView>;

export const WorkQuery = z.object({
  view: WorkView.default('ALL'),
  equipmentId: Uuid.optional(),
  mechanicId: Uuid.optional(),
});
export type WorkQuery = z.infer<typeof WorkQuery>;

export const WorkRow = z.object({
  id: Uuid,
  number: z.number().int(),
  type: WorkTypeSchema,
  priority: WorkPrioritySchema,
  status: WorkStatusSchema,
  title: z.string(),
  equipment: z.object({
    id: Uuid,
    code: z.string(),
    name: z.string(),
    model: z.string().nullable(),
  }),
  assignee: PersonRef,
  dueOn: BusinessDate.nullable(),
  plannedOn: BusinessDate.nullable(),
  overdue: z.boolean(),
  readiness: MaterialsReadinessSchema,
  reportedAt: IsoDateTime.nullable(),
  ackDueAt: IsoDateTime.nullable(),
  acceptedAt: IsoDateTime.nullable(),
});
export type WorkRow = z.infer<typeof WorkRow>;

export const WorkOperationView = z.object({
  id: Uuid,
  ordinal: z.number().int(),
  text: z.string(),
  place: z.string().nullable(),
  photoRequired: z.boolean(),
  answer: z
    .object({
      result: OperationResultSchema,
      reason: z.string().nullable(),
      mediaObjectId: Uuid.nullable(),
      answeredAt: IsoDateTime,
      answeredBy: z.string(),
    })
    .nullable(),
});
export type WorkOperationView = z.infer<typeof WorkOperationView>;

export const WorkMaterialView = PlanMaterialInput.extend({ id: Uuid });
export type WorkMaterialView = z.infer<typeof WorkMaterialView>;

export const WorkHistoryItem = z.object({
  at: IsoDateTime,
  type: z.string(),
  actor: z.string().nullable(),
  comment: z.string().nullable(),
});
export type WorkHistoryItem = z.infer<typeof WorkHistoryItem>;

/** One notice about this work and whether it reached the person (FR-043). */
export const WorkDeliveryView = z.object({
  id: Uuid,
  template: MaintenanceTemplateSchema,
  recipient: z.string(),
  status: NoticeDeliverySchema,
  createdAt: IsoDateTime,
  sentAt: IsoDateTime.nullable(),
});
export type WorkDeliveryView = z.infer<typeof WorkDeliveryView>;

export const WorkDetail = WorkRow.extend({
  description: z.string().nullable(),
  lead: PersonRef.nullable(),
  /** The machine's backup mechanic, who gets an unaccepted repair (FR-063). */
  backup: PersonRef.nullable(),
  planId: Uuid.nullable(),
  planRevision: z.number().int().nullable(),
  estimatedMinutes: z.number().int().nullable(),
  requiresStop: z.boolean().nullable(),
  sourceLabel: z.string().nullable(),
  operations: z.array(WorkOperationView),
  materials: z.array(WorkMaterialView),
  readinessNote: z.string().nullable(),
  startedAt: IsoDateTime.nullable(),
  submittedAt: IsoDateTime.nullable(),
  performedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
  /** When an unaccepted repair is escalated to the panel (FR-063). */
  escalateAt: IsoDateTime.nullable(),
  /** "Unit · zone" of the machine. */
  location: z.string(),
  /** How the plan counts the next date; null for repairs. */
  anchorMode: AnchorModeSchema.nullable(),
  cancelReason: z.string().nullable(),
  summary: z.string().nullable(),
  cause: z.string().nullable(),
  partsUsed: z.string().nullable(),
  performedBy: PersonRef.nullable(),
  /** The panel user who recorded the work on the performer's behalf (FR-054, AC-039). */
  enteredBy: z.string().nullable(),
  /** The plan's active revision when it is newer than this work's snapshot (FR-023). */
  newerPlanRevision: z.number().int().nullable(),
  deliveries: z.array(WorkDeliveryView),
  reviews: z.array(
    z.object({
      iteration: z.number().int(),
      decision: ReviewDecisionSchema,
      comment: z.string().nullable(),
      reviewer: z.string(),
      reviewedAt: IsoDateTime,
    }),
  ),
  incident: z
    .object({
      id: Uuid,
      reasonLabel: z.string(),
      comment: z.string().nullable(),
      reportedBy: z.string().nullable(),
    })
    .nullable(),
  stop: z
    .object({
      startedAt: IsoDateTime,
      releasedAt: IsoDateTime.nullable(),
    })
    .nullable(),
  equipmentState: EquipmentStateSchema,
  history: z.array(WorkHistoryItem),
  /** The next due date the acceptance would set; only for a planned maintenance in review. */
  nextDueOnAfterAccept: BusinessDate.nullable(),
  version: z.number().int().positive(),
});
export type WorkDetail = z.infer<typeof WorkDetail>;

export const ReplanCommand = z.object({ plannedOn: BusinessDate, reason: Reason });
export type ReplanCommand = z.infer<typeof ReplanCommand>;

export const ReviewCommand = z
  .object({ decision: ReviewDecisionSchema, comment: z.string().trim().max(2000).optional() })
  .refine((c) => c.decision === ReviewDecision.ACCEPTED || (c.comment?.length ?? 0) > 0, {
    message: 'A returned review needs a comment',
    path: ['comment'],
  });
export type ReviewCommand = z.infer<typeof ReviewCommand>;

export const ReassignCommand = z.object({ employeeId: Uuid, reason: Reason });
export type ReassignCommand = z.infer<typeof ReassignCommand>;

export const CalendarQuery = z.object({
  from: BusinessDate,
  to: BusinessDate,
  unitId: Uuid.optional(),
  mechanicId: Uuid.optional(),
  equipmentId: Uuid.optional(),
});
export type CalendarQuery = z.infer<typeof CalendarQuery>;

export const CalendarItem = z.object({
  workOrderId: Uuid,
  number: z.number().int(),
  type: WorkTypeSchema,
  date: BusinessDate,
  dueOn: BusinessDate.nullable(),
  equipmentCode: z.string(),
  equipmentName: z.string(),
  equipmentModel: z.string().nullable(),
  title: z.string(),
  assignee: z.string(),
  status: WorkStatusSchema,
  overdue: z.boolean(),
  readiness: MaterialsReadinessSchema,
});
export type CalendarItem = z.infer<typeof CalendarItem>;

export const CalendarForecast = z.object({
  planId: Uuid,
  equipmentId: Uuid,
  date: BusinessDate,
  equipmentCode: z.string(),
  title: z.string(),
});
export type CalendarForecast = z.infer<typeof CalendarForecast>;

export const MaintenanceCalendarView = z.object({
  today: BusinessDate,
  items: z.array(CalendarItem),
  forecast: z.array(CalendarForecast),
  overdue: z.array(CalendarItem),
});
export type MaintenanceCalendarView = z.infer<typeof MaintenanceCalendarView>;

export const EmergencyCreateCommand = z.object({
  description: Text(2000),
  stoppedWork: z.boolean(),
  safety: z.boolean().default(false),
});
export type EmergencyCreateCommand = z.infer<typeof EmergencyCreateCommand>;

export const ReleaseCommand = z
  .object({ mode: ReleaseModeSchema, condition: z.string().trim().max(1000).optional() })
  .refine((c) => c.mode === ReleaseMode.AVAILABLE || (c.condition?.length ?? 0) > 0, {
    message: 'A restricted release needs a condition',
    path: ['condition'],
  });
export type ReleaseCommand = z.infer<typeof ReleaseCommand>;

export const MechanicOption = z.object({
  id: Uuid,
  fullName: z.string(),
  positionName: z.string(),
  orgUnitId: Uuid.nullable(),
  telegramLinked: z.boolean(),
});
export type MechanicOption = z.infer<typeof MechanicOption>;

/** One item a plan needs, read across the machine's plans (owner request 2026-09-25). */
export const EquipmentMaterialView = z.object({
  planId: Uuid,
  planTitle: z.string(),
  planState: PlanStateSchema,
  nextDueOn: BusinessDate.nullable(),
  kind: MaterialKindSchema,
  name: z.string(),
  article: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  mode: MaterialModeSchema,
});
export type EquipmentMaterialView = z.infer<typeof EquipmentMaterialView>;

export const EquipmentDetail = EquipmentRow.extend({
  manufacturer: z.string().nullable(),
  serialNumber: z.string().nullable(),
  manufacturedYear: z.number().int().nullable(),
  commissionedOn: BusinessDate.nullable(),
  notes: z.string().nullable(),
  documents: z.array(EquipmentDocumentView),
  plans: z.array(PlanRow),
  materials: z.array(EquipmentMaterialView),
  openStop: z.object({ startedAt: IsoDateTime }).nullable(),
  history: z.array(WorkHistoryItem),
});
export type EquipmentDetail = z.infer<typeof EquipmentDetail>;

export const MaintenanceSummary = z.object({
  openEmergencies: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  inReview: z.number().int().nonnegative(),
});
export type MaintenanceSummary = z.infer<typeof MaintenanceSummary>;

const OperationFacts = z.object({
  text: z.string(),
  place: z.string().nullable(),
  photoRequired: z.boolean(),
});
const MaterialFacts = z.object({
  kind: MaterialKindSchema,
  name: z.string(),
  article: z.string().nullable(),
  quantity: z.number(),
  unit: z.string(),
  mode: MaterialModeSchema,
});

/** What applying the plan's newer version would change for an open work item (AC-015). */
export const PlanVersionDiffView = z.object({
  fromRevision: z.number().int(),
  toRevision: z.number().int(),
  fields: z.array(PlanDiffFieldSchema),
  operations: z.object({ added: z.array(OperationFacts), removed: z.array(OperationFacts) }),
  materials: z.object({ added: z.array(MaterialFacts), removed: z.array(MaterialFacts) }),
});
export type PlanVersionDiffView = z.infer<typeof PlanVersionDiffView>;

export const ApplyPlanVersionCommand = z.object({ expectedVersion: ExpectedVersion });
export type ApplyPlanVersionCommand = z.infer<typeof ApplyPlanVersionCommand>;

/** Copy a plan to another machine as a draft (FR-026, AC-018). */
export const PlanCopyCommand = z.object({ equipmentId: Uuid });
export type PlanCopyCommand = z.infer<typeof PlanCopyCommand>;

/** How the performer confirms the materials used on planned maintenance (FR-051). */
export const MaterialsUsedKind = { AS_PLANNED: 'AS_PLANNED', OTHER: 'OTHER' } as const;
export type MaterialsUsedKind = (typeof MaterialsUsedKind)[keyof typeof MaterialsUsedKind];
export const MaterialsUsed = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(MaterialsUsedKind.AS_PLANNED) }),
  z.object({ kind: z.literal(MaterialsUsedKind.OTHER), text: Text(2000) }),
]);
export type MaterialsUsed = z.infer<typeof MaterialsUsed>;

export const RecordedAnswer = z.object({
  ordinal: z.number().int().positive(),
  result: OperationResultSchema,
  reason: OptionalText(500),
});
export type RecordedAnswer = z.infer<typeof RecordedAnswer>;

/**
 * Work done on paper, entered by the chief mechanic for the performer (FR-054, AC-039). It goes
 * to review like a submission from the bot; required photos cannot exist and are not asked for.
 */
export const RecordCompletionCommand = z.object({
  expectedVersion: ExpectedVersion,
  performerId: Uuid,
  performedOn: BusinessDate,
  answers: z.array(RecordedAnswer).min(1).max(100),
  materialsUsed: MaterialsUsed.nullable(),
});
export type RecordCompletionCommand = z.infer<typeof RecordCompletionCommand>;

/** A reasoned correction of a machine's operating state by the chief mechanic (FR-005). */
export const StateCorrectionCommand = z.object({
  state: EquipmentStateSchema,
  reason: Reason,
  expectedVersion: ExpectedVersion,
});
export type StateCorrectionCommand = z.infer<typeof StateCorrectionCommand>;
