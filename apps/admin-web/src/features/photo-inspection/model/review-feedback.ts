import {
  InspectionReviewInput,
  NotAssessableReason,
  ReviewStatus,
  type InspectionReview,
} from '@vakhta/contracts';
import { hasReviewChanges, type ReviewChangeState } from './review-changes';

/** Why "Save changes" is disabled; each key names the next action the reviewer must take. */
export const SaveBlock = {
  GEOMETRY: 'geometry',
  NAMES: 'names',
  REASON: 'reason',
  NOTE: 'note',
  INVALID: 'other',
  IMAGE: 'image',
  UNCHANGED: 'unchanged',
} as const;
export type SaveBlock = (typeof SaveBlock)[keyof typeof SaveBlock];

export interface SaveBlockState extends ReviewChangeState {
  version: number;
  invalidGeometry: boolean;
  imageStatus: 'loading' | 'ready' | 'failed';
}

/** Numbers (1-based) of regions that name no object yet. */
export function unnamedRegions(review: InspectionReview): number[] {
  return review.annotations.flatMap((annotation, index) =>
    !annotation.objectId && !annotation.objectName?.trim() && !annotation.comment.trim()
      ? [index + 1]
      : [],
  );
}

/** Map validation to the next useful action without exposing schema/developer messages. */
export function reviewFeedback(
  review: InspectionReview,
  invalidGeometry: boolean,
): { key: SaveBlock; regions: number[] } | null {
  if (invalidGeometry) return { key: SaveBlock.GEOMETRY, regions: [] };
  const regions = unnamedRegions(review);
  if (regions.length) return { key: SaveBlock.NAMES, regions };
  if (review.status === ReviewStatus.enum.NOT_ASSESSABLE && !review.notAssessableReason)
    return { key: SaveBlock.REASON, regions: [] };
  if (
    review.status === ReviewStatus.enum.NOT_ASSESSABLE &&
    review.notAssessableReason === NotAssessableReason.enum.OTHER &&
    !review.comment.trim()
  )
    return { key: SaveBlock.NOTE, regions: [] };
  if (!InspectionReviewInput.safeParse(review).success)
    return { key: SaveBlock.INVALID, regions: [] };
  return null;
}

/**
 * The first thing standing between the reviewer and a save, or null when saving is allowed.
 * A never-saved photo is saveable as is: confirming a clean photo is itself the decision.
 */
export function saveBlocker(state: SaveBlockState): { key: SaveBlock; regions: number[] } | null {
  const feedback = reviewFeedback(state.review, state.invalidGeometry);
  if (feedback) return feedback;
  if (state.imageStatus !== 'ready' && state.review.status !== ReviewStatus.enum.NOT_ASSESSABLE)
    return { key: SaveBlock.IMAGE, regions: [] };
  if (state.version > 0 && !hasReviewChanges(state))
    return { key: SaveBlock.UNCHANGED, regions: [] };
  return null;
}
