import { z } from 'zod';
import { ProhibitedPhotoItems } from './checklist-photo-rules.js';

export const INSPECTION_MODEL = '@cf/google/gemma-4-26b-a4b-it';
export const INSPECTION_PROMPT_VERSION = 'workplace-v1';
export const AUTOMATIC_INSPECTION_PROMPT_VERSION = 'workplace-prohibited-v1';
export const AUTOMATIC_INSPECTION_ACTOR = 'SYSTEM_AUTO_INSPECTION';
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
export const InspectionCategory = z.enum([
  'DIRT',
  'RAG',
  'MISPLACED_TOOL',
  'OBSTRUCTION',
  'EQUIPMENT_STATE',
  'OTHER',
]);
export const InspectionAnnotation = z.object({
  id: z.uuid(),
  geometry: InspectionGeometry,
  category: InspectionCategory,
  comment: z.string().trim().min(1).max(2000),
  sourceRunId: z.uuid().nullable().default(null),
  // Index in the immutable source run, retained when the human edits the region.
  sourceFindingIndex: z.number().int().min(0).max(29).optional(),
});
export type InspectionAnnotation = z.infer<typeof InspectionAnnotation>;
export const InspectionReview = z
  .object({
    status: z.enum(['UNREVIEWED', 'COMPLIANT', 'PROBLEMS', 'NOT_ASSESSABLE']),
    comment: z.string().trim().max(4000),
    guidance: z.string().trim().max(4000),
    annotations: z.array(InspectionAnnotation).max(100),
  })
  .superRefine((v, ctx) => {
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
    if (v.status === 'COMPLIANT' && v.annotations.length)
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Compliant reviews cannot contain problems',
      });
    if (v.status === 'PROBLEMS' && !v.annotations.length)
      ctx.addIssue({ code: 'custom', path: ['annotations'], message: 'Mark at least one problem' });
    if (v.status === 'NOT_ASSESSABLE' && !v.comment)
      ctx.addIssue({
        code: 'custom',
        path: ['comment'],
        message: 'Explain why the image cannot be assessed',
      });
    if (new Set(v.annotations.map((a) => a.id)).size !== v.annotations.length)
      ctx.addIssue({
        code: 'custom',
        path: ['annotations'],
        message: 'Annotation IDs must be unique',
      });
  });
export type InspectionReview = z.infer<typeof InspectionReview>;
export const SaveInspection = z.object({
  version: z.number().int().nonnegative(),
  review: InspectionReview,
  automaticRunId: z.uuid().optional(),
});
export type SaveInspection = z.infer<typeof SaveInspection>;
export const InspectionContext = z.object({
  schemaVersion: z.literal(1),
  handoverId: z.uuid(),
  mediaId: z.uuid(),
  itemKey: z.string(),
  checklistDefinitionId: z.uuid(),
  checklistVersion: z.number().int().positive(),
  photoLabel: z.string(),
  checklist: z.array(z.object({ key: z.string(), label: z.string() })),
  zoneId: z.uuid().nullable(),
  zoneName: z.string().nullable(),
  shiftSessionId: z.uuid(),
  businessDate: z.string(),
  sha256: z.string(),
  encodedWidth: z.number().int().positive(),
  encodedHeight: z.number().int().positive(),
  contentType: z.string(),
  orientationPolicy: z.literal('EXIF_AUTO_ORIENT'),
});
export type InspectionContext = z.infer<typeof InspectionContext>;
export const InspectionPrediction = z
  .object({
    status: z.enum(['COMPLIANT', 'PROBLEMS', 'NOT_ASSESSABLE']),
    summary: z.string().trim().min(1).max(4000),
    limitations: z.string().max(4000),
    findings: z
      .array(
        z.object({
          category: InspectionCategory,
          comment: z.string().trim().min(1).max(2000),
          geometry: InspectionGeometry.nullable(),
        }),
      )
      .max(30),
  })
  .refine((v) => v.status !== 'PROBLEMS' || v.findings.length > 0, 'Problems require findings')
  .refine(
    (v) => v.status !== 'COMPLIANT' || !v.findings.length,
    'Compliant result cannot contain findings',
  );
export type InspectionPrediction = z.infer<typeof InspectionPrediction>;
export const InspectionRunView = z.object({
  id: z.uuid(),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED']),
  model: z.string(),
  promptVersion: z.string(),
  requestedAt: z.string(),
  completedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  prediction: InspectionPrediction.nullable(),
  reviewVersion: z.number().int().nonnegative(),
});
export type InspectionRunView = z.infer<typeof InspectionRunView>;
export const PhotoInspectionView = z.object({
  prohibitedItems: ProhibitedPhotoItems.optional(),
  context: InspectionContext,
  version: z.number().int().nonnegative(),
  review: InspectionReview,
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
  canEdit: z.boolean(),
  runs: z.array(InspectionRunView),
  automaticRunId: z.uuid().nullable().optional(),
  automaticReview: InspectionReview.nullable().optional(),
});
export type PhotoInspectionView = z.infer<typeof PhotoInspectionView>;
export const RequestInspectionAnalysis = z.object({
  guidance: z.string().trim().max(4000).optional(),
  requestId: z.uuid(),
  version: z.number().int().nonnegative(),
});
export type RequestInspectionAnalysis = z.infer<typeof RequestInspectionAnalysis>;
