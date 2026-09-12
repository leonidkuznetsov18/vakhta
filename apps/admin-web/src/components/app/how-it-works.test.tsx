import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { render } from '../../test-utils.tsx';
import { FaqButton, HowItWorks } from './how-it-works.tsx';

describe('HowItWorks and FaqButton', () => {
  afterEach(cleanup);

  it('starts collapsed, expands on demand and opens the questions', () => {
    const guide = messages(currentLocale()).ui.guide.schedule;
    render(<HowItWorks guide="schedule" />);
    expect(screen.getByText('Как это работает')).toBeTruthy();
    for (const step of guide.steps) expect(screen.queryByText(step)).toBeNull();
    expect(
      screen.getByRole('button', { name: /Как это работает/ }).getAttribute('aria-expanded'),
    ).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Как это работает/ }));
    for (const step of guide.steps) expect(screen.getByText(step)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Как это работает/ }));
    for (const step of guide.steps) expect(screen.queryByText(step)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Вопросы и ответы' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Помощь: График')).toBeTruthy();
    for (const item of guide.faq) expect(within(sheet).getByText(item.q)).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: /Открыть руководство/ })).toBeTruthy();
  });

  it('the header button names the administration tab', () => {
    render(<FaqButton guide="terminals" />);
    fireEvent.click(screen.getByRole('button', { name: 'Помощь: Терминалы' }));
    expect(within(screen.getByRole('dialog')).getByText(/Планшет показывает/)).toBeTruthy();
  });
  it('opens photo-specific instructions and localized video from the editor help', () => {
    render(<HowItWorks guide="photoInspection" compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Вопросы и ответы' }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByText('Помощь: Проверка фото')).toBeTruthy();
    expect(sheet.getByText('Модель обучается после каждого сохранения?')).toBeTruthy();
    expect(
      sheet.getByRole('link', { name: 'Открыть полную инструкцию' }).getAttribute('href'),
    ).toBe('/guides/photo-inspection.ru.html');
    expect(sheet.getByRole('link', { name: /Видеообъяснение/ }).getAttribute('href')).toBe(
      '/guides/photo-inspection.ru.mp4',
    );
  });
});
