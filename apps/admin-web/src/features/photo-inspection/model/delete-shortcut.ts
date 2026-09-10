import type { InspectionEditor } from './editor';

/** Scoped to this editor; text editing and modified shortcuts keep their native behavior. */
export function deleteSelectedOnKeyDown(
  event: KeyboardEvent,
  editor: Pick<InspectionEditor, 'removeSelected'>,
  busy: boolean,
): void {
  if (
    busy ||
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    (event.key !== 'Backspace' && event.key !== 'Delete')
  )
    return;

  if (
    event.target instanceof Element &&
    event.target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"]',
    )
  )
    return;

  if (editor.removeSelected()) {
    event.preventDefault();
    event.stopPropagation();
  }
}
