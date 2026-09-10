import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@vakhta/i18n';
import { AnalyzeButton } from './analyze-button';
vi.mock('@/i18n', () => ({ currentLocale: () => 'en' }));
afterEach(cleanup);
const t = messages('en').photoInspection;
const sparks = () => document.querySelectorAll('.spark');
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
describe('the answer arriving', () => {
  it('stays still until an answer comes back, and while one is still being waited for', () => {
    const { rerender } = render(<AnalyzeButton disabled={false} onAnalyze={vi.fn()} />);
    expect(sparks()).toHaveLength(0);
    rerender(<AnalyzeButton disabled={false} loading finished="run-1" onAnalyze={vi.fn()} />);
    expect(sparks()).toHaveLength(0);
  });
  it('throws sparks from the wand, and throws them again for the next answer', () => {
    const { rerender } = render(
      <AnalyzeButton disabled={false} finished="run-1" onAnalyze={vi.fn()} />,
    );
    const first = [...sparks()];
    expect(first.length).toBeGreaterThan(0);

    // The same answer is the same burst: re-rendering it does not replay the animation.
    rerender(<AnalyzeButton disabled={false} finished="run-1" onAnalyze={vi.fn()} />);
    expect([...sparks()][0]).toBe(first[0]);

    // A second analysis is a second answer, so the sparks are mounted again and play again.
    rerender(<AnalyzeButton disabled={false} finished="run-2" onAnalyze={vi.fn()} />);
    expect([...sparks()][0]).not.toBe(first[0]);
  });
  it('hides the sparks from anyone reading the button out loud', () => {
    render(<AnalyzeButton disabled={false} finished="run-1" onAnalyze={vi.fn()} />);
    expect(sparks()[0]?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByRole('button').textContent).toBe(t.analyze);
  });
});
