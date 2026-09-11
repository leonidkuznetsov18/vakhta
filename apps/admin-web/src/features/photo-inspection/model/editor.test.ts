import { availableSuggestions, rejectedSuggestions } from './suggestions';
import { hasReviewChanges, reviewChanges } from './review-changes';
import { objectColor, UNNAMED_COLOR } from './object-colors';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(),
  ShapeType: { RECTANGLE: 'RECTANGLE', POLYGON: 'POLYGON' },
  UserSelectAction: { EDIT: 'EDIT', SELECT: 'SELECT' },
}));
import { canSaveReview, fromCanvas, InspectionEditor, reviewIsValid, toCanvas } from './editor';
import type {
  InspectionAnnotation,
  InspectionFinding,
  InspectionRunView,
  PhotoInspectionView,
} from '@vakhta/contracts';
const id = '10000000-0000-4000-8000-000000000001';
const RAG = '40000000-0000-4000-8000-000000000001';
const view: PhotoInspectionView = {
  version: 0,
  canEdit: true,
  updatedAt: null,
  updatedBy: null,
  runs: [],
  rules: [{ objectId: RAG, name: 'Ганчірки', note: '' }],
  review: {
    status: 'UNREVIEWED',
    annotations: [],
    comment: '',
    guidance: '',
    isReference: false,
    rejectedFindings: [],
  },
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
const finding: InspectionFinding = {
  category: 'OTHER',
  objectId: RAG,
  objectName: 'Ганчірки',
  comment: 'ганчірка зліва',
  geometry: { type: 'RECTANGLE', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
};
const run: InspectionRunView = {
  id,
  status: 'SUCCEEDED',
  model: 'test',
  promptVersion: 'test',
  requestedAt: '2026-09-11T00:00:00Z',
  completedAt: '2026-09-11T00:01:00Z',
  errorCode: null,
  reviewVersion: 0,
  feedback: null,
  prediction: {
    status: 'PROBLEMS',
    summary: 'Ганчірки: 2',
    limitations: '',
    findings: [finding, finding],
  },
};
describe('photo inspection form and geometry', () => {
  it('starts a never-saved photo from its computed clean outcome and enables saving only after a change', () => {
    const editor = new InspectionEditor(view);
    expect(editor.store.getState().review.status).toBe('COMPLIANT');
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
    editor.store.setState({ imageStatus: 'ready' });
    expect(canSaveReview(editor.store.getState())).toBe(false);
    editor.change({ isReference: true });
    expect(canSaveReview(editor.store.getState())).toBe(true);
    editor.change({ isReference: false });
    expect(canSaveReview(editor.store.getState())).toBe(false);
    const saved = new InspectionEditor({
      ...view,
      version: 1,
      review: { ...view.review, status: 'COMPLIANT' },
    });
    saved.store.setState({ imageStatus: 'ready' });
    expect(canSaveReview(saved.store.getState())).toBe(false);
  });
  it('derives the outcome from region verdicts and the not-assessable switch', () => {
    const editor = new InspectionEditor(view);
    editor.addBox();
    const region = editor.store.getState().review.annotations[0];
    if (!region) throw new Error('Expected region');
    expect(editor.store.getState().review.status).toBe('PROBLEMS');
    editor.editAnnotation(region.id, { verdict: 'ALLOWED', objectId: RAG });
    expect(editor.store.getState().review.status).toBe('COMPLIANT');
    editor.change({ isReference: true });
    expect(editor.store.getState().review.isReference).toBe(true);
    editor.editAnnotation(region.id, { verdict: 'UNSURE' });
    expect(editor.store.getState().review.status).toBe('UNREVIEWED');
    expect(editor.store.getState().review.isReference).toBe(false);
    editor.setNotAssessable(true);
    expect(editor.store.getState().review.status).toBe('NOT_ASSESSABLE');
    expect(reviewIsValid(editor.store.getState())).toBe(false);
    editor.change({ notAssessableReason: 'DARK' });
    expect(reviewIsValid(editor.store.getState())).toBe(true);
    editor.store.setState({ imageStatus: 'failed' });
    expect(canSaveReview(editor.store.getState())).toBe(true);
    editor.setNotAssessable(false);
    expect(editor.store.getState().review.status).toBe('UNREVIEWED');
    expect(editor.store.getState().review.notAssessableReason).toBeUndefined();
    editor.remove(region.id);
    expect(editor.store.getState().review.status).toBe('COMPLIANT');
  });
  it('adds each source finding once with its catalog object, retains identity after edits and restores deleted options', () => {
    const editor = new InspectionEditor({ ...view, runs: [run] });
    editor.acceptSuggestion(run, 0);
    editor.acceptSuggestion(run, 0);
    expect(editor.store.getState().review.annotations).toHaveLength(1);
    expect(editor.store.getState().review.annotations[0]).toMatchObject({
      objectId: RAG,
      objectName: 'Ганчірки',
      verdict: 'VIOLATION',
      comment: '',
      sourceRunId: run.id,
      sourceFindingIndex: 0,
    });
    expect(availableSuggestions(run, editor.store.getState().review).map((s) => s.index)).toEqual([
      1,
    ]);
    const region = editor.store.getState().review.annotations[0];
    if (!region) throw new Error('Expected region');
    editor.editAnnotation(region.id, { comment: 'Corrected description', verdict: 'ALLOWED' });
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
  });
  it("applies the answer to this session's analysis to the draft once, and only for that run", () => {
    const editor = new InspectionEditor(view);
    const pendingView = {
      ...view,
      runs: [{ ...run, status: 'PENDING' as const, prediction: null }],
    };
    expect(editor.analysisResolved({ ...view, runs: [run] })).toBe(false);
    editor.analysisReceived(pendingView);
    expect(editor.analysisResolved(pendingView)).toBe(false);
    expect(editor.analysisResolved({ ...view, runs: [run] })).toBe(true);
    expect(editor.store.getState().review.annotations).toHaveLength(2);
    expect(editor.store.getState().review.status).toBe('PROBLEMS');
    expect(editor.analysisResolved({ ...view, runs: [run] })).toBe(false);
    expect(editor.store.getState().review.annotations).toHaveLength(2);
    const failed = new InspectionEditor(view);
    failed.analysisReceived(pendingView);
    expect(
      failed.analysisResolved({
        ...view,
        runs: [{ ...run, status: 'FAILED', prediction: null, errorCode: 'AI_TIMEOUT' }],
      }),
    ).toBe(false);
    expect(failed.store.getState().review.annotations).toHaveLength(0);
  });
  it('rejects an AI-drawn region from its card with a reason and counts regions, not the derived outcome', () => {
    const editor = new InspectionEditor({
      ...view,
      version: 1,
      review: { ...view.review, status: 'COMPLIANT' },
    });
    editor.acceptSuggestion(run, 0);
    editor.acceptSuggestion(run, 1);
    expect(reviewChanges(editor.store.getState())).toMatchObject({
      added: 2,
      fields: [],
      total: 2,
    });
    const [first] = editor.store.getState().review.annotations;
    expect(editor.rejectRegion(first!.id, 'WRONG_OBJECT')).toBe(true);
    expect(editor.store.getState().review).toMatchObject({
      annotations: [{ sourceFindingIndex: 1 }],
      rejectedFindings: [{ runId: run.id, index: 0, reason: 'WRONG_OBJECT' }],
    });
    expect(availableSuggestions(run, editor.store.getState().review)).toHaveLength(0);
    editor.addBox();
    const manual = editor.store.getState().review.annotations.at(-1);
    expect(editor.rejectRegion(manual!.id, 'NOT_PRESENT')).toBe(false);
    editor.setNotAssessable(true);
    expect(reviewChanges(editor.store.getState()).fields).toContain('status');
  });
  it('gives every checklist object its own color, others a stable fallback, unnamed regions white', () => {
    const rules = ['a', 'b', 'c'].map((n) => ({
      objectId: `40000000-0000-4000-8000-00000000000${n}`,
    }));
    const colors = rules.map((rule) => objectColor(rule.objectId, undefined, rules));
    expect(new Set(colors).size).toBe(3);
    expect(objectColor(RAG, undefined, view.rules)).toBe(objectColor(RAG, undefined, view.rules));
    expect(objectColor(null, 'Broom', rules)).toBe(objectColor(null, ' broom ', rules));
    expect(colors).not.toContain(objectColor(null, 'Broom', rules));
    expect(objectColor(null, undefined, rules)).toBe(UNNAMED_COLOR);
  });

  it('records rejected findings with a reason, hides them from the list and restores them', () => {
    const editor = new InspectionEditor({ ...view, runs: [run] });
    editor.rejectSuggestion(run, 1, 'NOT_PRESENT');
    editor.rejectSuggestion(run, 1, 'ALLOWED');
    expect(editor.store.getState().review.rejectedFindings).toEqual([
      { runId: run.id, index: 1, reason: 'NOT_PRESENT' },
    ]);
    expect(availableSuggestions(run, editor.store.getState().review).map((s) => s.index)).toEqual([
      0,
    ]);
    expect(rejectedSuggestions(run, editor.store.getState().review)).toMatchObject([
      { index: 1, reason: 'NOT_PRESENT' },
    ]);
    expect(editor.store.getState().review.status).toBe('COMPLIANT');
    expect(hasReviewChanges(editor.store.getState())).toBe(true);
    editor.acceptSuggestion(run, 1);
    expect(editor.store.getState().review.annotations).toHaveLength(0);
    editor.restoreSuggestion(run, 1);
    expect(editor.store.getState().review.rejectedFindings).toEqual([]);
    editor.lock();
    editor.rejectSuggestion(run, 0, 'WRONG_OBJECT');
    expect(editor.store.getState().review.rejectedFindings).toEqual([]);
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
          summary: '',
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
  it('returns to default selection by toggling the drawing tool without changing review data', () => {
    const editor = new InspectionEditor(view);
    expect(editor.store.getState().tool).toBe('select');
    editor.toggleDrawingTool('rectangle');
    expect(editor.store.getState().tool).toBe('rectangle');
    editor.toggleDrawingTool('rectangle');
    expect(editor.store.getState().tool).toBe('select');
    editor.lock();
    editor.toggleDrawingTool('rectangle');
    expect(editor.store.getState().tool).toBe('select');
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
  });
  it('detects changes against the saved review and forgets reverted ones', () => {
    const editor = new InspectionEditor({
      ...view,
      version: 1,
      review: { ...view.review, status: 'COMPLIANT' },
    });
    editor.change({ comment: 'A draft' });
    expect(hasReviewChanges(editor.store.getState())).toBe(true);
    editor.change({ comment: '' });
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
    editor.addBox();
    const region = editor.store.getState().review.annotations[0];
    if (!region) throw new Error('Expected region');
    editor.editAnnotation(region.id, { objectId: RAG, objectName: 'Ганчірки' });
    expect(hasReviewChanges(editor.store.getState())).toBe(true);
    editor.saved({ ...view, version: 2, review: editor.store.getState().review });
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
    editor.remove(region.id);
    expect(hasReviewChanges(editor.store.getState())).toBe(true);
  });
  it('keeps one analysis request identity per review version', () => {
    const editor = new InspectionEditor(view);
    const request = editor.analysisRequest();
    expect(request).toEqual({ requestId: expect.any(String), version: 0 });
    expect(editor.analysisRequest()).toEqual(request);
    editor.analysisReceived();
    expect(editor.analysisRequest().requestId).not.toBe(request.requestId);
    editor.saved({ ...view, version: 1 });
    expect(editor.analysisRequest().version).toBe(1);
    expect(editor.durationMs()).toBeGreaterThanOrEqual(0);
  });
  it('removes only the selected region', () => {
    const editor = new InspectionEditor(view);
    editor.addBox();
    editor.addBox();
    const selected = editor.store.getState().selected;
    expect(editor.removeSelected()).toBe(true);
    expect(editor.store.getState().review.annotations).toHaveLength(1);
    expect(editor.store.getState().review.annotations.some((a) => a.id === selected)).toBe(false);
    expect(editor.store.getState().selected).toBeNull();
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
    expect(hasReviewChanges(editor.store.getState())).toBe(false);
  });
  it('round trips normalized rectangles and legacy polygons independent of display size', () => {
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
      const annotation: InspectionAnnotation = {
        id,
        geometry,
        category: 'OTHER',
        objectId: null,
        verdict: 'VIOLATION',
        comment: 'Dust',
        sourceRunId: null,
      };
      expect(fromCanvas(toCanvas(annotation, 1200, 800), 1200, 800)).toEqual(geometry);
      expect(fromCanvas(toCanvas(annotation, 600, 400), 600, 400)).toEqual(geometry);
    }
  });
  it('requires a named object before a newly drawn region can be saved', () => {
    const editor = new InspectionEditor(view);
    editor.addBox();
    expect(reviewIsValid(editor.store.getState())).toBe(false);
    const annotation = editor.store.getState().review.annotations[0];
    if (!annotation) throw new Error('Expected region');
    editor.editAnnotation(annotation.id, { objectName: 'Піддон' });
    expect(reviewIsValid(editor.store.getState())).toBe(true);
    editor.saved({ ...view, version: 1, review: editor.store.getState().review });
    expect(editor.store.getState().version).toBe(1);
  });
});
