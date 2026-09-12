import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { MeView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { render } from '@/test-utils';
import { authApi, ApiError } from '@/api';
import { ProfilePanel } from './ProfilePanel';

const { setAppearance } = vi.hoisted(() => ({ setAppearance: vi.fn() }));
vi.mock('@/i18n', () => ({ currentLocale: () => 'en' }));
vi.mock('@/lib/theme', () => ({
  useAppearance: () => ({ theme: 'light', set: setAppearance }),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,cHJldmlldw==') },
}));

const m = messages('en');
const t = m.admin.auth;
const me: MeView = {
  id: 'profile-user',
  name: 'Test User',
  email: 'profile@example.com',
  image: null,
  roles: [],
  twoFactorEnabled: true,
  createdAt: '2026-09-12T00:00:00Z',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setAppearance.mockClear();
});

it('keeps identity, theme and enabled security accessible without showing setup fields', () => {
  render(<ProfilePanel me={me} onChanged={vi.fn()} />);
  expect(screen.getByText(me.email)).toBeTruthy();
  expect(screen.getByText(t.noRoles)).toBeTruthy();
  expect(screen.getByRole('heading', { name: t.twoFactorOn })).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.enableTwoFactor })).toBeNull();
  expect(screen.getByRole('button', { name: m.ui.common.save }).hasAttribute('disabled')).toBe(
    true,
  );
  fireEvent.change(screen.getByRole('combobox', { name: m.ui.common.theme }), {
    target: { value: 'dark' },
  });
  expect(setAppearance).toHaveBeenCalledWith({ theme: 'dark' });
});

it('keeps changed names after a save failure and permits a successful retry', async () => {
  const update = vi.spyOn(authApi, 'updateMe').mockRejectedValueOnce(new Error('Offline'));
  const onChanged = vi.fn();
  render(<ProfilePanel me={me} onChanged={onChanged} />);
  const name = screen.getByRole('textbox', { name: t.name });
  fireEvent.change(name, { target: { value: 'Updated User' } });
  fireEvent.click(screen.getByRole('button', { name: m.ui.common.save }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', t.networkError);
  expect(name).toHaveProperty('value', 'Updated User');
  expect(update).toHaveBeenLastCalledWith({ name: 'Updated User' });
  update.mockResolvedValueOnce({ ...me, name: 'Updated User' });
  fireEvent.click(screen.getByRole('button', { name: m.ui.common.save }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  fireEvent.change(name, { target: { value: me.name } });
  expect(screen.getByRole('button', { name: m.ui.common.save }).hasAttribute('disabled')).toBe(
    true,
  );
});

it('keeps photo removal available as a named action', async () => {
  const update = vi.spyOn(authApi, 'updateMe').mockResolvedValue(me);
  const onChanged = vi.fn();
  render(
    <ProfilePanel
      me={{ ...me, image: 'data:image/png;base64,cHJldmlldw==' }}
      onChanged={onChanged}
    />,
  );
  expect(screen.getByRole('button', { name: t.uploadPhoto })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.removePhoto }));
  await waitFor(() => expect(update).toHaveBeenCalledWith({ image: null }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
});

it('preserves password, QR, backup codes and retry when enabling two-factor authentication', async () => {
  const enable = vi.spyOn(authApi, 'enableTwoFactor').mockResolvedValue({
    totpURI: 'otpauth://totp/Preview?secret=TEST',
    backupCodes: ['preview-code-one', 'preview-code-two'],
  });
  const verify = vi
    .spyOn(authApi, 'verifyTotp')
    .mockRejectedValueOnce(new ApiError(400, 'INVALID_CODE', 'Invalid verification code'));
  const onChanged = vi.fn();
  render(<ProfilePanel me={{ ...me, twoFactorEnabled: false }} onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('button', { name: t.enableTwoFactor }));
  fireEvent.change(screen.getByLabelText(t.confirmPassword), {
    target: { value: 'preview-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.enableTwoFactor }));
  expect(await screen.findByRole('img', { name: 'TOTP QR' })).toBeTruthy();
  expect(enable).toHaveBeenCalledWith('preview-password');
  expect(screen.getByText('preview-code-one')).toBeTruthy();
  expect(screen.getByText('preview-code-two')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: t.code }), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: t.verify }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', t.invalidCode);
  expect(screen.getByText('preview-code-one')).toBeTruthy();
  verify.mockResolvedValueOnce({});
  fireEvent.click(screen.getByRole('button', { name: t.verify }));
  expect(await screen.findByText(t.twoFactorEnabled)).toBeTruthy();
  expect(verify).toHaveBeenLastCalledWith('123456');
  expect(onChanged).toHaveBeenCalledOnce();
});
