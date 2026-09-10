import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { messages } from '@vakhta/i18n';
import { InspectionMarker } from './inspection-marker';
vi.mock('@/i18n', () => ({ currentLocale: () => 'en' }));
afterEach(cleanup);
const t = messages('en').photoInspection;
it('leaves untouched and AI-only photos unmarked', () => {
  render(<InspectionMarker inspection={null} />);
  expect(screen.queryByTestId('inspection-marker')).toBeNull();
});
it('distinguishes saved annotations from review completion', () => {
  render(<InspectionMarker inspection={{ status: 'UNREVIEWED', annotationCount: 2 }} />);
  expect(screen.getByTestId('inspection-marker').textContent).toContain(t.marker.annotated);
  expect(screen.getByTestId('inspection-marker').textContent).toContain(t.marker.incomplete);
});
it('marks saved clean reviews even without annotations', () => {
  render(<InspectionMarker inspection={{ status: 'COMPLIANT', annotationCount: 0 }} />);
  expect(screen.getByTestId('inspection-marker').textContent).toContain(t.marker.reviewed);
  expect(screen.getByTestId('inspection-marker').textContent).toContain(t.statuses.COMPLIANT);
});
