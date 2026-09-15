import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarDaysIcon } from 'lucide-react';
import { KpiTile } from './kpi-tile';
import { messages } from '@vakhta/i18n';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([false, true])(
  'opens the explanation without navigating away from Overview (touch: %s)',
  async (isTouch) => {
    const matchMedia = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      ...matchMedia(query),
      matches: isTouch && query.includes('pointer: coarse'),
    }));
    const onOpen = vi.fn();
    render(
      <KpiTile
        icon={CalendarDaysIcon}
        title="Schedule"
        hint="Scheduling explanation"
        value="0"
        onOpen={onOpen}
        openLabel="Open Schedule"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: messages('ru').ui.common.moreInfo }));
    expect(onOpen).not.toHaveBeenCalled();
    if (isTouch) expect(await screen.findByText('Scheduling explanation')).toBeTruthy();
    expect(document.querySelector('button button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Schedule' }));
    expect(onOpen).toHaveBeenCalledOnce();
  },
);
