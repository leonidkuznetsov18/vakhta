import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InspectionReview } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AnalyzeButton } from './analyze-button';

vi.mock('@/i18n', () => ({ currentLocale: () => 'en' }));
afterEach(cleanup);
const t = messages('en').photoInspection;
const empty: InspectionReview = {
  status: 'UNREVIEWED',
  comment: '',
  guidance: '',
  annotations: [],
};
const region: InspectionReview = {
  ...empty,
  status: 'PROBLEMS',
  annotations: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      category: 'DIRT',
      comment: 'Dust on table',
      geometry: { type: 'RECTANGLE', x: 0, y: 0, width: 0.5, height: 0.5 },
      sourceRunId: null,
    },
  ],
};
function show(review: InspectionReview, disabled = false) {
  const onAnalyze = vi.fn();
  render(
    <TooltipProvider>
      <AnalyzeButton review={review} disabled={disabled} onAnalyze={onAnalyze} />
    </TooltipProvider>,
  );
  return onAnalyze;
}
describe('analysis action prerequisites', () => {
  it.each([empty, { ...empty, comment: '  ', guidance: '\n ' }])(
    'blocks empty fields and whitespace',
    (review) => {
      const analyze = show(review);
      const button = screen.getByRole('button', { name: t.analyze });
      expect(button.hasAttribute('disabled')).toBe(true);
      fireEvent.click(button);
      expect(analyze).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...empty, comment: 'Check the table' },
    { ...empty, guidance: 'Keep this area clear' },
    region,
  ])('allows a saved comment, requirements or described region', (review) => {
    const analyze = show(review);
    fireEvent.click(screen.getByRole('button', { name: t.analyze }));
    expect(analyze).toHaveBeenCalledOnce();
  });
  it('retains pending or unsaved-change protection when fields have content', () => {
    show(region, true);
    expect(screen.getByRole('button', { name: t.analyze }).hasAttribute('disabled')).toBe(true);
  });
  it('explains the disabled action on keyboard focus', async () => {
    show(empty);
    fireEvent.focus(screen.getByLabelText(t.analyze));
    expect((await screen.findByRole('tooltip')).textContent).toContain(t.analyzeEmptyHint);
  });
});
