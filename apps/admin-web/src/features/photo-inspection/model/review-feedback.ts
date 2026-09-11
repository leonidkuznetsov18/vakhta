import { InspectionReview } from '@vakhta/contracts';

/** Map validation to the next useful action without exposing schema/developer messages. */
export function reviewFeedback(review: InspectionReview, invalidGeometry: boolean) {
  if (invalidGeometry) return { key: 'geometry' as const, regions: [] };
  const regions = review.annotations.flatMap((annotation, index) =>
    !annotation.objectName?.trim() && !annotation.comment.trim() ? [index + 1] : [],
  );
  if (regions.length) return { key: 'names' as const, regions };
  if (review.status === 'NOT_ASSESSABLE' && !review.comment.trim())
    return { key: 'reason' as const, regions: [] };
  if (review.status === 'COMPLIANT' && review.annotations.length)
    return { key: 'hasRegions' as const, regions: [] };
  if (review.status === 'PROBLEMS' && !review.annotations.length)
    return { key: 'needsRegions' as const, regions: [] };
  if (!InspectionReview.safeParse(review).success) return { key: 'other' as const, regions: [] };
  return null;
}
