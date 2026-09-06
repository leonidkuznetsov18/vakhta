import { z } from 'zod';
import {
  CHECKLIST_ITEM_KEY_PATTERN,
  HANDOVER_RESOLUTIONS,
  HANDOVER_STATUSES,
  MEDIA_QUALITY_STATUSES,
  REMARK_NEEDS,
} from '@vakhta/domain';
import { ChecklistItemKindSchema } from './checklists.js';
import { Comment, IdempotencyKey, IsoDateTime, ReasonCode, Uuid } from './common.js';

export const HandoverStatusSchema = z.enum(HANDOVER_STATUSES);
export const HandoverResolutionSchema = z.enum(HANDOVER_RESOLUTIONS);
export const RemarkNeedSchema = z.enum(REMARK_NEEDS);
export const MediaQualitySchema = z.enum(MEDIA_QUALITY_STATUSES);
export const ChecklistItemKey = z.string().regex(CHECKLIST_ITEM_KEY_PATTERN);

export const ChecklistItemView = z.object({
  key: z.string(),
  label: z.string(),
  kind: ChecklistItemKindSchema,
  answered: z.boolean(),
  ok: z.boolean().nullable(),
  remarkCategory: z.string().nullable(),
  remarkText: z.string().nullable(),
  safeToWork: z.boolean().nullable(),
  needs: z.array(RemarkNeedSchema),
});
export type ChecklistItemView = z.infer<typeof ChecklistItemView>;

export const MediaObjectView = z.object({
  id: Uuid,
  quality: MediaQualitySchema,
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  receivedAt: IsoDateTime,
  processedAt: IsoDateTime.nullable(),
  duplicateOfId: Uuid.nullable(),
});
export type MediaObjectView = z.infer<typeof MediaObjectView>;

/** A photo attached to one PHOTO item of the checklist. */
export const HandoverPhotoView = z.object({
  itemKey: z.string(),
  label: z.string(),
  media: MediaObjectView,
});
export type HandoverPhotoView = z.infer<typeof HandoverPhotoView>;

export const HandoverIssueView = z.object({
  code: z.enum([
    'ITEM_MISSING',
    'REMARK_CATEGORY_REQUIRED',
    'REMARK_TEXT_REQUIRED',
    'REMARK_SAFETY_REQUIRED',
    'PHOTO_MISSING',
  ]),
  itemKey: z.string().optional(),
});
export type HandoverIssueView = z.infer<typeof HandoverIssueView>;

/** Чернетка або поданий звіт передачі очима здавача (ТЗ 5.6–5.8). */
export const HandoverView = z.object({
  id: Uuid,
  shiftSessionId: Uuid,
  /** null: the shift had no zone; nobody accepts the report, the master reviews it. */
  zoneId: Uuid.nullable(),
  zoneName: z.string().nullable(),
  submittedBy: Uuid,
  submittedByName: z.string(),
  checklistDefinitionId: Uuid,
  checklistVersion: z.number().int().positive(),
  status: HandoverStatusSchema,
  version: z.number().int().nonnegative(),
  items: z.array(ChecklistItemView),
  photos: z.array(HandoverPhotoView),
  issues: z.array(HandoverIssueView),
  cannotCompleteReason: z.string().nullable(),
  cannotCompleteComment: z.string().nullable(),
  submittedAt: IsoDateTime.nullable(),
  acceptDeadlineAt: IsoDateTime.nullable(),
  escalatedToMasterAt: IsoDateTime.nullable(),
  supersededById: Uuid.nullable(),
  createdAt: IsoDateTime,
});
export type HandoverView = z.infer<typeof HandoverView>;

export const AnswerChecklistCommand = z.object({
  itemKey: ChecklistItemKey,
  ok: z.boolean(),
  remarkCategory: ReasonCode.optional(),
  remarkText: Comment.optional(),
  safeToWork: z.boolean().optional(),
  needs: z.array(RemarkNeedSchema).max(3).optional(),
  /** Для пунктів kind=NOTE: текст повідомлення наступній зміні. */
  note: Comment.optional(),
});
export type AnswerChecklistCommand = z.infer<typeof AnswerChecklistCommand>;

