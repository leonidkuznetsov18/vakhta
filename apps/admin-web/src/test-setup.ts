import { configure } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { clearPersistentState } from './lib/persistent-state.ts';
import { installZodLocale } from './lib/validation.ts';

installZodLocale();
// Tests assert the Russian catalog regardless of the jsdom navigator language.
try {
  localStorage.setItem('vakhta.locale', 'ru');
} catch {
  // jsdom without storage: currentLocale() falls back to the browser language.
}

// Radix primitives (used by shadcn/ui) touch browser APIs that jsdom does not implement.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (!('ResizeObserver' in globalThis)) {
  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });
}
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};

// Radix dropdown menus hang jsdom on item selection (focus trap loop), so tests see the row
// menu as a plain list of buttons with role="menuitem"; the app keeps the real component.
vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await import('react');
  type Props = { readonly children?: React.ReactNode; readonly asChild?: boolean };
  const Pass = ({ children }: Props) => React.createElement(React.Fragment, null, children);
  return {
    DropdownMenu: Pass,
    DropdownMenuPortal: Pass,
    DropdownMenuGroup: Pass,
    DropdownMenuTrigger: ({ children }: Props) =>
      React.createElement(React.Fragment, null, children),
    DropdownMenuContent: ({ children }: Props) =>
      React.createElement('div', { role: 'menu' }, children),
    DropdownMenuLabel: ({ children }: Props) => React.createElement('div', null, children),
    DropdownMenuSeparator: () => null,
    DropdownMenuShortcut: () => null,
    DropdownMenuItem: ({
      children,
      onSelect,
      disabled,
    }: Props & { readonly onSelect?: () => void; readonly disabled?: boolean }) =>
      React.createElement(
        'button',
        { type: 'button', role: 'menuitem', disabled, onClick: () => onSelect?.() },
        children,
      ),
  };
});

// Persisted UI state (filters, expanded rows, drafts) must not leak between tests.
beforeEach(() => {
  clearPersistentState();
  location.hash = '';
  document.querySelectorAll('[data-toast]').forEach((n) => n.remove());
});

// Toasts render into a portal only when the Toaster is mounted; tests render pages alone, so the
// mock writes each message into the document as a status line that `findByText` can see.
vi.mock('sonner', () => {
  const show = (message: string) => {
    const node = document.createElement('div');
    node.setAttribute('role', 'status');
    node.setAttribute('data-toast', '');
    node.textContent = message;
    document.body.append(node);
  };
  const toast = Object.assign((m: string) => show(m), {
    success: show,
    error: show,
    info: show,
    warning: show,
    message: show,
    dismiss: () => undefined,
  });
  return { toast, Toaster: () => null };
});

// Role queries check accessibility with getComputedStyle for every element, which takes seconds
// in jsdom once a Radix dialog marks the rest of the page aria-hidden. The tests scope queries
// themselves (`within(dialog)`), so the hidden check is skipped.
configure({ defaultHidden: true });

// Opening a Radix dialog or sheet costs seconds in jsdom on pages with several dialog roots
// (20 s+ on the CI runner). The panel's own wrappers are replaced with plain containers that keep
// the open/close contract and the `dialog` role the tests scope their queries to.
vi.mock('@/components/app/detail-sheet', async () => {
  const React = await import('react');
  return {
    DetailSheet: ({
      open,
      title,
      description,
      children,
      footer,
    }: {
      open: boolean;
      title?: React.ReactNode;
      description?: React.ReactNode;
      children?: React.ReactNode;
      footer?: React.ReactNode;
    }) =>
      open
        ? React.createElement(
            'div',
            { role: 'dialog' },
            React.createElement('h2', null, title),
            description ? React.createElement('p', null, description) : null,
            children,
            footer,
          )
        : null,
  };
});
vi.mock('@/components/app/add-dialog', async () => {
  const React = await import('react');
  const { messages } = await import('@vakhta/i18n');
  const { currentLocale } = await import('./i18n.tsx');
  return {
    AddDialog: ({
      open,
      onOpenChange,
      title,
      trigger,
      hideTrigger,
      children,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      trigger?: string;
      hideTrigger?: boolean;
      children?: React.ReactNode;
    }) =>
      React.createElement(
        React.Fragment,
        null,
        hideTrigger
          ? null
          : React.createElement(
              'button',
              { type: 'button', onClick: () => onOpenChange(true) },
              trigger ?? messages(currentLocale()).ui.common.add,
            ),
        open
          ? React.createElement(
              'div',
              { role: 'dialog' },
              React.createElement('h2', null, title),
              children,
            )
          : null,
      ),
  };
});
