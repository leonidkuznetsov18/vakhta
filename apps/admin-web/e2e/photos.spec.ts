import { test, expect, type Locator } from '@playwright/test';
import { messages } from '@vakhta/i18n';
import { reviewFixture, reviewPhotos, reviewObjects } from '../src/preview/review-fixtures';
const t = messages('en').photoInspection;
const photosByFilename = new Map(reviewPhotos.map((photo) => [`${photo.media.id}.svg`, photo]));
async function expectStableFrame(
  frame: Locator,
  before: Awaited<ReturnType<Locator['boundingBox']>>,
) {
  const after = await frame.boundingBox();
  if (!before || !after) throw new Error('Missing frame');
  for (const dimension of ['width', 'height', 'x', 'y'] as const)
    expect(Math.abs(after[dimension] - before[dimension])).toBeLessThan(1);
}

async function expectPhotoLoader(frame: Locator) {
  const loader = frame.locator('..').getByRole('status');
  await expect(loader).toHaveCount(1);
  await expect
    .poll(async () => {
      const area = await frame.boundingBox();
      const status = await loader.boundingBox();
      if (!area || !status) return Infinity;
      return Math.abs(status.y + status.height / 2 - area.y - area.height / 2);
    })
    .toBeLessThan(1);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('vakhta.locale', 'en'));
  await page.route('**/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/admin/photo-objects') return route.fulfill({ json: reviewObjects });
    const response = reviewFixture(path, route.request().method());
    if (!response) return route.fulfill({ status: 404 });
    await route.fulfill({
      status: response.status,
      contentType: 'application/json',
      body: await response.text(),
    });
  });
});

test('inspection reserves the same photo frame through metadata and image loading', async ({
  page,
}, info) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/inspection', async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/e2e/photos.html');
  await page.getByRole('button', { name: 'Inspect photos', exact: true }).click();
  const frame = page.getByTestId('inspection-image-viewport');
  await page.screenshot({ path: info.outputPath('initial-loading.png') });
  await expect(frame).toBeVisible();
  const before = await frame.boundingBox();
  release();
  await expect(page.getByRole('button', { name: t.rectangle, exact: true })).toBeEnabled();
  const after = await frame.boundingBox();
  if (!before || !after) throw new Error('Missing frame');
  for (const dimension of ['width', 'height', 'x', 'y'] as const)
    expect(Math.abs(after[dimension] - before[dimension])).toBeLessThan(1);
  await page.screenshot({ path: info.outputPath('initial-loaded.png') });
});

test('portrait uses full mobile width and preserves its natural aspect ratio', async ({
  page,
}, info) => {
  await page.goto('/e2e/photos.html');
  await page.getByRole('button', { name: 'Inspect photos', exact: true }).click();
  await expect(page.getByRole('button', { name: t.rectangle, exact: true })).toBeEnabled();
  const frame = page.getByTestId('inspection-image-viewport');
  const geometry = await frame.evaluate((element) => {
    const image = element.querySelector('img');
    if (!image) throw new Error('Missing photo');
    const rect = image.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      frameWidth: element.clientWidth,
      ratio: image.naturalWidth / image.naturalHeight,
    };
  });
  await page.screenshot({ path: info.outputPath('portrait.png') });
  expect(geometry.width / geometry.height).toBeCloseTo(geometry.ratio, 2);
  if (info.project.name === 'mobile') {
    expect(geometry.width).toBeGreaterThanOrEqual(geometry.frameWidth - 2);
    const bounds = await frame.boundingBox();
    if (!bounds) throw new Error('Missing viewport');
    await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + bounds.height - 30);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + 30, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => frame.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expectStableFrame(frame, bounds);
    await page.screenshot({ path: info.outputPath('portrait-scrolled.png') });
  }
});

