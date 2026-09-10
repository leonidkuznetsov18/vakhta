import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { render } from '../../test-utils';
import { currentLocale } from '@/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { Lightbox } from './photo';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: vi.fn(() => false) }));
const images = Array.from({ length: 100 }, (_, index) => ({
  url: `/photo-${index}.jpg`,
  label: `Photo ${index + 1}`,
}));
const labels = messages(currentLocale()).admin.handover;

describe('Lightbox navigation', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it('mounts only the current image on mobile and navigates the complete gallery', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<Lightbox images={images} title="Photos" onClose={() => undefined} />);
    expect(document.querySelectorAll('img')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Photo 2' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: labels.nextPhoto }));
    expect(screen.getByRole('img', { name: 'Photo 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: labels.prevPhoto }));
    fireEvent.click(screen.getByRole('button', { name: labels.prevPhoto }));
    expect(screen.getByRole('img', { name: 'Photo 100' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByRole('img', { name: 'Photo 1' })).toBeTruthy();
    expect(document.querySelectorAll('img')).toHaveLength(1);
  });

  it('zooms within bounds, pans with keys and resets for the next photo', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    render(<Lightbox images={images} title="Photos" onClose={() => undefined} />);
    const image = screen.getByRole('img', { name: 'Photo 1' });
    await waitFor(() => expect(image.style.transform).toContain('scale(1)'));
    fireEvent.click(screen.getByRole('button', { name: labels.zoomIn }));
    await waitFor(() => expect(image.style.transform).not.toContain('scale(1)'));
    fireEvent.keyDown(image, { key: 'ArrowRight' });
    expect(screen.getByRole('img', { name: 'Photo 1' })).toBeTruthy();
    for (let i = 0; i < 20; i++) fireEvent.keyDown(image, { key: '+' });
    await waitFor(() => expect(image.style.transform).toContain('scale(5)'));
    expect(screen.getByRole('button', { name: labels.zoomIn }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(image, { key: '0' });
    await waitFor(() => expect(image.style.transform).toContain('scale(1)'));
    fireEvent.keyDown(image, { key: '-' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: labels.zoomOut }).hasAttribute('disabled')).toBe(
        true,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: labels.zoomIn }));
    await waitFor(() => expect(image.style.transform).not.toContain('scale(1)'));
    fireEvent.click(screen.getByRole('button', { name: labels.nextPhoto }));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Photo 2' }).style.transform).toContain('scale(1)'),
    );
    expect(screen.getByRole('status', { name: labels.zoomLevel }).textContent).toBe('100%');
  });

  it('retains direct thumbnail navigation on desktop', () => {
    render(<Lightbox images={images.slice(0, 3)} title="Photos" onClose={() => undefined} />);
    expect(document.querySelectorAll('img')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Photo 3' }));
    expect(screen.getByRole('img', { name: 'Photo 3' })).toBeTruthy();
  });
});
