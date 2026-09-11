import type { InspectionReview } from '@vakhta/contracts';

export interface ReviewChangeState {
  review: InspectionReview;
  savedReview: InspectionReview;
  statusOrigin: 'REVIEWER' | 'ANNOTATION';
}

/** Counts each changed region once, including its automatic outcome update. */
export function reviewChanges({ review, savedReview: saved, statusOrigin }: ReviewChangeState) {
  const previous = new Map(saved.annotations.map((region) => [region.id, region]));
  const current = new Set(review.annotations.map((region) => region.id));
  const added = review.annotations.filter((region) => !previous.has(region.id)).length;
  const edited = review.annotations.filter((region) => {
    const before = previous.get(region.id);
    return (
      before &&
      ((before.objectName ?? '').trim() !== (region.objectName ?? '').trim() ||
        before.comment.trim() !== region.comment.trim() ||
        before.category !== region.category ||
        before.sourceRunId !== region.sourceRunId ||
        before.sourceFindingIndex !== region.sourceFindingIndex ||
        JSON.stringify(before.geometry) !== JSON.stringify(region.geometry))
    );
  }).length;
  const removed = saved.annotations.filter((region) => !current.has(region.id)).length;
  const regionChanges = added + edited + removed;
  const fields = (['status', 'comment', 'guidance'] as const).filter(
    (field) =>
      review[field].trim() !== saved[field].trim() &&
      !(field === 'status' && statusOrigin === 'ANNOTATION' && regionChanges > 0),
  );
  return { added, edited, removed, fields, total: regionChanges + fields.length };
}

export function hasReviewChanges(state: ReviewChangeState) {
  return reviewChanges(state).total > 0;
}
