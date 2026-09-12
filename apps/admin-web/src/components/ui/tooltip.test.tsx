import { type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Popover, PopoverContent } from './popover';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogCancel,
} from './alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

afterEach(cleanup);

function HelpButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button">Help action</button>
      </TooltipTrigger>
      <TooltipContent>Action explanation</TooltipContent>
    </Tooltip>
  );
}

const surfaces: { name: string; render: (content: ReactNode) => ReactNode }[] = [
  {
    name: 'Sheet',
    render: (content) => (
      <Sheet defaultOpen>
        <SheetContent aria-describedby={undefined} showCloseButton={false}>
          <SheetTitle>Details</SheetTitle>
          {content}
        </SheetContent>
      </Sheet>
    ),
  },
  {
    name: 'Dialog with deferred field focus',
    render: (content) => (
      <Dialog defaultOpen>
        <DialogContent aria-describedby={undefined} showCloseButton={false}>
          <DialogTitle>Details</DialogTitle>
          {content}
        </DialogContent>
      </Dialog>
    ),
  },
  {
    name: 'Popover',
    render: (content) => (
      <Popover defaultOpen>
        <PopoverContent>{content}</PopoverContent>
      </Popover>
    ),
  },
  {
    name: 'AlertDialog cancel action',
    render: () => (
      <AlertDialog defaultOpen>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogTitle>Confirm</AlertDialogTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogCancel>Help action</AlertDialogCancel>
            </TooltipTrigger>
            <TooltipContent>Action explanation</TooltipContent>
          </Tooltip>
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
];

describe('overlay tooltip focus', () => {
  it.each(surfaces)(
    'keeps automatic $name focus quiet and later intentional focus explained',
    async ({ render: surface }) => {
      render(<TooltipProvider>{surface(<HelpButton />)}</TooltipProvider>);
      const button = screen.getByRole('button', { name: 'Help action' });
      await waitFor(() => expect(document.activeElement).toBe(button));
      expect(screen.queryByRole('tooltip')).toBeNull();
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.blur(button);
      fireEvent.focus(button);
      expect((await screen.findByRole('tooltip')).textContent).toBe('Action explanation');
    },
  );

  it('preserves custom autofocus handlers and pointer hover', async () => {
    const customFocus = vi.fn((event: Event) => {
      event.preventDefault();
      screen.getByRole('button', { name: 'Help action' }).focus();
    });
    render(
      <TooltipProvider delayDuration={0}>
        <Sheet defaultOpen>
          <SheetContent
            aria-describedby={undefined}
            showCloseButton={false}
            onOpenAutoFocus={customFocus}
          >
            <SheetTitle>Details</SheetTitle>
            <HelpButton />
          </SheetContent>
        </Sheet>
      </TooltipProvider>,
    );
    const button = screen.getByRole('button', { name: 'Help action' });
    await waitFor(() => expect(document.activeElement).toBe(button));
    expect(customFocus).toHaveBeenCalledOnce();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerMove(button, { pointerType: 'mouse' });
    expect((await screen.findByRole('tooltip')).textContent).toBe('Action explanation');
  });
});
