import { createHash } from 'node:crypto';
import { InspectionPrediction, type InspectionReview } from '@vakhta/contracts';

/** Proposals are a separate draft. Only a human save creates a training revision. */
export function automaticReviewDraft(
  review: InspectionReview,
  runId: string,
  prediction: unknown,
): InspectionReview {
  if (prediction === null) return { ...review, status: 'UNREVIEWED' };
  const result = InspectionPrediction.parse(prediction);
  const additions = result.findings.flatMap((finding, index) => {
    if (
      !finding.geometry ||
      review.annotations.some((a) => a.sourceRunId === runId && a.sourceFindingIndex === index)
    )
      return [];
    const hash = createHash('sha256').update(`${runId}:${index}`).digest('hex');
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    return [
      { id, ...finding, geometry: finding.geometry, sourceRunId: runId, sourceFindingIndex: index },
    ];
  });
  return {
    ...review,
    // A suggestion never marks a human review complete, including an empty AI result.
    status: 'UNREVIEWED',
    annotations: [...review.annotations, ...additions].slice(0, 100),
  };
}
