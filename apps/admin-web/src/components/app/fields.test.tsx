import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SelectField } from './fields.tsx';

const many = Array.from({ length: 12 }, (_, i) => ({
  value: `e${i}`,
  label: i === 3 ? 'Кузнецов Леонид · 0004' : `Сотрудник ${i} · 00${i}`,
}));

describe('SelectField', () => {
  afterEach(cleanup);

  it('stays a native select for short lists', () => {
    render(
      <SelectField
        label="Статус"
        value=""
        onChange={() => undefined}
        options={many.slice(0, 3)}
        placeholder="Все"
      />,
    );
    expect((screen.getByLabelText('Статус') as HTMLSelectElement).tagName).toBe('SELECT');
  });

  it(
    'turns into a searchable combobox for long lists and filters by typing',
    { timeout: 60_000 },
    async () => {
      const onChange = vi.fn();
      render(
        <SelectField
          label="Сотрудник"
          value=""
          onChange={onChange}
          options={many}
          placeholder="…"
        />,
      );
      const trigger = screen.getByRole('combobox', { name: 'Сотрудник' });
      fireEvent.click(trigger);
      const search = await screen.findByPlaceholderText('Поиск');
      fireEvent.change(search, { target: { value: 'Кузнец' } });
      expect(screen.queryByText('Сотрудник 1 · 001')).toBeNull();
      fireEvent.click(await screen.findByText('Кузнецов Леонид · 0004'));
      expect(onChange).toHaveBeenCalledWith('e3');
    },
  );
});
