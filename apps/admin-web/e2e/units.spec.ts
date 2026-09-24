import { expect, test } from '@playwright/test';

/** Every scenario of the units workspace prototype, captured for the design proposal. */
const STATES = [
  'overview',
  'list',
  'attention',
  'unassigned',
  'assign',
  'move',
  'bulk',
  'master',
  'master-inactive',
  'master-elsewhere',
  'create',
  'search',
  'search-hit',
  'no-results',
  'no-units',
  'readonly',
  'large',
  'loading',
  'error',
] as const;

/** Scenarios that start with a popover or dialog open; the capture waits for it. */
const OPENS_LAYER = new Set(['assign', 'move', 'bulk', 'master', 'create']);

for (const state of STATES) {
  test(`units workspace: ${state}`, async ({ page }, info) => {
    await page.goto(`/e2e/units.html?state=${state}`);
    // A modal dialog hides the page heading from the accessibility tree, so wait for the layer instead.
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
