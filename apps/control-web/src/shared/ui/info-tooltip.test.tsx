// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InfoTooltip } from './info-tooltip';

afterEach(cleanup);

it('opens informational tooltips by click without requiring hover', { timeout: 15_000 }, () => {
  render(
    <InfoTooltip label="How to get a bot token" text="Open @BotFather">
      ?
    </InfoTooltip>,
  );
  const help = screen.getByRole('button', { name: 'How to get a bot token' });
  fireEvent.click(help);
  expect(help.getAttribute('data-state')).toBe('instant-open');
  expect(screen.getByRole('tooltip', { hidden: true }).textContent).toContain('@BotFather');
  fireEvent.click(help);
  expect(help.getAttribute('data-state')).toBe('closed');
});
