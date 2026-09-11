import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { messages } from '@vakhta/i18n';
import { PhotoInspectionView } from '@vakhta/contracts';
import { InspectionEditor, reviewIsValid } from '../model/editor';
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
const RAG = '40000000-0000-4000-8000-000000000001';
const PALLET = '40000000-0000-4000-8000-000000000002';
const objects = [
  { id: RAG, name: 'Rags', active: true, color: '#0a84ff' },
  { id: PALLET, name: 'Pallets', active: true, color: '#0a84ff' },
];
const rules = [{ objectId: RAG, name: 'Rags', note: 'On the table' }];
const view = PhotoInspectionView.parse({
  version: 0,
  canEdit: true,
  updatedAt: null,
  updatedBy: null,
  rules,
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
  runs: [],
});

it('names a region from checklist objects, sets its verdict and shows the computed outcome', () => {
  const editor = new InspectionEditor(view);
  editor.addBox();
  render(<EditableReview editor={editor} busy={false} rules={rules} objects={objects} />);
  expect(screen.getByTestId('review-outcome').textContent).toBe(t.statuses.PROBLEMS);
  expect(reviewFeedback(editor.store.getState().review, false)).toEqual({
    key: 'names',
    regions: [1],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Rags' }));
  expect(editor.store.getState().review.annotations[0]).toMatchObject({
    objectId: RAG,
    objectName: 'Rags',
    verdict: 'VIOLATION',
  });
  expect(reviewIsValid(editor.store.getState())).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: t.verdicts.ALLOWED }));
  expect(editor.store.getState().review.annotations[0]?.verdict).toBe('ALLOWED');
  expect(screen.getByTestId('review-outcome').textContent).toBe(t.statuses.COMPLIANT);
  fireEvent.click(screen.getByRole('checkbox', { name: t.reference }));
  expect(editor.store.getState().review.isReference).toBe(true);
});
it('offers catalog objects outside the checklist list and a free-text other object', () => {
  const editor = new InspectionEditor(view);
  editor.addBox();
  render(<EditableReview editor={editor} busy={false} rules={rules} objects={objects} />);
  fireEvent.change(screen.getByRole('combobox', { name: t.objectCatalog }), {
    target: { value: PALLET },
  });
  expect(editor.store.getState().review.annotations[0]).toMatchObject({
    objectId: PALLET,
    objectName: 'Pallets',
  });
  fireEvent.change(screen.getByRole('combobox', { name: t.objectCatalog }), {
    target: { value: '__other__' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: t.objectOther }), {
    target: { value: 'Broom' },
  });
  expect(editor.store.getState().review.annotations[0]).toMatchObject({
    objectId: null,
    objectName: 'Broom',
  });
});
it('creates a missing catalog object from the region list and names the region with it', async () => {
  const editor = new InspectionEditor(view);
  editor.addBox();
  const created = {
    id: '40000000-0000-4000-8000-000000000009',
    name: 'Пляшка',
    active: true,
    color: '#0a84ff',
  };
  const onCreateObject = vi.fn().mockResolvedValue(created);
  render(
    <EditableReview
      editor={editor}
      busy={false}
      rules={rules}
      objects={objects}
      onCreateObject={onCreateObject}
    />,
  );
  fireEvent.click(screen.getByRole('combobox', { name: t.objectCatalog }));
  fireEvent.change(await screen.findByPlaceholderText(messages('en').ui.common.search), {
    target: { value: 'Пляшка' },
  });
  fireEvent.click(await screen.findByText(`${t.objectCreate}: «Пляшка»`));
  expect(onCreateObject).toHaveBeenCalledWith('Пляшка');
  await waitFor(() =>
    expect(editor.store.getState().review.annotations[0]).toMatchObject({
      objectId: created.id,
      objectName: 'Пляшка',
    }),
  );
});
it('switches to not assessable with a reason and keeps the note when switching back', () => {
  const editor = new InspectionEditor(view);
  render(<EditableReview editor={editor} busy={false} />);
  fireEvent.click(screen.getByRole('checkbox', { name: t.notAssessable }));
  expect(screen.getByTestId('review-outcome').textContent).toBe(t.statuses.NOT_ASSESSABLE);
  expect(reviewFeedback(editor.store.getState().review, false)?.key).toBe('reason');
  fireEvent.change(screen.getByRole('combobox', { name: t.notAssessableReason }), {
    target: { value: 'OTHER' },
  });
  expect(reviewIsValid(editor.store.getState())).toBe(false);
  fireEvent.change(screen.getByRole('textbox', { name: new RegExp(t.assessmentReason) }), {
    target: { value: 'Wrong machine' },
  });
  expect(reviewIsValid(editor.store.getState())).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: t.notAssessable }));
  expect(editor.store.getState().review).toMatchObject({
    status: 'COMPLIANT',
    comment: 'Wrong machine',
  });
});
it('shows stored objects and verdicts read-only and keeps rules behind a disclosure', () => {
  const editor = new InspectionEditor({
    ...view,
    canEdit: false,
    version: 1,
    review: {
      ...view.review,
      status: 'COMPLIANT',
      annotations: [
        {
          id,
          objectId: RAG,
          verdict: 'ALLOWED',
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
      <ReadOnlyReview editor={editor} objects={objects} />
      <InspectionRules rules={rules} />
    </>,
  );
  expect(screen.getByText('Rags')).toBeTruthy();
  expect(screen.getByText(t.verdicts.ALLOWED)).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByText(`${t.ruleNote}: On the table`)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: `${t.rulesReference} (1)` }));
  expect(screen.getByText(`${t.ruleNote}: On the table`)).toBeTruthy();
});
