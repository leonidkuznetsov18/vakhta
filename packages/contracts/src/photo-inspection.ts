import { z } from 'zod';
import { ChecklistPhotoRuleView } from './checklist-photo-rules.js';
import { Uuid } from './common.js';

export const INSPECTION_MODEL = '@cf/google/gemma-4-26b-a4b-it';
/** Tiled search driven by the checklist object list; see apps/worker photo-inspection. */
export const INSPECTION_PROMPT_VERSION = 'workplace-v3';
const coordinate = z.number().finite().min(0).max(1);
export const InspectionGeometry = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('RECTANGLE'),
      x: coordinate,
      y: coordinate,
      width: coordinate.positive(),
      height: coordinate.positive(),
    })
    .refine(
      (v) => v.x + v.width <= 1.000001 && v.y + v.height <= 1.000001,
      'Rectangle must fit the image',
    ),
  z.object({
    type: z.literal('POLYGON'),
    points: z
      .array(z.tuple([coordinate, coordinate]))
      .min(3)
      .max(100),
  }),
]);
/** Legacy per-region category; new regions reference the object catalog instead. */
export const InspectionCategory = z.enum([
  'DIRT',
  'RAG',
  'MISPLACED_TOOL',
  'OBSTRUCTION',
  'EQUIPMENT_STATE',
  'OTHER',
]);
/** What the marked object means for the workplace rule: the label a policy model learns from. */
export const RegionVerdict = z.enum(['VIOLATION', 'ALLOWED', 'UNSURE']);
export type RegionVerdict = z.infer<typeof RegionVerdict>;
export const InspectionAnnotation = z
  .object({
    id: Uuid,
    geometry: InspectionGeometry,
    category: InspectionCategory.default('OTHER'),
    /** Catalog identity; null for legacy regions or a free-text "other" object. */
    objectId: Uuid.nullable().default(null),
    objectName: z.string().trim().min(1).max(100).optional(),
    verdict: RegionVerdict.default('VIOLATION'),
    comment: z.string().trim().max(2000).default(''),
    sourceRunId: Uuid.nullable().default(null),
    // Index in the immutable source run, retained when the human edits the region.
    sourceFindingIndex: z.number().int().min(0).max(29).optional(),
  })
  .refine((a) => Boolean(a.objectId || a.objectName || a.comment), {
    path: ['objectId'],
    message: 'Choose the marked object or keep its existing description',
  });
