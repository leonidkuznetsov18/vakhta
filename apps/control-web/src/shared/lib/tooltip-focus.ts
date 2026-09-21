/** Auto-focus moves accessibility focus without requesting a tooltip. */
const quietDocuments = new WeakSet<Document>();

function quietFocus(document: Document): void {
  quietDocuments.add(document);
  // Radix performs its default focus synchronously after the auto-focus callback returns.
  queueMicrotask(() => quietDocuments.delete(document));
}

export function isAutoFocusTooltipSuppressed(document: Document): boolean {
  return quietDocuments.has(document);
}

export function withoutAutoFocusTooltip(handler?: (event: Event) => void) {
  return (event: Event): void => {
    const target = event.currentTarget;
    if (target instanceof HTMLElement) quietFocus(target.ownerDocument);
    handler?.(event);
  };
}

/** Also covers application-owned focus deferred until the next animation frame. */
export function focusWithoutTooltip(target: HTMLElement, options?: FocusOptions): void {
  quietFocus(target.ownerDocument);
  target.focus(options);
}
