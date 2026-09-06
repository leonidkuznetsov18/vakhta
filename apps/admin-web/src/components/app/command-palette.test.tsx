import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SettingsIcon, LayoutDashboardIcon } from 'lucide-react';
import { CommandPalette } from './command-palette.tsx';

describe('CommandPalette', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens on click, lists the sections and navigates on select', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { headers: { 'content-type': 'application/json' } })),
    );
    const onSection = vi.fn();
    render(
      <CommandPalette
        sections={[
          { key: 'overview', icon: LayoutDashboardIcon },
          { key: 'administration', icon: SettingsIcon },
        ]}
        onSection={onSection}
        onEmployee={() => undefined}
        onTarget={() => undefined}
        canSeeEmployees={false}
        canAdminister={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Быстрый переход/ }));
    const dialog = await screen.findByRole('dialog');
    const option = await within(dialog).findByText('Администрирование');
    fireEvent.click(option);
    await waitFor(() => expect(onSection).toHaveBeenCalledWith('administration'));
  });
});
