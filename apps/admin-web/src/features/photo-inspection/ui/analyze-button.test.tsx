import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@vakhta/i18n';
import { AnalyzeButton } from './analyze-button';
vi.mock('@/i18n', () => ({ currentLocale: () => 'en' }));
afterEach(cleanup);
const t = messages('en').photoInspection;
describe('AI helper', () => {
  it('allows analysis without any saved review or form prerequisites', () => {
    const analyze = vi.fn();
    render(<AnalyzeButton disabled={false} onAnalyze={analyze} />);
    fireEvent.click(screen.getByRole('button', { name: t.analyze }));
    expect(analyze).toHaveBeenCalledOnce();
  });
  it('blocks duplicate analysis while loading and announces progress', () => {
    const analyze = vi.fn();
    render(<AnalyzeButton disabled={false} loading onAnalyze={analyze} />);
    const button = screen.getByRole('button');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain(t.aiPending);
    fireEvent.click(button);
    expect(analyze).not.toHaveBeenCalled();
  });
  it('retains the saving guard and keyboard-accessible explanation', async () => {
    render(<AnalyzeButton disabled onAnalyze={vi.fn()} />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
    fireEvent.focus(screen.getByLabelText(t.analyze));
    expect((await screen.findByRole('tooltip')).textContent).toContain(t.analyzeHint);
  });
});
