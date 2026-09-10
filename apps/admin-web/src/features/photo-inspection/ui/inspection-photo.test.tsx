import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { HandoverPhotoView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { InspectionPhoto } from './inspection-photo';
vi.mock('@/i18n', () => ({ currentLocale: () => 'en' }));
afterEach(cleanup);
const t = messages('en').photoInspection;
const photo: HandoverPhotoView = {
  itemKey: 'table',
  label: 'Workplace',
  media: {
    id: '10000000-0000-4000-8000-000000000001',
    width: 1000,
    height: 650,
    quality: 'OK',
    receivedAt: '2026-09-11T00:00:00Z',
    processedAt: null,
    duplicateOfId: null,
  },
};
function show(inspection: HandoverPhotoView['inspection']) {
  const onOpen = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InspectionPhoto
        photo={{ ...photo, inspection }}
        loadLink={async () => ({ url: 'https://example.test/photo.jpg' })}
        onOpen={onOpen}
      />
    </QueryClientProvider>,
  );
  return onOpen;
}
it('keeps untouched and AI-only photos unhighlighted and clickable', async () => {
  const open = show(null);
  const button = await screen.findByRole('button', { name: 'Workplace' });
  expect(button.className).not.toContain('ring-chart-1/60');
  fireEvent.click(button);
  expect(open).toHaveBeenCalledOnce();
});
it('highlights saved annotations and explains an unfinished review on keyboard focus', async () => {
  show({ status: 'UNREVIEWED', annotationCount: 2 });
  const button = await screen.findByRole('button', { name: /Workplace/ });
  expect(button.className).toContain('ring-chart-1/60');
  expect(screen.queryByText(t.marker.annotated, { exact: true })).toBeNull();
  fireEvent.focus(button);
  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip.textContent).toContain(t.marker.annotated);
  expect(tooltip.textContent).toContain(t.marker.incomplete);
  expect(tooltip.textContent).toContain(`${t.marker.regions}: 2`);
});
it('retains the saved clean-review meaning without a text block below the photo', async () => {
  show({ status: 'COMPLIANT', annotationCount: 0 });
  const button = await screen.findByRole('button', { name: /Workplace/ });
  expect(button.getAttribute('aria-label')).toContain(t.marker.reviewed);
  expect(button.getAttribute('aria-label')).toContain(t.statuses.COMPLIANT);
  expect(screen.queryByText(t.marker.reviewed, { exact: true })).toBeNull();
});

it('shows the saved-data explanation on mouse hover', async () => {
  show({ status: 'PROBLEMS', annotationCount: 10 });
  const button = await screen.findByRole('button', { name: /Workplace/ });
  fireEvent.pointerMove(button, { pointerType: 'mouse' });
  expect((await screen.findByRole('tooltip')).textContent).toContain(`${t.marker.regions}: 10`);
});