export type InspectionAnnotation = z.infer<typeof InspectionAnnotation>;
export const NotAssessableReason = z.enum([
  'BLURRY',
  'DARK',
  'WRONG_ANGLE',
  'OBSTRUCTED',
  'WRONG_ZONE',
  'OTHER',
]);
export type NotAssessableReason = z.infer<typeof NotAssessableReason>;
export const RejectionReason = z.enum(['NOT_PRESENT', 'WRONG_OBJECT', 'ALLOWED', 'WRONG_LOCATION']);
export type RejectionReason = z.infer<typeof RejectionReason>;
/** An explicit "no" to a model finding: the false-positive label precision is measured from. */
export const RejectedFinding = z.object({
  runId: Uuid,
  index: z.number().int().min(0).max(29),
  reason: RejectionReason,
});
export type RejectedFinding = z.infer<typeof RejectedFinding>;
export const ReviewStatus = z.enum(['UNREVIEWED', 'COMPLIANT', 'PROBLEMS', 'NOT_ASSESSABLE']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;
/**
 * The photo outcome follows from the regions: any violation is a problem, an unsure region keeps
 * the photo unreviewed, otherwise the photo is compliant. Not assessable is the reviewer's choice.
 */
export function reviewOutcome(
  annotations: readonly Pick<InspectionAnnotation, 'verdict'>[],
  notAssessable: boolean,
): ReviewStatus {
  if (notAssessable) return 'NOT_ASSESSABLE';
  if (annotations.some((a) => a.verdict === 'VIOLATION')) return 'PROBLEMS';
  if (annotations.some((a) => a.verdict === 'UNSURE')) return 'UNREVIEWED';
  return 'COMPLIANT';
}
const reviewShape = z.object({
  status: ReviewStatus,
  comment: z.string().trim().max(4000).default(''),
  /** Legacy free-text requirements; no longer edited. */
  guidance: z.string().trim().max(4000).default(''),
  annotations: z.array(InspectionAnnotation).max(100),
  notAssessableReason: NotAssessableReason.optional(),
  /** A saved clean photo the master chose as the example of how this photo point should look. */
  isReference: z.boolean().default(false),
  rejectedFindings: z.array(RejectedFinding).max(300).default([]),
});
function checkIdentity(v: z.infer<typeof reviewShape>, ctx: z.RefinementCtx) {
  const sources = new Set<string>();
  for (const [index, annotation] of v.annotations.entries()) {
    if (annotation.sourceFindingIndex === undefined) continue;
    const source = `${annotation.sourceRunId}:${annotation.sourceFindingIndex}`;
    if (!annotation.sourceRunId || sources.has(source))
      ctx.addIssue({
        code: 'custom',
        path: ['annotations', index, 'sourceFindingIndex'],
        message: 'A finding requires a source run and can only be added once',
      });
    sources.add(source);
  }
  if (new Set(v.annotations.map((a) => a.id)).size !== v.annotations.length)
    ctx.addIssue({
      code: 'custom',
      path: ['annotations'],
      message: 'Annotation IDs must be unique',
    });
  if (
    new Set(v.rejectedFindings.map((r) => `${r.runId}:${r.index}`)).size !==
    v.rejectedFindings.length
  )
    ctx.addIssue({ code: 'custom', path: ['rejectedFindings'], message: 'Duplicate rejection' });
  if (v.rejectedFindings.some((r) => sources.has(`${r.runId}:${r.index}`)))
    ctx.addIssue({
      code: 'custom',
      path: ['rejectedFindings'],
      message: 'A finding cannot be both accepted and rejected',
    });
}
/** Stored reviews, including historical ones saved before verdicts and reasons existed. */
export const InspectionReview = reviewShape.superRefine(checkIdentity);
export type InspectionReview = z.infer<typeof InspectionReview>;
/** A review being saved now: the outcome must follow from the regions and reasons must be stated. */
export const InspectionReviewInput = reviewShape.superRefine((v, ctx) => {
  checkIdentity(v, ctx);
  const expected = reviewOutcome(v.annotations, v.status === 'NOT_ASSESSABLE');
  if (v.status !== expected)
    ctx.addIssue({
      code: 'custom',
      path: ['status'],
      message: `Outcome must be ${expected} for these regions`,
    });
  if (v.status === 'NOT_ASSESSABLE') {
    if (!v.notAssessableReason)
      ctx.addIssue({ code: 'custom', path: ['notAssessableReason'], message: 'Choose a reason' });
    if (v.notAssessableReason === 'OTHER' && !v.comment)
      ctx.addIssue({ code: 'custom', path: ['comment'], message: 'Explain why' });
  }
  if (v.isReference && v.status !== 'COMPLIANT')
    ctx.addIssue({
      code: 'custom',
      path: ['isReference'],
      message: 'Only a compliant photo can be a reference',
    });
});
export const SaveInspection = z.object({
  version: z.number().int().nonnegative(),
  review: InspectionReviewInput,
  /** Milliseconds from opening the editor to this save; review-time evidence, not review content. */
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
});
export type SaveInspection = z.infer<typeof SaveInspection>;
export const InspectionContext = z.object({
  schemaVersion: z.literal(1),
  handoverId: Uuid,
  mediaId: Uuid,
  itemKey: z.string(),
  checklistDefinitionId: Uuid,
  checklistVersion: z.number().int().positive(),
  photoLabel: z.string(),
  checklist: z.array(z.object({ key: z.string(), label: z.string() })),
  zoneId: Uuid.nullable(),
  zoneName: z.string().nullable(),
  shiftSessionId: Uuid,
  businessDate: z.string(),
  sha256: z.string(),
  encodedWidth: z.number().int().positive(),
  encodedHeight: z.number().int().positive(),
  contentType: z.string(),
  orientationPolicy: z.literal('EXIF_AUTO_ORIENT'),
});
export type InspectionContext = z.infer<typeof InspectionContext>;
export const InspectionFinding = z.object({
  category: InspectionCategory.default('OTHER'),
  /** The checklist object the model matched; null only in historical runs. */
  objectId: Uuid.nullable().default(null),
  objectName: z.string().trim().max(100).optional(),
  comment: z.string().trim().min(1).max(2000),
  geometry: InspectionGeometry.nullable(),
});
export type InspectionFinding = z.infer<typeof InspectionFinding>;
export const InspectionPrediction = z
  .object({
    status: z.enum(['COMPLIANT', 'PROBLEMS', 'NOT_ASSESSABLE']),
    summary: z.string().trim().max(4000).default(''),
    limitations: z.string().max(4000).default(''),
    findings: z.array(InspectionFinding).max(30),
  })
  .refine((v) => v.status !== 'PROBLEMS' || v.findings.length > 0, 'Problems require findings')
  .refine(
    (v) => v.status !== 'COMPLIANT' || !v.findings.length,
    'Compliant result cannot contain findings',
  );
export type InspectionPrediction = z.infer<typeof InspectionPrediction>;
/** Did this run help the reviewer? Recorded per run so usefulness can be read per zone and model version. */
export const AiFeedbackRating = z.enum(['HELPFUL', 'PARTIAL', 'NOT_HELPFUL']);
export type AiFeedbackRating = z.infer<typeof AiFeedbackRating>;
export const SaveRunFeedback = z.object({
  rating: AiFeedbackRating,
  comment: z.string().trim().max(500).optional(),
});
export type SaveRunFeedback = z.infer<typeof SaveRunFeedback>;
export const RunFeedbackView = z.object({
  rating: AiFeedbackRating,
  comment: z.string().nullable(),
});
export type RunFeedbackView = z.infer<typeof RunFeedbackView>;
export const InspectionRunView = z.object({
  id: Uuid,
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED']),
  model: z.string(),
  promptVersion: z.string(),
  requestedAt: z.string(),
  completedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  prediction: InspectionPrediction.nullable(),
  reviewVersion: z.number().int().nonnegative(),
  /** The current reviewer's rating of this run, when given. */
  feedback: RunFeedbackView.nullable().default(null),
});
export type InspectionRunView = z.infer<typeof InspectionRunView>;
export const PhotoInspectionView = z.object({
  /** Current checklist/zone object list; the analysis snapshot is taken server-side. */
  rules: z.array(ChecklistPhotoRuleView),
  context: InspectionContext,
  version: z.number().int().nonnegative(),
  review: InspectionReview,
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
  canEdit: z.boolean(),
  runs: z.array(InspectionRunView),
});
export type PhotoInspectionView = z.infer<typeof PhotoInspectionView>;
export const RequestInspectionAnalysis = z.object({
  requestId: Uuid,
  version: z.number().int().nonnegative(),
});
export type RequestInspectionAnalysis = z.infer<typeof RequestInspectionAnalysis>;
