import { stubFetch } from '@/test/stub-fetch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { EmployeeProfileView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { render, renderRouted } from '@/test-utils';
import { currentLocale } from '@/i18n';
import fixture from '../model/__fixtures__/profile.json';
import { ProfileContent, ProfilePage } from './profile-page';
import { ProfileSheet } from './profile-sheet';
import { SectionEditor } from './section-editor';

const profile = EmployeeProfileView.parse(fixture);
const t = messages(currentLocale()).employeeProfile;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('employee profile journeys', () => {
  it('keeps the directory sheet read-only with a direct profile link', async () => {
    stubFetch(vi.fn(async () => json(profile)));
    render(<ProfileSheet employeeId={profile.employee.id} onClose={vi.fn()} />);
    const link = await screen.findByRole('link', { name: t.openProfile });
    expect(new URL(link.getAttribute('href') ?? '', location.href).hash).toBe(
      `#/administration/employees/${profile.employee.id}`,
    );
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: t.edit })).toBeNull();
    expect(screen.queryByText(t.addEntry)).toBeNull();
  });
  it('opens all editable personal fields together and disables unchanged saves', () => {
    render(<ProfileContent profile={profile} onOpenSchedule={vi.fn()} />);
    expect(screen.queryByLabelText(t.fullName)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.edit }));
    expect(screen.getByLabelText(t.fullName)).toBeTruthy();
    expect(screen.getByLabelText(t.email)).toBeTruthy();
    expect(screen.getByLabelText(t.birthDate)).toBeTruthy();
    expect(screen.getByLabelText(t.maritalStatus)).toBeTruthy();
    const save = screen.getByRole('button', { name: t.save });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText(t.fullName), { target: { value: 'Changed name' } });
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.change(screen.getByLabelText(t.fullName), {
      target: { value: profile.employee.fullName },
    });
    expect(save.hasAttribute('disabled')).toBe(true);
  });
  it('locks the draft and cancellation while a save is pending', async () => {
    let finish: ((response: Response) => void) | undefined;
    stubFetch(
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const close = vi.fn();
    render(<SectionEditor profile={profile} section="all" onClose={close} />);
    fireEvent.change(screen.getByLabelText(t.fullName), { target: { value: 'Saved name' } });
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: t.cancel }).hasAttribute('disabled')).toBe(true),
    );
    expect(screen.getByLabelText(t.fullName).closest('fieldset')?.disabled).toBe(true);
    finish?.(json({}));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('preserves a stale draft until current values are deliberately acknowledged', async () => {
    const latest = {
      ...profile,
      version: '2026-09-13T15:00:00.000Z',
      employee: { ...profile.employee, fullName: 'Saved elsewhere' },
    };
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === 'PATCH' ? json({ code: 'EMPLOYEE_VERSION_CONFLICT' }, 409) : json(latest),
    );
    stubFetch(fetch);
    render(<SectionEditor profile={profile} section="all" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(t.fullName), { target: { value: 'My unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText('Saved elsewhere')).toBeTruthy();
    expect((screen.getByLabelText(t.fullName) as HTMLInputElement).value).toBe('My unsaved draft');
    expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.useLatest }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(false),
    );
    expect((screen.getByLabelText(t.fullName) as HTMLInputElement).value).toBe('My unsaved draft');
    fireEvent.click(
      screen.getByRole('button', { name: messages(currentLocale()).ui.common.reset }),
    );
    await waitFor(() =>
      expect((screen.getByLabelText(t.fullName) as HTMLInputElement).value).toBe('Saved elsewhere'),
    );
    expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(true);
  });
  it('hides privileged fields and actions for a master and all editing for a terminated employee', () => {
    const { compensation: _compensation, maritalStatus: _marital, ...publicProfile } = profile;
    const restricted = {
      ...publicProfile,
      birthDate: { day: 14, month: 3 },
      access: {
        personalEdit: false,
        statusEdit: false,
        maritalStatus: false,
        birthDate: 'DAY_MONTH' as const,
        compensation: 'NONE' as const,
      },
    };
    const view = render(<ProfileContent profile={restricted} onOpenSchedule={vi.fn()} />);
    expect(screen.queryByText(t.maritalStatus)).toBeNull();
    expect(screen.queryByText(t.compensation)).toBeNull();
    expect(screen.queryByText('1990-03-14')).toBeNull();
    expect(screen.queryByRole('button', { name: t.edit })).toBeNull();
    view.rerender(
      <ProfileContent
        profile={{
          ...profile,
          employee: { ...profile.employee, status: 'TERMINATED' },
          access: { ...profile.access, personalEdit: false, compensation: 'READ' },
        }}
        onOpenSchedule={vi.fn()}
      />,
    );
    expect(screen.getByText(t.terminated)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.edit })).toBeNull();
    expect(screen.queryByRole('button', { name: t.addEntry })).toBeNull();
  });
});

it('returns from the employee profile to the directory without inheriting the employee ID', async () => {
  stubFetch(vi.fn(async () => json(profile)));
  history.replaceState(null, '', `#/administration/employees/${profile.employee.id}`);
  await renderRouted(<ProfilePage employeeId={profile.employee.id} onOpenSchedule={vi.fn()} />);
  fireEvent.click(await screen.findByRole('link', { name: `← ${t.back}` }));
  await waitFor(() => expect(location.hash).toBe('#/administration/employees'));
});

it('resets a changed form and disables reset again', () => {
  render(<SectionEditor profile={profile} section="all" onClose={vi.fn()} />);
  const reset = screen.getByRole('button', { name: messages(currentLocale()).ui.common.reset });
  expect(reset.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText(t.fullName), { target: { value: 'New draft' } });
  expect(reset.hasAttribute('disabled')).toBe(false);
  fireEvent.click(reset);
  expect(screen.getByLabelText(t.fullName)).toHaveProperty('value', profile.employee.fullName);
  expect(reset.hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: t.save }).hasAttribute('disabled')).toBe(true);
});

it('shows a contract validation error and sends no invalid command', async () => {
  const fetch = vi.fn();
  stubFetch(fetch);
  render(<SectionEditor profile={profile} section="all" onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(t.email), { target: { value: 'not-an-email' } });
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText(t.email).getAttribute('aria-invalid')).toBe('true');
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves a failed draft and sends only one command until an explicit retry', async () => {
  const fetch = vi.fn(async () => json({ code: 'UNAVAILABLE' }, 503));
  stubFetch(fetch);
  const close = vi.fn();
  render(<SectionEditor profile={profile} section="all" onClose={close} />);
  fireEvent.change(screen.getByLabelText(t.fullName), { target: { value: 'Preserved draft' } });
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  expect(await screen.findByText(t.failed)).toBeTruthy();
  expect(screen.getByLabelText(t.fullName)).toHaveProperty('value', 'Preserved draft');
  expect(fetch).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  fetch.mockResolvedValue(json({}));
  fireEvent.click(screen.getByRole('button', { name: t.save }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledTimes(2);
});
