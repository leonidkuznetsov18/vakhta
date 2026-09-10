import { describe, expect, it, vi } from 'vitest';
import { deleteSelectedOnKeyDown } from './delete-shortcut';

function press(target: Element, init: KeyboardEventInit = {}, busy = false, selected = true) {
  const removeSelected = vi.fn(() => selected);
  const event = new KeyboardEvent('keydown', {
    key: 'Delete',
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.addEventListener(
    'keydown',
    (event) => {
      if (event instanceof KeyboardEvent) deleteSelectedOnKeyDown(event, { removeSelected }, busy);
    },
    { once: true },
  );
  target.dispatchEvent(event);
  return { event, removeSelected };
}

describe('selected region deletion shortcut', () => {
  it.each(['Delete', 'Backspace'])('deletes using %s and consumes the action', (key) => {
    const { event, removeSelected } = press(document.createElement('div'), { key });
    expect(removeSelected).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });
  it.each(['input', 'textarea', 'select'])('preserves native editing in %s', (tag) => {
    const { event, removeSelected } = press(document.createElement(tag));
    expect(removeSelected).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
  it('preserves editing inside contenteditable descendants', () => {
    const parent = document.createElement('div');
    parent.setAttribute('contenteditable', 'true');
    const child = parent.appendChild(document.createElement('span'));
    expect(press(child).removeSelected).not.toHaveBeenCalled();
  });
  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { isComposing: true },
    { repeat: true },
    { key: 'Enter' },
  ])('ignores modified, composing, repeated and unrelated keys', (init) => {
    expect(press(document.createElement('div'), init).removeSelected).not.toHaveBeenCalled();
  });
  it('does not delete while busy or consume a key when nothing can be deleted', () => {
    expect(press(document.createElement('div'), {}, true).removeSelected).not.toHaveBeenCalled();
    expect(press(document.createElement('div'), {}, false, false).event.defaultPrevented).toBe(
      false,
    );
  });
});
