/**
 * Keyboard-first focus for dialogs and side panels: the first field gets the caret, not the first
 * button (Radix would otherwise focus an ⓘ tip and open its tooltip). Falls back to the first
 * ordinary button, then to the container itself.
 */
export function focusFirstField(container: HTMLElement | null): void {
  if (!container) return;
  const field = container.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
  );
  const target =
    field ??
    container.querySelector<HTMLElement>(
      'button:not([disabled]):not([data-info-tip]):not([data-slot="dialog-close"]):not([data-slot="sheet-close"]), a[href]',
    ) ??
    container;
  if (target === container && !container.hasAttribute('tabindex')) {
    container.setAttribute('tabindex', '-1');
  }
  target.focus({ preventScroll: true });
}

/** Radix `onOpenAutoFocus` handler: prevent the default and place the focus ourselves. */
export function autoFocusFirstField(event: Event): void {
  event.preventDefault();
  const content = event.currentTarget as HTMLElement | null;
  // The event fires before the content is fully laid out; defer one frame.
  requestAnimationFrame(() => focusFirstField(content));
}
