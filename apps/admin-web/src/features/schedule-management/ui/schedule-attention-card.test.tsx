import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { render } from '@/test-utils';
import { ScheduleAttentionCard } from './schedule-attention-card';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';

const employeeId = 'b0000000-0000-4000-8000-000000000001';
const avatarVersion = 'b0000000-0000-4000-8000-000000000002';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows linked worker avatars for birthdays and sick leave with the recorded check-in', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            today: '2026-09-13',
            holiday: null,
            birthdaysToday: [employeeId],
            replacements: [],
            onSickLeave: [
              {
                requestId: avatarVersion,
                employeeId,
                type: 'SICK_LEAVE',
                status: 'APPROVED',
                from: '2026-09-12',
                to: '2026-09-15',
                lastCheckin: {
                  businessDate: '2026-09-13',
                  answer: 'GOOD',
                  answeredAt: '2026-09-13T08:00:00Z',
                },
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
  render(
    <ScheduleAttentionCard
      accessKey="qa"
      siteId={employeeId}
      employees={[{ id: employeeId, fullName: 'Synthetic worker', avatarVersion }]}
    />,
  );
  const links = await screen.findAllByRole('link', { name: 'Synthetic worker' });
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link.getAttribute('href')).toBe(`#/administration/employees/${employeeId}`);
    expect(link.querySelector('img')?.getAttribute('src')).toContain(`avatar?v=${avatarVersion}`);
  }
  expect(screen.getByText(messages(currentLocale()).scheduleWorkspace.checkinGood)).toBeTruthy();
});
