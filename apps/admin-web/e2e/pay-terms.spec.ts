import { expect, test } from '@playwright/test';

/** Every scenario of the card section «Должности и оплата» prototype, captured for spec 015. */
const STATES = [
  'read',
  'path',
  'replace',
  'add',
  'level',
  'adjustment',
  'transfer',
  'history',
  'accountant',
  'names-only',
] as const;

const OPENS_LAYER = new Set(['path', 'replace', 'add', 'level', 'adjustment', 'transfer']);

for (const state of STATES) {
  test(`pay terms: ${state}`, async ({ page }, info) => {
    await page.goto(`/e2e/pay-terms.html?state=${state}`);
    if (OPENS_LAYER.has(state)) {
      await expect(
        page.locator('[data-slot=popover-content], [role=dialog]').first(),
      ).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`${state}.jpg`),
      fullPage: true,
      type: 'jpeg',
      quality: 82,
    });
  });
}
