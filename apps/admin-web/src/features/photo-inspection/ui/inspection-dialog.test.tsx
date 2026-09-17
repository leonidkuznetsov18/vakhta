import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { HandoverPhotoView, PhotoInspectionView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { NavigationProvider } from '@/navigation';
import { reviewFixture, reviewPhotos } from '@/preview/review-fixtures';
import { render } from '@/test-utils';
import { inspectionApi } from '../api/inspection-api';
import type * as InspectionApiModule from '../api/inspection-api';
import { PhotoInspectionDialog } from './inspection-dialog';
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(),
  ShapeType: { RECTANGLE: 'RECTANGLE', POLYGON: 'POLYGON' },
  UserSelectAction: { EDIT: 'EDIT', SELECT: 'SELECT' },
}));
vi.mock('../api/inspection-api', async (importOriginal) => {
  const original = await importOriginal<typeof InspectionApiModule>();
  Object.assign(original.inspectionApi, {
    get: vi.fn(),
    link: vi.fn(() => new Promise(() => undefined)),
    limits: vi.fn(() => new Promise(() => undefined)),
    objects: vi.fn(async () => ({ objects: [], canEdit: false })),
  });
  return original;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
it('lets the reviewer skip a photo when its initial inspection request fails', async () => {
  vi.mocked(inspectionApi.get).mockRejectedValue(new Error('Offline'));
  const photo = HandoverPhotoView.parse({
    itemKey: 'PHOTO_1',
    label: 'First photo',
    media: {
      id: '20000000-0000-4000-8000-000000000001',
      quality: 'OK',
      width: 720,
      height: 1280,
      receivedAt: '2026-09-12T08:00:00Z',
      processedAt: null,
      duplicateOfId: null,
    },
  });
  const next = { ...photo, itemKey: 'PHOTO_2', label: 'Second photo' };
  const onPhotoChange = vi.fn();
  render(
    <PhotoInspectionDialog
      sessionId="test-session"
      handoverId="handover"
      photo={photo}
      photos={[photo, next]}
      onClose={vi.fn()}
      onPhotoChange={onPhotoChange}
    />,
  );
  const t = messages(currentLocale()).photoInspection;
  await screen.findByText(t.error);
  fireEvent.click(screen.getByRole('button', { name: t.next }));
  expect(onPhotoChange).toHaveBeenCalledWith(next);
});

async function renderRuleShortcut(roles: string[] = ['SHIFT_MASTER']) {
  const photo = reviewPhotos[0];
  if (!photo) throw new Error('Missing preview photo');
  const response = reviewFixture(
    `/admin/handovers/hv1/photos/${photo.media.id}/${photo.itemKey}/inspection`,
    'GET',
  );
  if (!response) throw new Error('Missing inspection fixture');
  const view = PhotoInspectionView.parse(await response.json());
  // The source version need not be the latest catalog version, and zero rules still needs editing.
  view.rules = [];
  view.context.checklistDefinitionId = '90000000-0000-4000-8000-000000000001';
  vi.mocked(inspectionApi.get).mockResolvedValue(view);
  const go = vi.fn();
  render(
    <NavigationProvider roles={roles} go={go}>
      <PhotoInspectionDialog
        sessionId="test-session"
        handoverId="hv1"
        photo={photo}
        onClose={vi.fn()}
      />
    </NavigationProvider>,
  );
  await screen.findByTestId('photo-inspection');
  return go;
}

it('links directly to the source checklist rule editor even with no rules', async () => {
  const go = await renderRuleShortcut();
  const link = screen.getByRole('link', {
    name: messages(currentLocale()).checklistPhotoRules.editRules,
  });
  expect(link.getAttribute('href')).toBe(
    '#/administration/checklists/90000000-0000-4000-8000-000000000001',
  );
  fireEvent.click(link);
  expect(go).toHaveBeenCalledWith(
    'administration',
    'checklists/90000000-0000-4000-8000-000000000001',
  );
});

it('keeps unsaved photo edits when rule navigation is cancelled', async () => {
  const go = await renderRuleShortcut();
  const t = messages(currentLocale()).photoInspection;
  fireEvent.click(screen.getByRole('checkbox', { name: t.notAssessable }));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const link = screen.getByRole('link', {
    name: messages(currentLocale()).checklistPhotoRules.editRules,
  });
  fireEvent.click(link);
  expect(confirm).toHaveBeenCalledWith(t.discard);
  expect(go).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(link);
  expect(go).toHaveBeenCalledOnce();
});

it('does not offer rule editing to an auditor', async () => {
  await renderRuleShortcut(['AUDITOR']);
  expect(
    screen.queryByRole('link', { name: messages(currentLocale()).checklistPhotoRules.editRules }),
  ).toBeNull();
});
