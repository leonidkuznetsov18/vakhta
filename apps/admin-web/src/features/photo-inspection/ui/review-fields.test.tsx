import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { messages } from '@vakhta/i18n';
import { PhotoInspectionView } from '@vakhta/contracts';
import { InspectionEditor, reviewIsValid } from '../model/editor';
import { hasReviewChanges } from '../model/review-changes';
import { reviewFeedback } from '../model/review-feedback';
import { EditableReview, ReadOnlyReview } from './review-fields';
import { InspectionRules } from './inspection-rules';
vi.mock('@/i18n', () => ({ currentLocale: () => 'en' }));
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(),
  ShapeType: {},
  UserSelectAction: {},
}));
afterEach(cleanup);
const t = messages('en').photoInspection;
const id = '10000000-0000-4000-8000-000000000001';
const view = PhotoInspectionView.parse({
  version: 0,
  canEdit: true,
  updatedAt: null,
  updatedBy: null,
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
        summary: 'Possible issues',
        limitations: '',
        findings: ['Rag', 'Tool'].map((comment) => ({
          comment,
          category: 'OTHER',
          geometry: { type: 'RECTANGLE', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        })),
      },
    },
  ],
});

it('names a region from checklist presets without duplicate prose and tracks name-only edits', () => {
  const editor = new InspectionEditor(view);
  editor.addBox();
  render(<EditableReview editor={editor} busy={false} items={['Rags', 'Cups']} />);
  expect(screen.queryByRole('textbox', { name: new RegExp(t.regionDetails) })).toBeNull();
  expect(screen.queryByRole('textbox', { name: new RegExp(t.reviewComment) })).toBeNull();
  expect(reviewFeedback(editor.store.getState().review, false)).toEqual({
    key: 'names',
    regions: [1],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cups' }));
  expect(editor.store.getState().review.annotations[0]).toMatchObject({
    objectName: 'Cups',
    comment: '',
    sourceRunId: null,
  });
  expect(reviewIsValid(editor.store.getState())).toBe(true);
  act(() =>
    editor.saved({ ...view, version: 1, review: structuredClone(editor.store.getState().review) }),
  );
  expect(hasReviewChanges(editor.store.getState())).toBe(false);
  fireEvent.change(screen.getByRole('textbox', { name: t.objectName }), {
    target: { value: 'Tools' },
  });
  expect(hasReviewChanges(editor.store.getState())).toBe(true);
});
it('keeps existing descriptions visible and retains them when a reviewer adds a name', () => {
  const editor = new InspectionEditor(view);
  const run = view.runs[0];
  if (!run) throw new Error('Expected run');
  editor.acceptSuggestion(run, 0);
  render(<EditableReview editor={editor} busy={false} items={['Rags']} />);
  expect(screen.getByRole('textbox', { name: new RegExp(t.regionDetails) })).toBe(
    screen.getByDisplayValue('Rag'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Rags' }));
  expect(editor.store.getState().review.annotations[0]).toMatchObject({
    objectName: 'Rags',
    comment: 'Rag',
    sourceRunId: run.id,
    sourceFindingIndex: 0,
  });
});
it('opens the reason when assessment is impossible without discarding notes after status changes', () => {
  const editor = new InspectionEditor(view);
  render(<EditableReview editor={editor} busy={false} />);
  fireEvent.change(screen.getByRole('combobox', { name: t.status }), {
    target: { value: 'NOT_ASSESSABLE' },
  });
  expect(reviewFeedback(editor.store.getState().review, false)?.key).toBe('reason');
  fireEvent.change(screen.getByRole('textbox', { name: t.assessmentReason }), {
    target: { value: 'Dark image' },
  });
  expect(reviewIsValid(editor.store.getState())).toBe(true);
  fireEvent.change(screen.getByRole('combobox', { name: t.status }), {
    target: { value: 'UNREVIEWED' },
  });
  expect(screen.getByRole('textbox', { name: new RegExp(t.reviewComment) })).toBe(
    screen.getByDisplayValue('Dark image'),
  );
});
it('shows stored names read-only and keeps full rules behind a disclosure', () => {
  const editor = new InspectionEditor({
    ...view,
    canEdit: false,
    review: {
      ...view.review,
      status: 'PROBLEMS',
      annotations: [
        {
          id,
          objectName: 'Cups',
          comment: '',
          category: 'OTHER',
          sourceRunId: null,
          geometry: { type: 'RECTANGLE', x: 0, y: 0, width: 0.2, height: 0.2 },
        },
      ],
    },
  });
  render(
    <>
      <ReadOnlyReview editor={editor} />
      <InspectionRules
        items={['Rags']}
        details={[
          { item: 'Rags', clarification: 'On the table', exceptions: 'Allowed in a holder' },
        ]}
      />
    </>,
  );
  expect(screen.getByText('Cups')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByText('On the table')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: `${t.rulesReference} (1)` }));
  expect(screen.getByText('On the table')).toBeTruthy();
  expect(screen.getByText(`${t.ruleExceptions}: Allowed in a holder`)).toBeTruthy();
});
