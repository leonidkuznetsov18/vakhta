import type { InspectionReview } from '@vakhta/contracts';

export interface ReviewChangeState {
  review: InspectionReview;
  savedReview: InspectionReview;
}
/** Field order and whitespace never count as a change; content does. */
export function canonicalReview(review: InspectionReview): string {
  return JSON.stringify({
    status: review.status,
    comment: review.comment.trim(),
    notAssessableReason: review.notAssessableReason ?? null,
    isReference: review.isReference,
    rejectedFindings: [...review.rejectedFindings].sort((a, b) =>
      `${a.runId}:${a.index}`.localeCompare(`${b.runId}:${b.index}`),
    ),
    annotations: review.annotations.map((a) => ({
      id: a.id,
      geometry: a.geometry,
      objectId: a.objectId,
      objectName: a.objectName?.trim() ?? '',
      verdict: a.verdict,
      comment: a.comment.trim(),
      sourceRunId: a.sourceRunId,
      sourceFindingIndex: a.sourceFindingIndex ?? null,
    })),
  });
}
export function hasReviewChanges(state: ReviewChangeState) {
  return canonicalReview(state.review) !== canonicalReview(state.savedReview);
}

/** Counts each changed region once plus each changed photo-level field: the unsaved-work number. */
export function reviewChanges({ review, savedReview: saved }: ReviewChangeState) {
  const canon = (a: InspectionReview['annotations'][number]) =>
    JSON.stringify({
      geometry: a.geometry,
      objectId: a.objectId,
      objectName: a.objectName?.trim() ?? '',
      verdict: a.verdict,
      comment: a.comment.trim(),
    });
  const previous = new Map(saved.annotations.map((region) => [region.id, canon(region)]));
  const current = new Set(review.annotations.map((region) => region.id));
  const added = review.annotations.filter((region) => !previous.has(region.id)).length;
  const edited = review.annotations.filter((region) => {
    const before = previous.get(region.id);
    return before !== undefined && before !== canon(region);
  }).length;
  const removed = saved.annotations.filter((region) => !current.has(region.id)).length;
  // The outcome follows from the regions, so it only counts when the reviewer flipped the switch.
  const notAssessable = (r: InspectionReview) => r.status === 'NOT_ASSESSABLE';
  const fields = (
    [
      ['status', notAssessable(review) !== notAssessable(saved)],
      ['comment', review.comment.trim() !== saved.comment.trim()],
      [
        'notAssessableReason',
        (review.notAssessableReason ?? null) !== (saved.notAssessableReason ?? null),
      ],
      ['isReference', review.isReference !== saved.isReference],
      [
        'rejectedFindings',
        JSON.stringify(review.rejectedFindings) !== JSON.stringify(saved.rejectedFindings),
      ],
    ] as const
  )
    .filter(([, changed]) => changed)
    .map(([field]) => field);
  return { added, edited, removed, fields, total: added + edited + removed + fields.length };
}