test('switching keeps the current photo until decoded and latest rapid selection wins', async ({
  page,
}, info) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let secondLinkCalls = 0;
  const second = reviewPhotos[1];
  const first = reviewPhotos[0];
  if (!first || !second) throw new Error('Missing fixtures');
  await page.route(`**/photos/${second.media.id}/*/inspection/link`, async (route) => {
    secondLinkCalls++;
    await route.fulfill({
      json: {
        url: 'http://127.0.0.1:5183/test-photo/second.svg',
        expiresAt: '2099-01-01T00:00:00Z',
      },
    });
  });
  await page.route('**/test-photo/second.svg', async (route) => {
    await gate;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="skyblue"/></svg>',
    });
  });
  await page.goto('/e2e/photos.html');
  await page.getByRole('button', { name: 'Inspect photos', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByRole('button', { name: t.rectangle, exact: true })).toBeEnabled();
  const originalDialog = await dialog.elementHandle();
  const frame = page.getByTestId('inspection-image-viewport');
  const before = await frame.boundingBox();
  const pageBefore = await page.getByTestId('page-content').boundingBox();
  if (info.project.name === 'mobile') {
    if (!before) throw new Error('Missing viewport');
    await page.mouse.move(before.x + before.width - 10, before.y + before.height - 30);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width - 10, before.y + 30, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => frame.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }
  await page.getByRole('button', { name: t.next, exact: true }).click();
  await expect(frame).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('img', { name: first.label, exact: true })).toBeVisible();
  await expectPhotoLoader(frame);
  await page.screenshot({ path: info.outputPath('switching.png') });
  await expect(page.getByTestId('page-activity').locator('[role="status"]')).toHaveCount(0);
  await expect(page.getByTestId('page-header').locator('[role="status"]')).toHaveCount(0);
  await expectStableFrame(page.getByTestId('page-content'), pageBefore);
  await expectStableFrame(frame, before);
  await page.getByRole('button', { name: t.previous, exact: true }).click();
  await expect(frame).toHaveAttribute('aria-busy', 'false');
  release();
  await expect(dialog.getByRole('img', { name: first.label, exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.next, exact: true }).click();
  await expect(dialog.getByRole('img', { name: second.label, exact: true })).toBeVisible();
  expect(await originalDialog?.evaluate((element) => element.isConnected)).toBe(true);
  await expectStableFrame(frame, before);
  await page.getByRole('button', { name: t.previous, exact: true }).click();
  await expect(dialog.getByRole('img', { name: first.label, exact: true })).toBeVisible();
  await page.getByRole('button', { name: t.next, exact: true }).click();
  await expect(dialog.getByRole('img', { name: second.label, exact: true })).toBeVisible();
  expect(secondLinkCalls).toBe(1);
  await page.screenshot({ path: info.outputPath('landscape.png') });
});

test('image failure retains the frame and explicit retry recovers', async ({ page }, info) => {
  let calls = 0;
  await page.route('**/inspection/link', async (route) => {
    calls++;
    await route.fulfill({
      json: {
        url: `http://127.0.0.1:5183/test-photo/retry-${calls}.svg`,
        expiresAt: '2099-01-01T00:00:00Z',
      },
    });
  });
  await page.route('**/test-photo/retry-*.svg', async (route) => {
    if (route.request().url().includes('retry-1')) return route.fulfill({ status: 503 });
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="silver"/></svg>',
    });
  });
  await page.goto('/e2e/photos.html');
  await page.getByRole('button', { name: 'Inspect photos', exact: true }).click();
  await expect(page.getByText(t.imageFailed, { exact: true })).toBeVisible();
  const frame = page.getByTestId('inspection-image-viewport');
  const before = await frame.boundingBox();
  await page.screenshot({ path: info.outputPath('image-failed.png') });
  await page.getByRole('button', { name: t.refresh, exact: true }).click();
  await expect(page.getByRole('button', { name: t.rectangle, exact: true })).toBeEnabled();
  await expectStableFrame(frame, before);
  expect(calls).toBe(2);
});

test('shared gallery retains pixels while switching and tall mobile photos can scroll', async ({
  page,
}, info) => {
  const labels = messages('en').admin.handover;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/test-photo/*.svg', async (route) => {
    const photo = photosByFilename.get(
      new URL(route.request().url()).pathname.split('/').at(-1) ?? '',
    );
    if (!photo) return route.fulfill({ status: 404 });
    if (photo === reviewPhotos[1]) await gate;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.media.width}" height="${photo.media.height}"><rect width="100%" height="100%" fill="#a5ced8"/><text x="20" y="40">TOP</text><text x="20" y="${(photo.media.height ?? 0) - 20}">BOTTOM</text></svg>`,
    });
  });
  await page.goto('/e2e/photos.html');
  await page.getByRole('button', { name: 'View gallery', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const image = dialog.getByRole('img', { name: reviewPhotos[0]?.label, exact: true });
  await expect(image).toHaveCSS('opacity', '1');
  const frame = image.locator('..');
  const before = await frame.boundingBox();
  if (info.project.name === 'mobile') {
    const sizes = await image.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      frame: element.parentElement?.clientWidth,
    }));
    expect(sizes.width).toBeCloseTo(sizes.frame ?? 0, 0);
    if (!before) throw new Error('Missing viewport');
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => frame.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }
  await page.screenshot({ path: info.outputPath('gallery-portrait.png') });
  await page.getByRole('button', { name: labels.nextPhoto, exact: true }).click();
  await expect(image).toHaveCSS('opacity', '1');
  await expectPhotoLoader(frame);
  await page.screenshot({ path: info.outputPath('gallery-switching.png') });
  await expect(page.getByTestId('page-activity').locator('[role="status"]')).toHaveCount(0);
  await expect(page.getByTestId('page-header').locator('[role="status"]')).toHaveCount(0);
  release();
  const next = dialog.getByRole('img', { name: reviewPhotos[1]?.label, exact: true });
  await expect(next).toHaveCSS('opacity', '1');
  await expectStableFrame(next.locator('..'), before);
  await page.screenshot({ path: info.outputPath('gallery-landscape.png') });
});

test('reopening inspection requests a new audited link and thumbnails preserve full photos', async ({
  page,
}, info) => {
  let calls = 0;
  await page.route('**/inspection/link', async (route) => {
    calls++;
    await route.fallback();
  });
  await page.goto('/e2e/photos.html');
  const thumbnail = page.getByRole('button', { name: reviewPhotos[0]?.label, exact: true });
  await expect(thumbnail.getByRole('img')).toBeVisible();
  await page.screenshot({ path: info.outputPath('thumbnails.png') });
  await page.getByRole('button', { name: 'Inspect photos', exact: true }).click();
  await expect(page.getByRole('button', { name: t.rectangle, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: messages('en').ui.common.close, exact: true }).click();
  await page.getByRole('button', { name: 'Inspect photos', exact: true }).click();
  await expect(page.getByRole('button', { name: t.rectangle, exact: true })).toBeEnabled();
  expect(calls).toBe(2);
});

