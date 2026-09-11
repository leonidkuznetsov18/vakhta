import { availableSuggestions } from './suggestions';
import { hasReviewChanges, reviewChanges } from './review-changes';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(),
  ShapeType: { RECTANGLE: 'RECTANGLE', POLYGON: 'POLYGON' },
  UserSelectAction: { EDIT: 'EDIT', SELECT: 'SELECT' },
}));
import { canSaveReview, fromCanvas, InspectionEditor, reviewIsValid, toCanvas } from './editor';
import type {
  InspectionAnnotation,
  InspectionRunView,
  PhotoInspectionView,
} from '@vakhta/contracts';
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
const finding = {
  category: 'RAG',
  comment: 'Rag on the table',
  geometry: { type: 'RECTANGLE', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
} satisfies NonNullable<InspectionRunView['prediction']>['findings'][number];
const run: InspectionRunView = {
  id,
  status: 'SUCCEEDED',
  model: 'test',
  promptVersion: 'test',
  requestedAt: '2026-09-11T00:00:00Z',
  completedAt: '2026-09-11T00:01:00Z',
  errorCode: null,
  reviewVersion: 0,
  prediction: {
    status: 'PROBLEMS',
    summary: 'Possible rag',
    limitations: '',
    findings: [finding, finding],
  },
};
describe('photo inspection form and geometry', () => {
  it('adds each source finding once, retains identity after edits and reopening, and restores deleted options', () => {
    const editor = new InspectionEditor({ ...view, runs: [run] });
    editor.acceptSuggestion(run, 0);
    editor.acceptSuggestion(run, 0);
    expect(editor.store.getState().review.annotations).toHaveLength(1);
    expect(availableSuggestions(run, editor.store.getState().review).map((s) => s.index)).toEqual([
      1,
    ]);
    const region = editor.store.getState().review.annotations[0];
    if (!region) throw new Error('Expected region');
    editor.editAnnotation(region.id, { category: 'OTHER', comment: 'Corrected description' });
    editor.coordinates(region.id, 'x', 0.3);
    const saved = { ...view, version: 1, review: editor.store.getState().review, runs: [run] };
    editor.saved(saved);
    const reopened = new InspectionEditor(saved);
    reopened.acceptSuggestion(run, 0);
    expect(reopened.store.getState().review.annotations).toHaveLength(1);
    reopened.acceptSuggestion(run, 1);
    expect(availableSuggestions(run, reopened.store.getState().review)).toHaveLength(0);
    reopened.remove(region.id);
    expect(availableSuggestions(run, reopened.store.getState().review).map((s) => s.index)).toEqual(
      [0],
    );
    reopened.acceptSuggestion(run, 0);
    expect(reopened.store.getState().review.annotations).toHaveLength(2);
    expect(reopened.store.getState().review.annotations[1]?.comment).toBe(finding.comment);
  });
  it('links an unchanged legacy copy without discarding or modifying its content', () => {
    const legacy = { ...finding, id: crypto.randomUUID(), sourceRunId: run.id };
    const editor = new InspectionEditor({
      ...view,
      runs: [run],
      review: { ...view.review, annotations: [legacy] },
    });
    editor.editAnnotation(legacy.id, { comment: 'Edited old copy' });
    editor.acceptSuggestion(run, 0);
    expect(editor.store.getState().review.annotations).toHaveLength(1);
    expect(editor.store.getState().review.annotations[0]?.sourceFindingIndex).toBe(0);
  });
  it('ignores read-only, locked, missing and unlocatable suggestions', () => {
    const editor = new InspectionEditor(view);
    editor.lock();
    editor.acceptSuggestion(run, 0);
    editor.unlock();
    editor.acceptSuggestion(run, 5);
    editor.acceptSuggestion(
      {
        ...run,
        prediction: {
          status: 'PROBLEMS',
          summary: 'Rag',
          limitations: '',
          findings: [{ ...finding, geometry: null }],
        },
      },
      0,
    );
    expect(editor.store.getState().review.annotations).toHaveLength(0);
    const reader = new InspectionEditor({ ...view, canEdit: false });
    reader.acceptSuggestion(run, 0);
    expect(reader.store.getState().review.annotations).toHaveLength(0);
  });
  it('returns to default selection by toggling the active drawing tool without changing review data', () => {
    const editor = new InspectionEditor(view);
    expect(editor.store.getState().tool).toBe('select');
    editor.toggleDrawingTool('rectangle');
    expect(editor.store.getState().tool).toBe('rectangle');
    editor.toggleDrawingTool('polygon');
    expect(editor.store.getState().tool).toBe('polygon');
    editor.toggleDrawingTool('polygon');
    expect(editor.store.getState().tool).toBe('select');
    editor.lock();
    editor.toggleDrawingTool('rectangle');
    expect(editor.store.getState().tool).toBe('select');
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
  });
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

it('opens automatic regions as a draft without altering the saved baseline and restores rejected options', () => {
  const annotation = {
    id: crypto.randomUUID(),
    ...finding,
    sourceRunId: run.id,
    sourceFindingIndex: 0,
  };
  const editor = new InspectionEditor({
    ...view,
    runs: [run],
    automaticRunId: run.id,
    automaticReview: { ...view.review, annotations: [annotation] },
  });
  expect(editor.store.getState().savedReview.annotations).toHaveLength(0);
  expect(editor.store.getState().review.annotations).toHaveLength(1);
  expect(editor.store.getState().review.status).toBe('UNREVIEWED');
  expect(availableSuggestions(run, editor.store.getState().review).map((s) => s.index)).toEqual([
    1,
  ]);
  editor.remove(annotation.id);
  expect(availableSuggestions(run, editor.store.getState().review)).toHaveLength(2);
  expect(editor.store.getState().automaticRunId).toBe(run.id);
  editor.saved({ ...view, version: 1, automaticRunId: null });
  expect(editor.store.getState().automaticRunId).toBeNull();
});

it('allows an explained unassessable review when an automatic photo cannot load', () => {
  const editor = new InspectionEditor({ ...view, automaticRunId: run.id });
  editor.store.setState({ imageStatus: 'failed' });
  expect(canSaveReview(editor.store.getState())).toBe(false);
  editor.change({ status: 'NOT_ASSESSABLE', comment: 'Photo is unreadable' });
  expect(canSaveReview(editor.store.getState())).toBe(true);
});
