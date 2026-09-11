/**
 * Forms with unsaved edits register a check here; anything that would unmount them (collapsing a
 * row, switching a section, closing the tab) asks first. The registry is the whole mechanism: no
 * global state to sync, a form simply says "ask me" while it is mounted.
 */
const checks = new Set<() => boolean>();
let confirmText = 'Discard unsaved changes?';

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsaved()) return;
  event.preventDefault();
  event.returnValue = '';
}

export function hasUnsaved(): boolean {
  for (const check of checks) if (check()) return true;
  return false;
}

/** Register a dirty check for as long as the form is mounted; returns the unregister function. */
export function registerUnsaved(check: () => boolean, message?: string): () => void {
  if (checks.size === 0) window.addEventListener('beforeunload', warnBeforeUnload);
  checks.add(check);
  if (message) confirmText = message;
  return () => {
    checks.delete(check);
    if (checks.size === 0) window.removeEventListener('beforeunload', warnBeforeUnload);
  };
}

/** True when leaving is fine: nothing unsaved, or the person chose to discard. */
export function confirmLeave(): boolean {
  return !hasUnsaved() || window.confirm(confirmText);
}
