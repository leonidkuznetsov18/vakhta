// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { enableMediaExpansion } from './index';

it('opens the full asset and selected scenario in place, supports 100% size and restores focus', () => {
  document.body.innerHTML = `
    <a data-expand-image href="/full.webp"><img src="/preview.webp" alt="Production overview"></a>
    <div data-process="handover"><p>Review before the next shift</p>
      <a href="#workflow" data-expand-step data-step-title="Handover">Expand</a>
    </div>
    <dialog data-media-dialog>
      <h2 data-media-heading></h2>
      <button data-media-size aria-pressed="false">100%</button>
      <button data-media-close>Close</button>
      <div data-media-content></div>
    </dialog>`;
  const dialog = document.querySelector('dialog');
  const link = document.querySelector<HTMLAnchorElement>('[data-expand-image]');
  const size = document.querySelector<HTMLButtonElement>('[data-media-size]');
  const close = document.querySelector<HTMLButtonElement>('[data-media-close]');
  const step = document.querySelector<HTMLAnchorElement>('[data-expand-step]');
  if (!dialog || !link || !size || !close || !step) throw new Error('Missing test surface');
  // jsdom has no native modal implementation; browser QA verifies top-layer and Escape behavior.
  dialog.showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.close = vi.fn(() => {
    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));
  });
  enableMediaExpansion();
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('img')?.getAttribute('src')).toContain('/full.webp');
  expect(dialog.querySelector('[data-media-heading]')?.textContent).toBe('Production overview');
  size.click();
  expect(size.getAttribute('aria-pressed')).toBe('true');
  expect(dialog.querySelector('.actual-size')).not.toBeNull();
  close.click();
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(link);
  expect(dialog.querySelector('img')).toBeNull();
  step.click();
  expect(dialog.open).toBe(true);
  expect(dialog.textContent).toContain('Review before the next shift');
  expect(dialog.querySelector('[data-media-heading]')?.textContent).toBe('Handover');
  expect(dialog.querySelector('[data-expand-step]')).toBeNull();
  expect(size.hidden).toBe(true);
  close.click();
  expect(document.activeElement).toBe(step);
});
