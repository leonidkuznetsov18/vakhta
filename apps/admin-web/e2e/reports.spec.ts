import { expect, test } from '@playwright/test';
import { messages } from '@vakhta/i18n';

const labels = messages('uk').admin.reports;

test.use({ reducedMotion: 'reduce' });

for (const width of [320, 390, 430, 1440]) {
  test(`Pareto labels and legend remain readable at ${width}px`, async ({ page }, info) => {
    test.skip((info.project.name === 'desktop') !== (width === 1440));
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/preview.html?lang=uk#/reports');
    const chart = page.locator('[data-slot="chart"]');
    const ticks = chart.locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value');
    await expect(ticks).toHaveCount(7);
    await page.evaluate(() => document.fonts.ready);
    await chart.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect
      .poll(
        async () =>
          (await chart.locator('.recharts-bar-rectangle').first().boundingBox())?.height ?? 0,
      )
      .toBeGreaterThan(180);
    await page.screenshot({ path: info.outputPath(`pareto-${width}.png`) });
    const bounds = await ticks.evaluateAll((elements) =>
      elements.map((element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      }),
    );
    bounds.slice(1).forEach((current, index) => {
      expect(current.left).toBeGreaterThan((bounds[index]?.right ?? 0) + 4);
    });
    const scroller = page.getByRole('region', { name: labels.lossTitle, exact: true });
    const scroll = await scroller.evaluate((element) => ({
      width: element.clientWidth,
      content: element.scrollWidth,
    }));
    if (width === 1440) expect(scroll.content).toBe(scroll.width);
    else expect(scroll.content).toBeGreaterThan(scroll.width);
    const legendBounds = await page
      .getByText(labels.lossZones.vital, { exact: true })
      .evaluate((element) => {
        const legend = element.parentElement?.parentElement;
        if (!legend) throw new Error('Legend unavailable');
        return Array.from(legend.children).map((item) => {
          const { left, right } = item.getBoundingClientRect();
          return { left, right };
        });
      });
    legendBounds.forEach((item) => {
      expect(item.left).toBeGreaterThanOrEqual(0);
      expect(item.right).toBeLessThanOrEqual(width);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

    const lastTick = ticks.last();
    await lastTick.scrollIntoViewIfNeeded();
    await chart.evaluate((element) =>
      element.scrollIntoView({ block: 'center', inline: 'nearest' }),
    );
    const tickBox = await lastTick.boundingBox();
    const chartBox = await chart.boundingBox();
    if (!tickBox || !chartBox) throw new Error('Chart geometry unavailable');
    const x = tickBox.x + tickBox.width / 2;
    const y = chartBox.y + 80;
    if (info.project.name === 'mobile') await page.touchscreen.tap(x, y);
    else await page.mouse.move(x, y);
    const tooltip = page.locator('.recharts-tooltip-wrapper');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Прибирання');
    const tooltipBounds = await tooltip.boundingBox();
    expect(tooltipBounds?.x).toBeGreaterThanOrEqual(0);
    expect((tooltipBounds?.x ?? 0) + (tooltipBounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await expect(tooltip).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`pareto-tooltip-${width}.png`) });

    await page.getByRole('button', { name: 'Подробиці: Передача', exact: true }).click();
    await expect(ticks).toHaveCount(2);
    await expect(ticks.last().locator('tspan')).toHaveCount(1);
    await expect(ticks.last()).toContainText('…');
    await ticks.last().scrollIntoViewIfNeeded();
    await chart.evaluate((element) =>
      element.scrollIntoView({ block: 'center', inline: 'nearest' }),
    );
    const reasonBox = await ticks.last().boundingBox();
    const detailBox = await chart.boundingBox();
    if (!reasonBox || !detailBox) throw new Error('Detail geometry unavailable');
    const reasonX = reasonBox.x + reasonBox.width / 2;
    if (info.project.name === 'mobile') await page.touchscreen.tap(reasonX, detailBox.y + 80);
    else await page.mouse.move(reasonX, detailBox.y + 80);
    await expect(tooltip).toContainText('Причину не вказано');
    await expect(tooltip).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`pareto-reasons-${width}.png`) });
    expect(errors).toEqual([]);
  });
}
