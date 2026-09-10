import { describe, expect, it } from 'vitest';
import { InspectionGeometry, InspectionPrediction, InspectionReview } from './photo-inspection.js';
const empty = { status: 'UNREVIEWED', comment: '', guidance: '', annotations: [] };
describe('photo inspection training labels', () => {
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