/** Telegram photo for one PHOTO item; the worker moves it to storage (ADR-0006, FR-PHO-02). */
export const AttachHandoverPhotoCommand = z.object({
  itemKey: ChecklistItemKey,
  telegramFileId: z.string().min(1).max(200),
  telegramFileUniqueId: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type AttachHandoverPhotoCommand = z.infer<typeof AttachHandoverPhotoCommand>;

export const CannotCompleteCommand = z.object({
  reasonCode: ReasonCode,
  comment: Comment.optional(),
});
export type CannotCompleteCommand = z.infer<typeof CannotCompleteCommand>;

export const SubmitHandoverCommand = z.object({ idempotencyKey: IdempotencyKey });
export type SubmitHandoverCommand = z.infer<typeof SubmitHandoverCommand>;

/** Приймання наступною зміною (FR-HND-03/04): зауваження вимагає категорії, коментаря і фото. */
export const ReviewHandoverCommand = z.object({
  decision: z.enum(['ACCEPTED', 'ISSUE']),
  category: ReasonCode.optional(),
  comment: Comment.optional(),
  telegramFileId: z.string().min(1).max(200).optional(),
  telegramFileUniqueId: z.string().min(1).max(200).optional(),
  idempotencyKey: IdempotencyKey,
});
export type ReviewHandoverCommand = z.infer<typeof ReviewHandoverCommand>;

/** Рішення майстра по спору або простроченому прийманню (FR-HND-05/06). */
export const ResolveHandoverCommand = z.object({
  decision: HandoverResolutionSchema,
  reasonCode: ReasonCode.optional(),
  comment: z.string().trim().min(3).max(2000),
});
export type ResolveHandoverCommand = z.infer<typeof ResolveHandoverCommand>;

export const HandoverReviewView = z.object({
  id: Uuid,
  reviewerEmployeeId: Uuid,
  reviewerName: z.string(),
  decision: z.enum(['ACCEPTED', 'ISSUE']),
  category: z.string().nullable(),
  comment: z.string().nullable(),
  media: MediaObjectView.nullable(),
  reviewedAt: IsoDateTime,
  incidentId: Uuid.nullable(),
});
export type HandoverReviewView = z.infer<typeof HandoverReviewView>;

export const HandoverResolutionView = z.object({
  id: Uuid,
  resolvedBy: z.string().nullable(),
  decision: HandoverResolutionSchema,
  reasonCode: z.string().nullable(),
  comment: z.string(),
  at: IsoDateTime,
});
export type HandoverResolutionView = z.infer<typeof HandoverResolutionView>;

/** Те, що бачить приймаюча зміна перед основною роботою (FR-HND-03). */
export const PendingHandoverView = z.object({
  id: Uuid,
  zoneId: Uuid,
  zoneName: z.string(),
  submittedBy: Uuid,
  submittedByName: z.string(),
  submittedAt: IsoDateTime,
  remarks: z.number().int().nonnegative(),
  cannotComplete: z.boolean(),
  notes: z.array(z.string()),
  photos: z.number().int().nonnegative(),
});
export type PendingHandoverView = z.infer<typeof PendingHandoverView>;

export const HandoverDetailView = z.object({
  handover: HandoverView,
  reviews: z.array(HandoverReviewView),
  resolutions: z.array(HandoverResolutionView),
  serverTime: IsoDateTime,
});
export type HandoverDetailView = z.infer<typeof HandoverDetailView>;

export const HandoverListQuery = z.object({
  siteId: Uuid.optional(),
  zoneId: Uuid.optional(),
  /** pending (типово): SUBMITTED і DISPUTED; overdue: прострочені; all. */
  scope: z.enum(['pending', 'overdue', 'all']).optional(),
});
export type HandoverListQuery = z.infer<typeof HandoverListQuery>;

export const HandoverListItemView = HandoverView.omit({ items: true, issues: true }).extend({
  remarks: z.number().int().nonnegative(),
  overdue: z.boolean(),
  reviewDecision: z.enum(['ACCEPTED', 'ISSUE']).nullable(),
});
export type HandoverListItemView = z.infer<typeof HandoverListItemView>;

/** Короткоживуче підписане посилання (FR-PHO-06). */
export const MediaLinkView = z.object({ url: z.url(), expiresAt: IsoDateTime });
export type MediaLinkView = z.infer<typeof MediaLinkView>;

export const HandoverChangedEvent = z.object({
  handoverId: Uuid,
  status: HandoverStatusSchema,
  at: IsoDateTime,
});
export type HandoverChangedEvent = z.infer<typeof HandoverChangedEvent>;
