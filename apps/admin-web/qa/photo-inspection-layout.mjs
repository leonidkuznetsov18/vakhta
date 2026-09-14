/**
 * Browser regression against the existing synthetic preview (Ukrainian locale).
 * Pass the connected browser tab from cua_repl; run at desktop and mobile sizes.
 * Uses only the tab's supported browser API and never contacts production.
 */
export async function checkPhotoInspectionLayout(tab) {
  const location = new URL(await tab.url());
  if (
    !['localhost', '127.0.0.1'].includes(location.hostname) ||
    location.pathname !== '/preview.html'
  ) {
    throw new Error('This regression must run against the local synthetic preview');
  }
  const measure = () =>
    tab.playwright.evaluate(() => {
      const element = document.querySelector('[data-testid="inspection-image-viewport"]');
      if (!element) throw new Error('Open an inspection photo before running the regression');
      const image = element.querySelector('img');
      if (!image?.complete || !image.naturalWidth) throw new Error('Photo must be loaded');
      const box = image.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        x: box.x,
        relativeY: box.y - element.getBoundingClientRect().y,
      };
    });
  const before = await measure();
  const toggle = tab.playwright.getByRole('checkbox', {
    name: 'Фото не можна оцінити',
    exact: true,
  });
  await toggle.click();
  await tab.playwright.domSnapshot();
  const invalid = await measure();
  await tab.playwright.getByRole('combobox', { name: 'Причина', exact: true }).selectOption('DARK');
  await tab.playwright.domSnapshot();
  const valid = await measure();
  // Preview deliberately rejects writes: exercise recoverable save failure without employee data.
  await tab.playwright.getByRole('button', { name: 'Зберегти зміни', exact: true }).click();
  await tab.playwright
    .getByText('Не вдалося виконати дію. Зміни залишилися у формі.', { exact: true })
    .waitFor({ state: 'visible' });
  const failed = await measure();
  await toggle.click();
  await tab.playwright.domSnapshot();
  const reverted = await measure();
  const samples = { before, invalid, valid, failed, reverted };
  for (const [state, sample] of Object.entries(samples)) {
    for (const dimension of ['width', 'height', 'x', 'relativeY']) {
      if (Math.abs(sample[dimension] - before[dimension]) > 1) {
        throw new Error(`Photo moved at ${state}.${dimension}: ${JSON.stringify(samples)}`);
      }
    }
  }
  return samples;
}
