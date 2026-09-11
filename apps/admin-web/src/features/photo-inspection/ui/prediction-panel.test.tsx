import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { messages } from '@vakhta/i18n';
import { PhotoInspectionView } from '@vakhta/contracts';
import { InspectionEditor } from '../model/editor';
import { PredictionPanel } from './prediction-panel';
vi.mock('@/i18n', () => ({ currentLocale: () => 'en' }));
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(),
  ShapeType: {},
  UserSelectAction: {},
}));
afterEach(cleanup);
const t = messages('en').photoInspection;
const id = '10000000-0000-4000-8000-000000000001';
const RAG = '40000000-0000-4000-8000-000000000001';
const view = PhotoInspectionView.parse({
  version: 0,
  canEdit: true,
  updatedAt: null,
  updatedBy: null,
  rules: [{ objectId: RAG, name: 'Rags', note: '' }],
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
    businessDate: '2026-09-11',
    sha256: 'a',
    encodedWidth: 1000,
    encodedHeight: 650,
    contentType: 'image/jpeg',
    orientationPolicy: 'EXIF_AUTO_ORIENT',
  },
  review: { status: 'UNREVIEWED', comment: '', guidance: '', annotations: [] },
  runs: [
    {
      id,
      status: 'SUCCEEDED',
      model: 'test',
      promptVersion: 'test',
      requestedAt: '',
      completedAt: '',
      reviewVersion: 0,
      errorCode: null,
      prediction: {
        status: 'PROBLEMS',
        summary: 'Rags: 2',
        limitations: '',
        findings: ['rag left', 'rag right'].map((comment) => ({
          comment,
          objectId: RAG,
          objectName: 'Rags',
          category: 'OTHER',
          geometry: { type: 'RECTANGLE', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        })),
      },
    },
  ],
});
it('accepts, rejects with a reason and restores suggestions while announcing completion', () => {
  const editor = new InspectionEditor(view);
  const onRate = vi.fn();
  render(<PredictionPanel latest={view} editor={editor} disabled={false} onRate={onRate} />);
  expect(screen.getByText(`${t.aiSummary}: 2 (Rags: 2)`)).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: t.accept })[0] ?? fail());
  expect(screen.queryByText('Rags — rag left')).toBeNull();
  expect(editor.store.getState().review.annotations[0]).toMatchObject({
    objectId: RAG,
    comment: '',
  });
  act(() => {
    editor.rejectSuggestion(view.runs[0]!, 1, 'NOT_PRESENT');
  });
  expect(screen.queryByRole('button', { name: t.accept })).toBeNull();
  expect(screen.getByRole('status').textContent).toBe(t.allSuggestionsAdded);
  expect(screen.getByText(`${t.rejected}: ${t.rejectReasons.NOT_PRESENT}`)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.restore }));
  expect(screen.getByText('Rags — rag right')).toBeTruthy();
  const region = editor.store.getState().review.annotations[0];
  if (!region) throw new Error('Expected region');
  act(() => {
    editor.remove(region.id);
  });
  expect(screen.getAllByRole('button', { name: t.accept })).toHaveLength(2);
});
it('asks whether AI helped and reports the chosen rating for this run', () => {
  const onRate = vi.fn();
  render(
    <PredictionPanel
      latest={view}
      editor={new InspectionEditor(view)}
      disabled={false}
      onRate={onRate}
    />,
  );
  fireEvent.click(screen.getByRole('radio', { name: t.feedbackRatings.PARTIAL }));
  expect(onRate).toHaveBeenCalledWith(view.runs[0]!.id, 'PARTIAL');
  expect(screen.queryByText(t.feedbackSaved)).toBeNull();
  const rated = {
    ...view,
    runs: [{ ...view.runs[0]!, feedback: { rating: 'HELPFUL' as const, comment: null } }],
  };
  cleanup();
  render(
    <PredictionPanel
      latest={rated}
      editor={new InspectionEditor(rated)}
      disabled={false}
      onRate={onRate}
    />,
  );
  expect(
    screen.getByRole('radio', { name: t.feedbackRatings.HELPFUL }).getAttribute('aria-checked'),
  ).toBe('true');
  expect(screen.getByText(t.feedbackSaved)).toBeTruthy();
});
it('explains a missing object list instead of a generic failure', () => {
  const failed = {
    ...view,
    runs: [
      { ...view.runs[0]!, status: 'FAILED' as const, prediction: null, errorCode: 'RULES_MISSING' },
    ],
  };
  render(
    <PredictionPanel
      latest={failed}
      editor={new InspectionEditor(failed)}
      disabled={false}
      onRate={vi.fn()}
    />,
  );
  expect(screen.getByRole('alert').textContent).toBe(t.aiRulesMissing);
  cleanup();
  const quota = {
    ...view,
    runs: [
      {
        ...view.runs[0]!,
        status: 'FAILED' as const,
        prediction: null,
        errorCode: 'AI_QUOTA_EXCEEDED',
      },
    ],
  };
  render(
    <PredictionPanel
      latest={quota}
      editor={new InspectionEditor(quota)}
      disabled={false}
      onRate={vi.fn()}
    />,
  );
  expect(screen.getByRole('alert').textContent).toBe(t.aiQuotaExceeded);
});
function fail(): never {
  throw new Error('Expected suggestion');
}
