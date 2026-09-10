import { describe, expect, it } from 'vitest';
import { InspectionGeometry, InspectionPrediction, InspectionReview } from './photo-inspection.js';
const empty = { status: 'UNREVIEWED', comment: '', guidance: '', annotations: [] };
describe('photo inspection training labels', () => {
  it('preserves source identity, accepts legacy annotations and rejects repeated or invalid finding references', () => {
    const annotation = {
      id: '10000000-0000-4000-8000-000000000001',
      sourceRunId: '20000000-0000-4000-8000-000000000001',
      sourceFindingIndex: 0,
      geometry: { type: 'RECTANGLE', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      category: 'RAG',
      comment: 'Rag',
    };
    const review = { ...empty, status: 'PROBLEMS', annotations: [annotation] };
    expect(InspectionReview.parse(review).annotations[0]?.sourceFindingIndex).toBe(0);
    expect(
      InspectionReview.safeParse({
        ...review,
        annotations: [{ ...annotation, sourceFindingIndex: undefined }],
      }).success,
    ).toBe(true);
    for (const patch of [
      { sourceRunId: null },
      { sourceFindingIndex: -1 },
      { sourceFindingIndex: 30 },
    ])
      expect(
        InspectionReview.safeParse({ ...review, annotations: [{ ...annotation, ...patch }] })
          .success,
      ).toBe(false);
    expect(
      InspectionReview.safeParse({
        ...review,
        annotations: [annotation, { ...annotation, id: '30000000-0000-4000-8000-000000000001' }],
      }).success,
    ).toBe(false);
  });
  it('distinguishes unreviewed from a confirmed negative and unassessable image', () => {
    expect(InspectionReview.parse(empty).status).toBe('UNREVIEWED');
    expect(InspectionReview.safeParse({ ...empty, status: 'COMPLIANT' }).success).toBe(true);
    expect(InspectionReview.safeParse({ ...empty, status: 'PROBLEMS' }).success).toBe(false);
    expect(InspectionReview.safeParse({ ...empty, status: 'NOT_ASSESSABLE' }).success).toBe(false);
  });
  it('rejects regions outside the image and incomplete model output', () => {
    expect(
      InspectionGeometry.safeParse({ type: 'RECTANGLE', x: 0.9, y: 0, width: 0.2, height: 0.1 })
        .success,
    ).toBe(false);
    expect(
      InspectionGeometry.safeParse({
        type: 'POLYGON',
        points: [
          [0, 0],
          [1, 1],
        ],
      }).success,
    ).toBe(false);
    expect(
      InspectionPrediction.safeParse({
        status: 'PROBLEMS',
        summary: 'dirt',
        limitations: '',
        findings: [],
      }).success,
    ).toBe(false);
  });
});
