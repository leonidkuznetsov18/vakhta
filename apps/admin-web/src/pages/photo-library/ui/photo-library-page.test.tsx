import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '@/test-utils';
import { PhotoLibraryPage } from './photo-library-page';
import { libraryApi } from '../api/library-api';
import type { PhotoLibraryEntry } from '@vakhta/contracts';

vi.mock('../api/library-api', () => ({ libraryApi: { list: vi.fn(), link: vi.fn() } }));
vi.mock('@/features/photo-inspection', () => ({
  InspectionPhoto: ({ photo }: { photo: PhotoLibraryEntry['photo'] }) => <span>{photo.label}</span>,
  PhotoInspectionDialog: ({ photo }: { photo: PhotoLibraryEntry['photo'] }) => (
    <div role="dialog">{photo.itemKey}</div>
  ),
}));
const t = messages(currentLocale()).photoLibrary;
const pagination = messages(currentLocale()).ui.pagination;
function row(index: number): PhotoLibraryEntry {
  return {
    id: crypto.randomUUID(),
    handoverId: crypto.randomUUID(),
    photo: {
      itemKey: `item-${index}`,
      label: `Photo ${index}`,
      media: {
        id: crypto.randomUUID(),
        quality: 'OK',
        width: 100,
        height: 100,
        receivedAt: '2026-09-10T10:00:00Z',
        processedAt: null,
        duplicateOfId: null,
      },
    },
    status: 'COMPLIANT',
    annotationCount: 0,
    remarks: [],
    updatedAt: '2026-09-10T10:00:00Z',
    businessDate: '2026-09-10',
    zone: 'Zone A',
    employee: 'Worker',
    archived: false,
  };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('saved photo library', () => {
  it('renders server page two without slicing it again and resets the page when searching', async () => {
    vi.mocked(libraryApi.list).mockImplementation(async (input) => ({
      page: input.page,
      pageSize: input.pageSize,
      total: 22,
      rows: input.page === 1 ? [row(1)] : [row(21), row(22)],
    }));
    render(<PhotoLibraryPage />);
    await screen.findByText('Photo 1');
    fireEvent.click(screen.getByRole('button', { name: pagination.next }));
    await screen.findByText('Photo 21');
    expect(screen.getByText('Photo 22')).toBeTruthy();
    expect(screen.queryByText('Photo 1')).toBeNull();
    fireEvent.change(screen.getByLabelText(t.search), { target: { value: 'Zone A' } });
    fireEvent.click(screen.getByRole('button', { name: t.searchAction }));
    await waitFor(() =>
      expect(libraryApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, search: 'Zone A' }),
        expect.any(AbortSignal),
      ),
    );
    await screen.findByText('Photo 1');
    expect(screen.queryByRole('columnheader', { name: t.actions })).toBeNull();
    fireEvent.click(screen.getByText('Zone A'));
    expect(screen.getByRole('dialog').textContent).toBe('item-1');
  });
  it('keeps a native keyboard-accessible control for opening the photo', async () => {
    vi.mocked(libraryApi.list).mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      rows: [row(1)],
    });
    render(<PhotoLibraryPage />);
    const open = await screen.findByRole('button', { name: /Photo 1/ });
    open.focus();
    expect(document.activeElement).toBe(open);
    expect(open.tagName).toBe('BUTTON');
    fireEvent.click(open);
    expect(screen.getByRole('dialog').textContent).toBe('item-1');
  });
  it('does not claim an empty library when the request fails', async () => {
    vi.mocked(libraryApi.list).mockRejectedValue(new Error('Unavailable'));
    render(<PhotoLibraryPage />);
    await screen.findByRole('alert');
    expect(screen.queryByText(t.empty)).toBeNull();
    expect(
      screen.getByRole('button', { name: messages(currentLocale()).ui.common.retry }),
    ).toBeTruthy();
  });
});
