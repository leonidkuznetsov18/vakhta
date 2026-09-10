import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
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

  it('retains direct thumbnail navigation on desktop', () => {
    render(<Lightbox images={images.slice(0, 3)} title="Photos" onClose={() => undefined} />);
    expect(document.querySelectorAll('img')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Photo 3' }));
    expect(screen.getByRole('img', { name: 'Photo 3' })).toBeTruthy();
  });
});
