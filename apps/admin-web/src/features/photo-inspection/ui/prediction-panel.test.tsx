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
it('removes accepted options, announces completion and restores a deleted option in source order', () => {
  const editor = new InspectionEditor(view);
  render(<PredictionPanel latest={view} editor={editor} disabled={false} />);
  fireEvent.click(screen.getAllByRole('button', { name: t.accept })[0] ?? fail());
  expect(screen.queryByText('Rag')).toBeNull();
  expect(screen.getByText('Tool')).toBeTruthy();
  const region = editor.store.getState().review.annotations[0];
  if (!region) throw new Error('Expected region');
  fireEvent.click(screen.getByRole('button', { name: t.accept }));
  expect(screen.queryByRole('button', { name: t.accept })).toBeNull();
  expect(screen.getByRole('status').textContent).toBe(t.allSuggestionsAdded);
  act(() => {
    editor.remove(region.id);
  });
  expect(screen.getByText('Rag')).toBeTruthy();
  expect(screen.queryByText('Tool')).toBeNull();
  expect(screen.getAllByRole('button', { name: t.accept })).toHaveLength(1);
});
function fail(): never {
  throw new Error('Expected suggestion');
}
