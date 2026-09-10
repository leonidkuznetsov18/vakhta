import type { KeyboardEvent } from 'react';

/** Keep Enter for editing; submit only through an enabled native submitter. */
export function submitFormShortcut(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (
    event.defaultPrevented ||
    event.nativeEvent.isComposing ||
    event.key !== 'Enter' ||
    !(event.ctrlKey || event.metaKey)
  )
    return;
  const form = event.currentTarget.form;
  if (!form) return;
  event.preventDefault();
  if (form.getAttribute('aria-busy') === 'true') return;
  const submitter = form.querySelector<HTMLButtonElement | HTMLInputElement>(
    'button[type="submit"]:not(:disabled), input[type="submit"]:not(:disabled)',
  );
  if (submitter) form.requestSubmit(submitter);
}
