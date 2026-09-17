import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { createImageAnnotator } from '@annotorious/annotorious';
import { afterEach, expect, it, vi } from 'vitest';
import { PhotoInspectionView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { reviewFixture, reviewPhotos } from '@/preview/review-fixtures';
import { inspectionApi } from '../api/inspection-api';
import type * as InspectionApiModule from '../api/inspection-api';
import { PhotoInspectionDialog } from './inspection-dialog';

const canvas = vi.hoisted(() => ({
  destroy: vi.fn(),
  setAnnotations: vi.fn(),
  setStyle: vi.fn(),
  on: vi.fn(),
  cancelDrawing: vi.fn(),
  cancelSelected: vi.fn(),
  setDrawingEnabled: vi.fn(),
  setUserSelectAction: vi.fn(),
  state: { store: { observe: vi.fn(), unobserve: vi.fn(), getAnnotation: vi.fn() } },
}));
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(() => canvas),
  ShapeType: { RECTANGLE: 'RECTANGLE', POLYGON: 'POLYGON' },
  UserSelectAction: { EDIT: 'EDIT', SELECT: 'SELECT' },
}));
vi.mock('../api/inspection-api', async (importOriginal) => {
  const original = await importOriginal<typeof InspectionApiModule>();
  Object.assign(original.inspectionApi, {
    get: vi.fn(),
    link: vi.fn(async () => ({
      url: 'https://example.test/photo.svg',
      expiresAt: '2099-01-01T00:00:00Z',
    })),
    limits: vi.fn(async () => ({
      windowHours: 24,
      perPhoto: { used: 1, limit: 5 },
      global: { used: 14, limit: 1000 },
    })),
    objects: vi.fn(async () => ({ objects: [], canEdit: false })),
    save: vi.fn(),
  });
  return original;
});
afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  vi.clearAllMocks();
});
const t = messages(currentLocale()).photoInspection;
function deferred<T>() {
  let resolve = (_value: T): void => {
    throw new Error('Promise not initialized');
  };
  let reject = (_reason: Error): void => {
    throw new Error('Promise not initialized');
  };
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function openPhoto() {
  const photo = reviewPhotos[0];
  if (!photo) throw new Error('Missing photo fixture');
  const response = reviewFixture(
    `/admin/handovers/hv1/photos/${photo.media.id}/${photo.itemKey}/inspection`,
    'GET',
  );
  if (!response) throw new Error('Missing review fixture');
  const view = PhotoInspectionView.parse(await response.json());
  vi.mocked(inspectionApi.get).mockResolvedValue(view);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <PhotoInspectionDialog
        sessionId="test-session"
        handoverId="hv1"
        photo={photo}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await screen.findByTestId('photo-inspection');
  const image = await screen.findByRole('img', { name: photo.label });
  Object.defineProperties(image, {
    naturalWidth: { value: 720 },
    naturalHeight: { value: 1280 },
    complete: { value: true },
  });
  fireEvent.load(image);
  await waitFor(() => expect(createImageAnnotator).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: t.zoomIn }));
  const plane = image.parentElement;
  if (!plane) throw new Error('Missing image plane');
  expect(plane.style.transform).toBe('scale(1.5)');
  const stable = () => {
    expect(screen.getByRole('img', { name: photo.label })).toBe(image);
    expect(plane.style.transform).toBe('scale(1.5)');
    expect(createImageAnnotator).toHaveBeenCalledOnce();
    expect(canvas.destroy).not.toHaveBeenCalled();
  };
  return { view, stable };
}
function editReview() {
  fireEvent.click(screen.getByRole('checkbox', { name: t.notAssessable }));
  fireEvent.change(screen.getByRole('combobox', { name: t.notAssessableReason }), {
    target: { value: 'DARK' },
  });
}
it('retains the loaded image, zoom and annotations during edits and a delayed successful save', async () => {
  const { view, stable } = await openPhoto();
  editReview();
  stable();
  const save = deferred<PhotoInspectionView>();
  vi.mocked(inspectionApi.save).mockReturnValueOnce(save.promise);
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await waitFor(() => expect(inspectionApi.save).toHaveBeenCalledOnce());
  stable();
  expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(true);
  const request = vi.mocked(inspectionApi.save).mock.calls[0]?.[1];
  if (!request) throw new Error('Missing save payload');
  await act(async () => save.resolve({ ...view, version: 1, review: request.review }));
  stable();
  expect(screen.queryByText(new RegExp(t.dirty))).toBeNull();
  expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(true);
});
it('keeps the draft and viewer after a failed save and allows retry', async () => {
  const { stable } = await openPhoto();
  editReview();
  const save = deferred<PhotoInspectionView>();
  vi.mocked(inspectionApi.save).mockReturnValueOnce(save.promise);
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await waitFor(() => expect(inspectionApi.save).toHaveBeenCalledOnce());
  stable();
  await act(async () => save.reject(new Error('Offline')));
  expect((await screen.findByText(t.error)).closest('[role="alert"]')).toBeTruthy();
  const reason = screen.getByRole('combobox', { name: t.notAssessableReason });
  if (!(reason instanceof HTMLSelectElement)) throw new Error('Missing reason select');
  expect(reason.value).toBe('DARK');
  expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(false);
  stable();
});
it('refreshes inspection data on focus without fetching and remounting the loaded photo', async () => {
  const { stable } = await openPhoto();
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await waitFor(() => expect(inspectionApi.get).toHaveBeenCalledTimes(2));
  expect(inspectionApi.link).toHaveBeenCalledOnce();
  stable();
});
it('requests a fresh link and recreates a failed image on explicit retry', async () => {
  await openPhoto();
  const image = screen.getByRole('img');
  fireEvent.error(image);
  fireEvent.click(screen.getByRole('button', { name: t.refresh }));
  await waitFor(() => expect(inspectionApi.link).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('img')).not.toBe(image));
  expect(canvas.destroy).toHaveBeenCalledOnce();
});
