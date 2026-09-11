import { InspectionReviewInput, type InspectionReview } from '@vakhta/contracts';

/** Map validation to the next useful action without exposing schema/developer messages. */
export function reviewFeedback(review: InspectionReview, invalidGeometry: boolean) {
  if (invalidGeometry) return { key: 'geometry' as const, regions: [] };
  const regions = review.annotations.flatMap((annotation, index) =>
    !annotation.objectId && !annotation.objectName?.trim() && !annotation.comment.trim()
      ? [index + 1]
      : [],
  );
  if (regions.length) return { key: 'names' as const, regions };
  if (
    review.status === 'NOT_ASSESSABLE' &&
    (!review.notAssessableReason ||
      (review.notAssessableReason === 'OTHER' && !review.comment.trim()))
  )
    return { key: 'reason' as const, regions: [] };
  if (!InspectionReviewInput.safeParse(review).success)
    return { key: 'other' as const, regions: [] };
  return null;
}
