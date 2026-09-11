import type { InspectionReview, InspectionRunView } from '@vakhta/contracts';

/** Source positions are stable because completed run predictions are immutable. */
export function availableSuggestions(run: InspectionRunView, review: InspectionReview) {
  return (run.prediction?.findings ?? [])
    .map((finding, index) => ({ finding, index, key: `${run.id}:${index}` }))
    .filter(
      ({ index }) =>
        !review.annotations.some(
          (annotation) =>
            annotation.sourceRunId === run.id && annotation.sourceFindingIndex === index,
        ) && !review.rejectedFindings.some((r) => r.runId === run.id && r.index === index),
    );
}
export function rejectedSuggestions(run: InspectionRunView, review: InspectionReview) {
  return review.rejectedFindings
    .filter((r) => r.runId === run.id)
    .flatMap((rejection) => {
      const finding = run.prediction?.findings[rejection.index];
      return finding ? [{ finding, index: rejection.index, reason: rejection.reason }] : [];
    });
}

/** Link older, unchanged copies when their origin can be established exactly. */
export function linkLegacySuggestions(review: InspectionReview, runs: InspectionRunView[]) {
  const linked = structuredClone(review);
  for (const annotation of linked.annotations) {
    if (!annotation.sourceRunId || annotation.sourceFindingIndex !== undefined) continue;
    const run = runs.find((item) => item.id === annotation.sourceRunId);
    if (!run) continue;
    const match = availableSuggestions(run, linked).find(
      ({ finding }) =>
        finding.comment === annotation.comment &&
        JSON.stringify(finding.geometry) === JSON.stringify(annotation.geometry),
    );
    if (match) annotation.sourceFindingIndex = match.index;
  }
  return linked;
}
