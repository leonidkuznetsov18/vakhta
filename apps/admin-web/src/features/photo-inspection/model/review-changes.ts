import type { InspectionReview } from '@vakhta/contracts';

/** Counts changed fields and regions, not edits or individual region properties. */
export function reviewChanges(review: InspectionReview, saved: InspectionReview) {
  const previous = new Map(saved.annotations.map((region) => [region.id, region]));
  const current = new Set(review.annotations.map((region) => region.id));
  const added = review.annotations.filter((region) => !previous.has(region.id)).length;
  const edited = review.annotations.filter((region) => {
    const before = previous.get(region.id);
    return (
      before &&
      (before.comment.trim() !== region.comment.trim() ||
        before.category !== region.category ||
        before.sourceRunId !== region.sourceRunId ||
        before.sourceFindingIndex !== region.sourceFindingIndex ||
        JSON.stringify(before.geometry) !== JSON.stringify(region.geometry))
    );
  }).length;
  const removed = saved.annotations.filter((region) => !current.has(region.id)).length;
  const fields = (['status', 'comment', 'guidance'] as const).filter(
    (field) => review[field].trim() !== saved[field].trim(),
  );
  return { added, edited, removed, fields, total: added + edited + removed + fields.length };
}

export function hasReviewChanges(state: {
  review: InspectionReview;
  savedReview: InspectionReview;
}) {
  return reviewChanges(state.review, state.savedReview).total > 0;
}
