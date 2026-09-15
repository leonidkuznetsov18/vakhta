import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { messages } from '@vakhta/i18n';
import profile from '../src/features/employee-profile/model/__fixtures__/profile.json' with { type: 'json' };
const t = messages('en').employeeProfile;
const common = messages('en').ui.common;

test('profile form validates, resets and preserves a failed draft before explicit retry', async ({
  page,
}, info) => {
  let calls = 0;
  await page.route('**/admin/employees/*', async (route) => {
    calls++;
    await route.fulfill({
      status: calls === 1 ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(calls === 1 ? { code: 'UNAVAILABLE' } : {}),
    });
  });
  await page.goto('/e2e/profile.html');
  await expect(page.getByRole('button', { name: t.save, exact: true })).toBeDisabled();
  await page.getByLabel(t.email, { exact: true }).fill('broken');
  await page.getByRole('button', { name: t.save, exact: true }).click();
  await expect(page.getByLabel(t.email, { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(calls).toBe(0);
  await page.screenshot({ path: info.outputPath('validation.png'), fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: common.reset, exact: true }).click();
  await expect(page.getByLabel(t.email, { exact: true })).toHaveValue(profile.employee.email);
  await expect(page.getByRole('button', { name: common.reset, exact: true })).toBeDisabled();
  await page.getByLabel(t.fullName, { exact: true }).fill('Preserved browser draft');
  await page.getByRole('button', { name: t.save, exact: true }).click();
  await expect(page.getByText(t.failed, { exact: true })).toBeVisible();
  await expect(page.getByLabel(t.fullName, { exact: true })).toHaveValue('Preserved browser draft');
  expect(calls).toBe(1);
  await page.screenshot({ path: info.outputPath('failed-draft.png'), fullPage: true });
  await page.getByRole('button', { name: t.save, exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(messages('en').ui.common.save);
  expect(calls).toBe(2);
});

test('a version conflict needs explicit acknowledgement and sends the latest version', async ({
  page,
}, info) => {
  let calls = 0;
  const latest = {
    ...profile,
    version: '2026-09-15T12:00:00.000Z',
    employee: { ...profile.employee, fullName: 'Saved elsewhere' },
  };
  await page.route('**/admin/employees/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: latest });
      return;
    }
    calls++;
    if (calls === 2)
      expect(route.request().postDataJSON()).toMatchObject({
        expectedVersion: latest.version,
        fullName: 'My draft',
      });
    await route.fulfill({
      status: calls === 1 ? 409 : 200,
      json: calls === 1 ? { code: 'EMPLOYEE_VERSION_CONFLICT' } : {},
    });
  });
  await page.goto('/e2e/profile.html');
  await page.getByLabel(t.fullName, { exact: true }).fill('My draft');
  await page.getByRole('button', { name: t.save, exact: true }).click();
  await expect(page.getByText('Saved elsewhere')).toBeVisible();
  await expect(page.getByRole('button', { name: t.save, exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('conflict.png'), fullPage: true });
  await page.getByRole('button', { name: t.useLatest, exact: true }).click();
  await expect(page.getByLabel(t.fullName, { exact: true })).toHaveValue('My draft');
  await page.getByRole('button', { name: t.save, exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(messages('en').ui.common.save);
});
