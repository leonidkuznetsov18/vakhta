import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { HandoverPhotoView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '@/test-utils';
import { inspectionApi } from '../api/inspection-api';
import type * as InspectionApiModule from '../api/inspection-api';
import { PhotoInspectionDialog } from './inspection-dialog';
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(),
  ShapeType: { RECTANGLE: 'RECTANGLE', POLYGON: 'POLYGON' },
  UserSelectAction: { EDIT: 'EDIT', SELECT: 'SELECT' },
}));
vi.mock('../api/inspection-api', async (importOriginal) => ({
  ...(await importOriginal<typeof InspectionApiModule>()),
  inspectionApi: { get: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
