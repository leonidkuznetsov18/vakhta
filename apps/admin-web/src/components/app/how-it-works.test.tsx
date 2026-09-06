import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FaqButton, HowItWorks } from './how-it-works.tsx';

describe('HowItWorks and FaqButton', () => {
  afterEach(cleanup);

  it('explains the section in steps and opens the questions', () => {
    render(<HowItWorks guide="schedule" />);
    expect(screen.getByText('Как это работает')).toBeTruthy();
    expect(screen.getByText(/Выберите площадку, подразделение и месяц/)).toBeTruthy();
    // the block collapses and expands again
    fireEvent.click(screen.getByRole('button', { name: /Как это работает/ }));
    expect(screen.queryByText(/Выберите площадку, подразделение и месяц/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Как это работает/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Вопросы и ответы' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Помощь: График')).toBeTruthy();
    expect(within(sheet).getByText('Что такое «Заменён»?')).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: /Открыть руководство/ })).toBeTruthy();
  });

  it('the header button names the administration tab', () => {
    render(<FaqButton guide="terminals" />);
    fireEvent.click(screen.getByRole('button', { name: 'Помощь: Терминалы' }));
    expect(within(screen.getByRole('dialog')).getByText(/Планшет показывает/)).toBeTruthy();
  });
});
