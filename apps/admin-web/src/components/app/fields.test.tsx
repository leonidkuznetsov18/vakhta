import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '../../test-utils.tsx';
import { FormField, SelectField } from './fields.tsx';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const many = Array.from({ length: 12 }, (_, i) => ({
  value: `e${i}`,
  label: i === 3 ? 'Кузнецов Леонид · 0004' : `Сотрудник ${i} · 00${i}`,
}));

describe('SelectField', () => {
  afterEach(cleanup);

  it('focuses the first form control rather than a heading tooltip in dialogs', async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>
            Editor <button data-info-tip>Help</button>
          </DialogTitle>
          <Input aria-label="First field" />
          <button>Save</button>
        </DialogContent>
      </Dialog>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('First field')));
  });

  it('associates inline errors with their inputs', () => {
    render(
      <FormField label="Name" error="Name is required">
        {(id) => <Input id={id} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Name is required',
    );
  });

  it('validates a required searchable select and focuses its visible trigger', () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <SelectField label="Employee" value="" onChange={() => undefined} options={many} required />
        <button type="submit">Save</button>
      </form>,
    );
    fireEvent.click(screen.getByText('Save'));
    expect(submit).not.toHaveBeenCalled();
    const trigger = screen.getByRole('combobox', { name: 'Employee' });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('opens the searchable select with ArrowDown', async () => {
    render(<SelectField label="Employee" value="" onChange={() => undefined} options={many} />);
    const trigger = screen.getByRole('combobox', { name: 'Employee' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(await screen.findByPlaceholderText('Поиск')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('preserves Enter and submits with Ctrl+Enter only while the submitter is enabled', () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const view = (disabled: boolean) => (
      <form onSubmit={submit}>
        <Textarea aria-label="Comment" />
        <button type="submit" disabled={disabled}>
          Save
        </button>
      </form>
    );
    const { rerender } = render(view(false));
    const input = screen.getByLabelText('Comment');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(submit).toHaveBeenCalledTimes(1);
    rerender(view(true));
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(submit).toHaveBeenCalledTimes(1);
  });

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

  it('turns into a searchable combobox for long lists and filters by typing', async () => {
    const onChange = vi.fn();
    render(
      <SelectField label="Сотрудник" value="" onChange={onChange} options={many} placeholder="…" />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Сотрудник' });
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText('Поиск');
    fireEvent.change(search, { target: { value: 'Кузнец' } });
    expect(screen.queryByText('Сотрудник 1 · 001')).toBeNull();
    fireEvent.click(await screen.findByText('Кузнецов Леонид · 0004'));
    expect(onChange).toHaveBeenCalledWith('e3');
  });
  it('offers to create what the search does not find when a creator is supplied', async () => {
    const onCreate = vi.fn();
    render(
      <SelectField
        label="Объект"
        value=""
        onChange={vi.fn()}
        options={[{ value: 'a', label: 'Ганчірка' }]}
        placeholder="…"
        createLabel="Добавить"
        onCreate={onCreate}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Объект' }));
    const search = await screen.findByPlaceholderText('Поиск');
    fireEvent.change(search, { target: { value: 'ганчірка' } });
    expect(screen.queryByText(/Добавить/)).toBeNull();
    fireEvent.change(search, { target: { value: ' Пляшка ' } });
    fireEvent.click(await screen.findByText('Добавить: «Пляшка»'));
    expect(onCreate).toHaveBeenCalledWith('Пляшка');
  });
});
