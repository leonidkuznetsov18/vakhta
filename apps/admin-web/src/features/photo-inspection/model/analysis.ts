import type { InspectionReview } from '@vakhta/contracts';

export function hasInspectionInput(review: InspectionReview): boolean {
  return Boolean(
    review.comment.trim() ||
    review.guidance.trim() ||
    review.annotations.some((annotation) => annotation.comment.trim()),
  );
}