for (const [index, photo] of reviewPhotos.entries()) {
  test(`aspect ratio ${index + 1} preserves geometry and mobile image width`, async ({
    page,
  }, info) => {
    await page.goto('/e2e/photos.html');
    await expect(page.getByRole('button', { name: photo.label, exact: true })).toBeEnabled();
    await page.getByRole('button', { name: photo.label, exact: true }).click();
    const frame = page.getByTestId('inspection-image-viewport');
    const image = frame.getByRole('img', { name: photo.label, exact: true });
    await expect(image).toBeVisible();
    await expect(page.getByRole('button', { name: t.rectangle, exact: true })).toBeEnabled();
    const size = await image.evaluate((element) => {
      if (!(element instanceof HTMLImageElement)) throw new Error('Expected image');
      return {
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        ratio: element.naturalWidth / element.naturalHeight,
      };
    });
    expect(size.width / size.height).toBeCloseTo(size.ratio, 2);
    if (info.project.name === 'mobile')
      expect(size.width).toBeGreaterThanOrEqual(
        (await frame.evaluate((element) => element.clientWidth)) - 2,
      );
    await page.screenshot({ path: info.outputPath(`ratio-${index}.png`) });
  });
}

test('narrow Ukrainian mobile retains its loading frame and reachable actions', async ({
  page,
}, info) => {
  const uk = messages('uk');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.addInitScript(() => localStorage.setItem('vakhta.locale', 'uk'));
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/inspection', async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/e2e/photos.html');
  await page.getByRole('button', { name: 'Inspect photos', exact: true }).click();
  const frame = page.getByTestId('inspection-image-viewport');
  await expect(frame).toBeVisible();
  const before = await frame.boundingBox();
  release();
  await expect(
    page.getByRole('button', { name: uk.photoInspection.rectangle, exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath('narrow-uk.png') });
  await expectStableFrame(frame, before);
  const dialog = await page.getByRole('dialog').boundingBox();
  const analyze = await page
    .getByRole('button', { name: uk.photoInspection.analyze, exact: true })
    .boundingBox();
  if (!dialog || !analyze) throw new Error('Missing actions');
  expect(analyze.y + analyze.height).toBeLessThanOrEqual(dialog.y + dialog.height);
  expect(analyze.x + analyze.width).toBeLessThanOrEqual(dialog.x + dialog.width);
  const tools = await page
    .getByTestId('inspection-tools')
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
  for (let index = 1; index < tools.length; index++)
    expect(tools[index]?.left).toBeGreaterThanOrEqual(tools[index - 1]?.right ?? 0);
});

test('offline navigation keeps the visible photo and resumes without losing the selection', async ({
  page,
  context,
}) => {
  await page.goto('/e2e/photos.html');
  await page.getByRole('button', { name: 'Inspect photos', exact: true }).click();
  await expect(page.getByRole('button', { name: t.rectangle, exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page.getByRole('button', { name: t.next, exact: true }).click();
  await expect(
    page
      .getByTestId('inspection-image-viewport')
      .getByRole('img', { name: reviewPhotos[0]?.label, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(messages('en').ui.common.waitingConnection, { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page
      .getByTestId('inspection-image-viewport')
      .getByRole('img', { name: reviewPhotos[1]?.label, exact: true }),
  ).toBeVisible();
});
