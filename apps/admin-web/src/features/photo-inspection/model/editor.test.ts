import { hasReviewChanges, reviewChanges } from './review-changes';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(),
  ShapeType: { RECTANGLE: 'RECTANGLE', POLYGON: 'POLYGON' },
  UserSelectAction: { EDIT: 'EDIT', SELECT: 'SELECT' },
}));
import { fromCanvas, InspectionEditor, reviewIsValid, toCanvas } from './editor';
import type { InspectionAnnotation, PhotoInspectionView } from '@vakhta/contracts';
const id = '10000000-0000-4000-8000-000000000001';
const view: PhotoInspectionView = {
  version: 0,
  canEdit: true,
  updatedAt: null,
  updatedBy: null,
  runs: [],
  review: { status: 'UNREVIEWED', annotations: [], comment: '', guidance: '' },
  context: {
    schemaVersion: 1,
    handoverId: id,
    mediaId: id,
    itemKey: 'table',
    checklistDefinitionId: id,
    checklistVersion: 1,
    photoLabel: 'Table',
    checklist: [],
    zoneId: null,
    zoneName: null,
    shiftSessionId: id,
    businessDate: '2026-09-10',
    sha256: 'a'.repeat(64),
    encodedWidth: 1200,
    encodedHeight: 800,
    contentType: 'image/jpeg',
    orientationPolicy: 'EXIF_AUTO_ORIENT',
  },
};
describe('photo inspection form and geometry', () => {
  it('counts changes relative to the saved review and removes reverted changes', () => {
    const editor = new InspectionEditor(view);
    editor.change({ comment: 'A draft', guidance: 'Keep clear' });
    let state = editor.store.getState();
    expect(reviewChanges(state.review, state.savedReview).total).toBe(2);
    editor.change({ comment: '', guidance: '' });
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
    editor.addBox();
    const region = editor.store.getState().review.annotations[0];
    if (!region) throw new Error('Expected region');
    editor.editAnnotation(region.id, { comment: 'Dust' });
    state = editor.store.getState();
    expect(reviewChanges(state.review, state.savedReview)).toMatchObject({
      added: 1,
      edited: 0,
      total: 2,
    });
    editor.saved({ ...view, version: 1, review: state.review });
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
    editor.editAnnotation(region.id, { comment: 'Dust on table', category: 'DIRT' });
    state = editor.store.getState();
    expect(reviewChanges(state.review, state.savedReview)).toMatchObject({ edited: 1, total: 1 });
    editor.remove(region.id);
    state = editor.store.getState();
    expect(reviewChanges(state.review, state.savedReview)).toMatchObject({
      removed: 1,
      edited: 0,
      total: 2,
    });
  });
  it('snapshots unsaved AI requirements without saving or changing the draft', () => {
    const editor = new InspectionEditor(view);
    editor.change({ guidance: ' Keep the table clear ' });
    const request = editor.analysisRequest();
    expect(request).toMatchObject({ version: 0, guidance: 'Keep the table clear' });
    expect(editor.analysisRequest()).toEqual(request);
    editor.analysisReceived();
    expect(hasReviewChanges(editor.store.getState())).toBe(true);
    expect(editor.store.getState().version).toBe(0);
    expect(editor.analysisRequest().requestId).not.toBe(request.requestId);
    editor.change({ guidance: 'New requirements' });
    expect(editor.analysisRequest()).toMatchObject({ guidance: 'New requirements' });
  });

  it('removes only the selected region and leaves a draft requiring a human outcome', () => {
    const editor = new InspectionEditor(view);
    editor.addBox();
    editor.addBox();
    const selected = editor.store.getState().selected;
    expect(editor.removeSelected()).toBe(true);
    expect(editor.store.getState().review.annotations).toHaveLength(1);
    expect(editor.store.getState().review.annotations.some((a) => a.id === selected)).toBe(false);
    expect(editor.store.getState().selected).toBeNull();
    expect(hasReviewChanges(editor.store.getState())).toBe(true);
    expect(editor.store.getState().review.status).toBe('UNREVIEWED');
    expect(editor.removeSelected()).toBe(false);
  });
  it('protects locked and read-only reviews from deletion', () => {
    const editor = new InspectionEditor(view);
    editor.addBox();
    editor.lock();
    expect(editor.removeSelected()).toBe(false);
    const readOnly = new InspectionEditor({
      ...view,
      canEdit: false,
      review: editor.store.getState().review,
    });
    const annotation = readOnly.store.getState().review.annotations[0];
    if (!annotation) throw new Error('Expected annotation');
    readOnly.select(annotation.id);
    expect(readOnly.removeSelected()).toBe(false);
    expect(readOnly.store.getState().review.annotations).toHaveLength(1);
  });
  it('bounds image zoom between 100 and 500 percent without changing the review', () => {
    const editor = new InspectionEditor(view);
    editor.zoom(100);
    expect(editor.store.getState().zoom).toBe(5);
    editor.zoom(-100);
    expect(editor.store.getState().zoom).toBe(1);
    expect(editor.store.getState().review).toEqual(view.review);
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
  });
  it('round trips normalized rectangles and polygons independent of display size', () => {
    const shapes: InspectionAnnotation['geometry'][] = [
      { type: 'RECTANGLE', x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      {
        type: 'POLYGON',
        points: [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.5, 0.75],
        ],
      },
    ];
    for (const geometry of shapes) {
      const annotation = {
        id,
        geometry,
        category: 'DIRT',
        comment: 'Dust',
        sourceRunId: null,
      } satisfies InspectionAnnotation;
      expect(fromCanvas(toCanvas(annotation, 1200, 800), 1200, 800)).toEqual(geometry);
      expect(fromCanvas(toCanvas(annotation, 600, 400), 600, 400)).toEqual(geometry);
    }
  });
  it('requires a human description before a newly drawn region can be saved', () => {
    const editor = new InspectionEditor(view);
    editor.addBox();
    expect(reviewIsValid(editor.store.getState())).toBe(false);
    const annotation = editor.store.getState().review.annotations[0];
    if (!annotation) throw new Error('Expected region');
    editor.editAnnotation(annotation.id, { comment: 'Dust on the surface' });
    expect(reviewIsValid(editor.store.getState())).toBe(true);
    expect(hasReviewChanges(editor.store.getState())).toBe(true);
    editor.saved({ ...view, version: 1, review: editor.store.getState().review });
    expect(editor.store.getState().version).toBe(1);
    expect(editor.store.getState().review.annotations).toHaveLength(1);
  });
  it('does not label an emptied annotation list as compliant automatically', () => {
    const editor = new InspectionEditor(view);
    editor.addBox();
    const annotation = editor.store.getState().review.annotations[0];
    if (!annotation) throw new Error('Expected region');
    editor.remove(annotation.id);
    expect(editor.store.getState().review.status).toBe('UNREVIEWED');
  });
});
