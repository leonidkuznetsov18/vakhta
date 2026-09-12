import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalLinkIcon, SquareIcon } from 'lucide-react';
import { IconButton } from './icon-button';

afterEach(cleanup);

describe('IconButton semantics', () => {
  it('names an icon-only action and exposes its explanation on keyboard focus', async () => {
    const onClick = vi.fn();
    render(
      <IconButton
        icon={SquareIcon}
        size="icon"
        label="Rectangle"
        tooltip="Draw a region"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Rectangle' });
    expect(button.textContent).toBe('');
    fireEvent.focus(button);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain('Rectangle');
    expect(tooltip.textContent).toContain('Draw a region');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps disabled icon actions inert with a focusable explanation', async () => {
    const onClick = vi.fn();
    render(
      <IconButton
        icon={SquareIcon}
        size="icon"
        label="Rectangle"
        tooltip="Wait for the photo to load"
        disabled
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Rectangle' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    const wrapper = button.parentElement;
    if (!wrapper) throw new Error('Expected disabled-action wrapper');
    expect(wrapper.tabIndex).toBe(0);
    fireEvent.focus(wrapper);
    expect((await screen.findByRole('tooltip')).textContent).toContain(
      'Wait for the photo to load',
    );
  });

  it('keeps an icon-only download as a named link with its download attribute', () => {
    render(
      <IconButton
        icon={ExternalLinkIcon}
        size="icon"
        label="Download template"
        tooltip="Download template"
        asChild
      >
        <a href="/template.csv" download="employees.csv">
          <span className="sr-only">Download template</span>
        </a>
      </IconButton>,
    );
    const link = screen.getByRole('link', { name: 'Download template' });
    expect(link.getAttribute('href')).toBe('/template.csv');
    expect(link.getAttribute('download')).toBe('employees.csv');
    expect(screen.queryByRole('button')).toBeNull();
  });

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
