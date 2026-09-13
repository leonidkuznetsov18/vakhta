import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { ApiError } from '@/api';
import { render } from '@/test-utils';
import { ScheduleExport } from './schedule-export';
import { requestScheduleExport, downloadScheduleExport } from '../api/schedule-export';

vi.mock('../api/schedule-export', () => ({
  requestScheduleExport: vi.fn(),
  downloadScheduleExport: vi.fn(),
}));
const t = messages(currentLocale()).scheduleExport;
const id = 'd0000000-0000-4000-8000-000000000001';
const props = { id, revision: 3, refreshing: false, refresh: vi.fn() };
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('saved-version download', () => {
  it('downloads only the selected saved revision and prevents duplicate taps', async () => {
    let resolve: (blob: Blob) => void = () => {
      throw new Error('Not started');
    };
    vi.mocked(requestScheduleExport).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<ScheduleExport {...props} />);
    fireEvent.click(screen.getByRole('button', { name: t.download }));
    await screen.findByText(t.preparing);
    expect(screen.getByRole('button', { name: t.preparing }).hasAttribute('disabled')).toBe(true);
    expect(requestScheduleExport).toHaveBeenCalledExactlyOnceWith(id, 3);
    const blob = new Blob(['workbook']);
    await act(async () => {
      resolve(blob);
    });
    await waitFor(() =>
      expect(downloadScheduleExport).toHaveBeenCalledExactlyOnceWith(blob, id, 3),
    );
  });
  it('does not download a late response after the version or actor detail unmounts', async () => {
    let resolve: (blob: Blob) => void = () => {
      throw new Error('Not started');
    };
    vi.mocked(requestScheduleExport).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = render(<ScheduleExport {...props} />);
    fireEvent.click(screen.getByRole('button', { name: t.download }));
    await screen.findByText(t.preparing);
    view.unmount();
    await act(async () => {
      resolve(new Blob(['workbook']));
    });
    expect(downloadScheduleExport).not.toHaveBeenCalled();
  });
  it('requires explicit refresh after a stale revision and permits retry for a network failure', async () => {
    vi.mocked(requestScheduleExport).mockRejectedValueOnce(
      new ApiError(409, 'SCHEDULE_REVISION_CONFLICT', 'stale'),
    );
    const view = render(<ScheduleExport {...props} />);
    fireEvent.click(screen.getByRole('button', { name: t.download }));
    await screen.findByText(t.stale);
    expect(screen.getByRole('button', { name: t.download }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.refresh }));
    expect(props.refresh).toHaveBeenCalledOnce();
    view.rerender(<ScheduleExport key={4} {...props} revision={4} />);
    vi.mocked(requestScheduleExport).mockRejectedValueOnce(new TypeError('offline'));
    fireEvent.click(screen.getByRole('button', { name: t.download }));
    await screen.findByText(t.failed);
    expect(screen.getByRole('button', { name: t.download }).hasAttribute('disabled')).toBe(false);
    expect(downloadScheduleExport).not.toHaveBeenCalled();
  });
  it('blocks export while saved details are unavailable or refreshing', () => {
    const view = render(<ScheduleExport {...props} revision={0} />);
    expect(screen.getByRole('button', { name: t.download }).hasAttribute('disabled')).toBe(true);
    view.rerender(<ScheduleExport {...props} refreshing />);
    expect(screen.getByRole('button', { name: t.download }).hasAttribute('disabled')).toBe(true);
    expect(requestScheduleExport).not.toHaveBeenCalled();
  });
});
