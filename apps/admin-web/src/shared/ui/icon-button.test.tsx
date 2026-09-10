import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalLinkIcon, SquareIcon } from 'lucide-react';
import { IconButton } from './icon-button';

afterEach(cleanup);

describe('IconButton semantics', () => {
  it('preserves a toggle action and describes it on keyboard focus', async () => {
    const onClick = vi.fn();
    render(
      <IconButton
        icon={SquareIcon}
        label="Rectangle"
        tooltip="Draw a region"
        aria-pressed
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Rectangle' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.focus(button);
    const tooltip = await screen.findByRole('tooltip');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('preserves a slotted link instead of nesting it in a button', () => {
    render(
      <IconButton icon={ExternalLinkIcon} label="Original" tooltip="Open original photo" asChild>
        <a href="/original.jpg" target="_blank" rel="noreferrer">
          Original
        </a>
      </IconButton>,
    );
    const link = screen.getByRole('link', { name: 'Original' });
    expect(link.getAttribute('href')).toBe('/original.jpg');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
