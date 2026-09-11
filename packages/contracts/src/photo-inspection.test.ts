import { describe, expect, it } from 'vitest';
import {
  InspectionAnnotation,
  InspectionGeometry,
  InspectionPrediction,
  InspectionReview,
  InspectionReviewInput,
  reviewOutcome,
} from './photo-inspection.js';
const empty = { status: 'UNREVIEWED', comment: '', guidance: '', annotations: [] };
const region = {
  id: '10000000-0000-4000-8000-000000000001',
  geometry: { type: 'RECTANGLE', x: 0, y: 0, width: 0.2, height: 0.2 },
  objectId: '40000000-0000-4000-8000-000000000001',
};
describe('photo inspection training labels', () => {
  it('identifies the marked object by catalog id, accepts legacy names and descriptions, and rejects empty regions', () => {
    expect(InspectionAnnotation.parse(region)).toMatchObject({
      verdict: 'VIOLATION',
      category: 'OTHER',
      comment: '',
      sourceRunId: null,
    });
    expect(
      InspectionAnnotation.parse({ ...region, objectId: null, objectName: '  Rags  ' }).objectName,
    ).toBe('Rags');
    expect(
      InspectionAnnotation.parse({ ...region, objectId: null, comment: 'Old description' }).comment,
    ).toBe('Old description');
    expect(InspectionAnnotation.safeParse({ ...region, objectId: null }).success).toBe(false);
    expect(
      InspectionAnnotation.safeParse({ ...region, objectId: null, objectName: '  ' }).success,
    ).toBe(false);
  });
  it('derives the photo outcome from region verdicts', () => {
    expect(reviewOutcome([], false)).toBe('COMPLIANT');
    expect(reviewOutcome([{ verdict: 'ALLOWED' }], false)).toBe('COMPLIANT');
    expect(reviewOutcome([{ verdict: 'ALLOWED' }, { verdict: 'UNSURE' }], false)).toBe(
      'UNREVIEWED',
    );
    expect(reviewOutcome([{ verdict: 'UNSURE' }, { verdict: 'VIOLATION' }], false)).toBe(
      'PROBLEMS',
    );
    expect(reviewOutcome([{ verdict: 'VIOLATION' }], true)).toBe('NOT_ASSESSABLE');
  });
  it('accepts stored legacy reviews but requires a consistent outcome and reasons when saving', () => {
    const legacy = {
      ...empty,
      status: 'UNREVIEWED',
      annotations: [{ ...region, objectId: null, comment: 'x' }],
    };
    expect(InspectionReview.safeParse(legacy).success).toBe(true);
    expect(InspectionReviewInput.safeParse(legacy).success).toBe(false);
    expect(InspectionReviewInput.safeParse({ ...empty, status: 'COMPLIANT' }).success).toBe(true);
    expect(
      InspectionReviewInput.safeParse({ ...empty, status: 'PROBLEMS', annotations: [region] })
        .success,
    ).toBe(true);
    expect(
      InspectionReviewInput.safeParse({
        ...empty,
        status: 'COMPLIANT',
        annotations: [{ ...region, verdict: 'ALLOWED' }],
        isReference: true,
      }).success,
    ).toBe(true);
    expect(
      InspectionReviewInput.safeParse({ ...empty, status: 'COMPLIANT', annotations: [region] })
        .success,
    ).toBe(false);
    expect(
      InspectionReviewInput.safeParse({
        ...empty,
        status: 'PROBLEMS',
        isReference: true,
        annotations: [region],
      }).success,
    ).toBe(false);
    expect(InspectionReviewInput.safeParse({ ...empty, status: 'NOT_ASSESSABLE' }).success).toBe(
      false,
    );
    expect(
      InspectionReviewInput.safeParse({
        ...empty,
        status: 'NOT_ASSESSABLE',
        notAssessableReason: 'DARK',
      }).success,
    ).toBe(true);
    expect(
      InspectionReviewInput.safeParse({
        ...empty,
        status: 'NOT_ASSESSABLE',
        notAssessableReason: 'OTHER',
      }).success,
    ).toBe(false);
    expect(
      InspectionReviewInput.safeParse({
        ...empty,
        status: 'NOT_ASSESSABLE',
        notAssessableReason: 'OTHER',
        comment: 'Wrong machine',
      }).success,
    ).toBe(true);
  });
  it('keeps source identity unique across accepted and rejected findings', () => {
    const runId = '20000000-0000-4000-8000-000000000001';
    const accepted = { ...region, sourceRunId: runId, sourceFindingIndex: 0 };
    const review = { ...empty, status: 'PROBLEMS', annotations: [accepted] };
    expect(InspectionReview.parse(review).annotations[0]?.sourceFindingIndex).toBe(0);
    for (const patch of [
      { sourceRunId: null },
      { sourceFindingIndex: -1 },
      { sourceFindingIndex: 30 },
    ])
      expect(
        InspectionReview.safeParse({ ...review, annotations: [{ ...accepted, ...patch }] }).success,
      ).toBe(false);
    expect(
      InspectionReview.safeParse({
        ...review,
        annotations: [accepted, { ...accepted, id: '30000000-0000-4000-8000-000000000001' }],
      }).success,
    ).toBe(false);
    expect(
      InspectionReview.safeParse({
        ...review,
        rejectedFindings: [{ runId, index: 0, reason: 'NOT_PRESENT' }],
      }).success,
    ).toBe(false);
    expect(
      InspectionReview.safeParse({
        ...review,
        rejectedFindings: [
          { runId, index: 1, reason: 'NOT_PRESENT' },
          { runId, index: 1, reason: 'ALLOWED' },
        ],
      }).success,
    ).toBe(false);
    expect(
      InspectionReview.parse({
        ...review,
        rejectedFindings: [{ runId, index: 1, reason: 'ALLOWED' }],
      }).rejectedFindings,
    ).toHaveLength(1);
  });
  it('rejects regions outside the image and inconsistent model output', () => {
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
    expect(InspectionPrediction.safeParse({ status: 'PROBLEMS', findings: [] }).success).toBe(
      false,
    );
    expect(
      InspectionPrediction.parse({
        status: 'PROBLEMS',
        findings: [
          {
            objectId: region.objectId,
            objectName: 'Rags',
            comment: 'rag',
            geometry: region.geometry,
          },
        ],
      }).summary,
    ).toBe('');
  });
});
