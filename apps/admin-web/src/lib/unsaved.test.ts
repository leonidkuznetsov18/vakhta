import { afterEach, expect, it, vi } from 'vitest';
import { confirmLeave, hasUnsaved, registerUnsaved } from './unsaved';

afterEach(() => vi.restoreAllMocks());

it('asks before leaving only while a registered form has unsaved edits', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  expect(confirmLeave()).toBe(true);
  let dirty = false;
  const unregister = registerUnsaved(() => dirty, 'Discard?');
  expect(confirmLeave()).toBe(true);
  dirty = true;
  expect(hasUnsaved()).toBe(true);
  expect(confirmLeave()).toBe(false);
  expect(confirm).toHaveBeenCalledWith('Discard?');
  confirm.mockReturnValue(true);
  expect(confirmLeave()).toBe(true);
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  unregister();
  expect(hasUnsaved()).toBe(false);
  const later = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(later);
  expect(later.defaultPrevented).toBe(false);
});
