import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ChecklistDefinitionView, OrgSnapshot } from '@vakhta/contracts';
import { ChecklistsTab } from './ChecklistsTab.tsx';
import { clickRowAction } from '../test-utils.ts';

const SITE = 'a0000000-0000-4000-8000-000000000001';
const POS = 'a0000000-0000-4000-8000-000000000004';
const C1 = 'c0000000-0000-4000-8000-000000000001';
const C2 = 'c0000000-0000-4000-8000-000000000002';

const org: OrgSnapshot = {
  sites: [{ id: SITE, code: 'main', name: 'Основная площадка', timezone: 'Europe/Kyiv' }],
  orgUnits: [],
  teams: [],
  positions: [{ id: POS, code: 'OPERATOR', name: 'Оператор линии' }],
  zones: [],
  terminals: [],
  reasonCodes: [],
};

function checklist(over: Partial<ChecklistDefinitionView> = {}): ChecklistDefinitionView {
  return {
    id: C1,
    familyId: 'f1',
    name: 'Оператор линии',
    version: 1,
    positions: [{ id: POS, name: 'Оператор линии' }],
    zoneType: null,
    items: [
      { key: 'ITEM_01', label: 'Линия остановлена', kind: 'CHECK' },
      { key: 'ITEM_02', label: 'Сообщение смене', kind: 'NOTE' },
      { key: 'ITEM_03', label: 'Фото линии', kind: 'PHOTO' },
    ],
    isActive: true,
    validFrom: '2026-09-06T10:00:00.000Z',
    createdAt: '2026-09-06T10:00:00.000Z',
    handovers: 0,
    ...over,
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function mockApi(initial: ChecklistDefinitionView[]) {
  const calls: Call[] = [];
  let rows = [...initial];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ method, path, body });
      if (path === '/admin/org/checklists' && method === 'GET') return json(rows);
      if (path === '/admin/org/checklists' && method === 'POST') {
        const created = checklist({
          id: C2,
          familyId: 'f2',
          name: String(body?.['name']),
          items: (body?.['items'] as { label: string; kind: 'CHECK' | 'NOTE' | 'PHOTO' }[]).map(
            (i, n) => ({ key: `ITEM_0${n + 1}`, ...i }),
          ),
        });
        rows = [...rows, created];
        return json(created, 201);
      }
      if (path === `/admin/org/checklists/${C1}` && method === 'PATCH') {
        const updated = checklist({ id: 'c1v2', name: String(body?.['name']), version: 2 });
        rows = rows.map((r) => (r.id === C1 ? updated : r));
        return json(updated);
      }
      return json({ code: 'NOT_FOUND', message: path }, 404);
    }),
  );
  return calls;
}

describe('ChecklistsTab', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('lists checklists with their item summary and shows the bot preview on click', async () => {
    mockApi([checklist()]);
    render(<ChecklistsTab org={org} />);
    expect(await screen.findByText('3 пунктов · 1 фото')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Оператор линии')[0]!);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Так увидит сотрудник в боте')).toBeTruthy();
    expect(within(sheet).getByText('Фото линии')).toBeTruthy();
    expect(within(sheet).getByText('Действует')).toBeTruthy();
  });

  it('creates a checklist from the dialog: items in order, keys assigned by the server', async () => {
    const calls = mockApi([]);
    render(<ChecklistsTab org={org} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Создать чек-лист' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Название'), {
      target: { value: 'Фасовка' },
    });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Оператор линии' }));
    fireEvent.change(within(dialog).getByLabelText('Текст пункта 1'), {
      target: { value: 'Весы обнулены' },
    });
    fireEvent.change(within(dialog).getByLabelText('Текст пункта 2'), {
      target: { value: 'Фото стола' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить пункт' }));
    fireEvent.change(within(dialog).getByLabelText('Текст пункта 3'), {
      target: { value: 'Плёнка заправлена' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Выше 3' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));

    await waitFor(() =>
      expect(
        calls.find((c) => c.method === 'POST' && c.path === '/admin/org/checklists'),
      ).toBeTruthy(),
    );
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Фасовка',
      positionIds: [POS],
      zoneType: null,
      items: [
        { label: 'Весы обнулены', kind: 'CHECK' },
        { label: 'Плёнка заправлена', kind: 'CHECK' },
        { label: 'Фото стола', kind: 'PHOTO' },
      ],
    });
    expect((await screen.findByRole('status')).textContent).toContain('Чек-лист создан.');
    expect((await screen.findAllByText('Фасовка')).length).toBeGreaterThan(0);
  });

  it('refuses a checklist without a photo item and with an empty item text', async () => {
    const calls = mockApi([]);
    render(<ChecklistsTab org={org} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Создать чек-лист' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Название'), { target: { value: 'Без фото' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Оператор линии' }));
    fireEvent.change(within(dialog).getByLabelText('Текст пункта 1'), {
      target: { value: 'Пункт' },
    });
    fireEvent.change(within(dialog).getByLabelText('Тип 2'), { target: { value: 'CHECK' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(await within(dialog).findByText('Заполните текст пункта.')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Текст пункта 2'), {
      target: { value: 'Ещё пункт' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(
      await within(dialog).findByText('Добавьте хотя бы один пункт «Фото»: фото обязательно.'),
    ).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('edits a checklist as a new version through the row menu', async () => {
    const calls = mockApi([checklist()]);
    render(<ChecklistsTab org={org} />);
    await screen.findByText('3 пунктов · 1 фото');
    await clickRowAction('Изменить');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Изменить: Оператор линии')).toBeTruthy();
    expect((within(dialog).getByLabelText('Текст пункта 3') as HTMLInputElement).value).toBe(
      'Фото линии',
    );
    fireEvent.change(within(dialog).getByLabelText('Название'), {
      target: { value: 'Оператор линии v2' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.path).toBe(`/admin/org/checklists/${C1}`),
    );
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Оператор линии v2',
      positionIds: [POS],
      zoneType: null,
      items: [
        { label: 'Линия остановлена', kind: 'CHECK' },
        { label: 'Сообщение смене', kind: 'NOTE' },
        { label: 'Фото линии', kind: 'PHOTO' },
      ],
    });
    expect(await screen.findByText('v2')).toBeTruthy();
  });
});
