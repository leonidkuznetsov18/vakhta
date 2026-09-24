import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { OrgSnapshot, ShiftTemplateView } from '@vakhta/contracts';
import { ShiftPeriod } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { stubFetch } from '@/test/stub-fetch';
import { render } from '../../../test-utils.tsx';
import { UnitShiftsSection } from './unit-shifts-section';

const t = messages(currentLocale()).unitShifts;
const SITE = 'a0000000-0000-4000-8000-000000000001';
const UNIT = 'a0000000-0000-4000-8000-000000000002';
const unit: OrgSnapshot['orgUnits'][number] = {
  id: UNIT,
  siteId: SITE,
  parentId: null,
  name: 'Цех Стаканов',
  masters: [],
  masterEmployeeId: null,
  designatedMaster: null,
};

function shift(over: Partial<ShiftTemplateView>): ShiftTemplateView {
  return {
    id: 'b0000000-0000-4000-8000-000000000001',
    siteId: SITE,
    orgUnitId: UNIT,
    code: 'U_1',
    name: 'Ранкова',
    localStart: '05:00',
    localEnd: '13:00',
    period: ShiftPeriod.DAY,
    isActive: true,
    revision: 3,
    retiredAt: null,
    replacedById: null,
    usedCount: 0,
    ...over,
  };
}
const DAY = shift({
  id: 'b0000000-0000-4000-8000-0000000000d1',
  orgUnitId: null,
  code: 'DAY',
  name: 'Дневная смена',
  localStart: '08:00',
  localEnd: '20:00',
});

const Method = { GET: 'GET', POST: 'POST', PATCH: 'PATCH', DELETE: 'DELETE' } as const;

interface Call {
  readonly method: string;
  readonly path: string;
  readonly search: string;
  readonly body: unknown;
}

function mockApi(rows: ShiftTemplateView[]) {
  const calls: Call[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  stubFetch(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? Method.GET;
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path: url.pathname, search: url.search, body });
      if (url.pathname === '/admin/schedules/templates') return json(rows);
      if (method === Method.POST)
        return json(shift({ id: 'b0000000-0000-4000-8000-00000000000f' }), 201);
      if (method === Method.PATCH) return json(shift({ revision: 4 }));
      if (method === Method.DELETE) return new Response(null, { status: 204 });
      return json({ code: 'NOT_FOUND', message: url.pathname }, 404);
    }),
  );
  return calls;
}

describe('UnitShiftsSection', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('starts from the standard shifts and creates a night shift from its start and length', async () => {
    const calls = mockApi([DAY]);
    render(<UnitShiftsSection unit={unit} editable />);
    fireEvent.click(await screen.findByRole('button', { name: t.createFirst }));
    fireEvent.change(screen.getByLabelText(t.start), { target: { value: '22:00' } });
    fireEvent.click(screen.getByRole('button', { name: '8 ч' }));
    expect((screen.getByLabelText(t.end) as HTMLInputElement).value).toBe('06:00');
    expect(screen.getByRole('radio', { name: t.periods.NIGHT })).toHaveProperty('checked', true);
    fireEvent.click(screen.getByRole('button', { name: t.create }));
    await waitFor(() => expect(calls.some((call) => call.method === Method.POST)).toBe(true));
    expect(calls.find((call) => call.method === Method.POST)).toMatchObject({
      path: `/admin/schedules/units/${UNIT}/templates`,
      body: { name: '', period: ShiftPeriod.NIGHT, localStart: '22:00', localEnd: '06:00' },
    });
  });

  it('opens and closes the time list from the clock and fills the chosen time', async () => {
    mockApi([DAY]);
    render(<UnitShiftsSection unit={unit} editable />);
    fireEvent.click(await screen.findByRole('button', { name: t.createFirst }));
    const [clock] = screen.getAllByRole('button', { name: t.chooseTime });
    if (!clock) throw new Error('start clock missing');
    fireEvent.click(clock);
    const list = await screen.findByRole('listbox', { name: t.chooseTime });
    fireEvent.click(within(list).getByRole('option', { name: '05:30' }));
    expect((screen.getByLabelText(t.start) as HTMLInputElement).value).toBe('05:30');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    fireEvent.click(clock);
    await screen.findByRole('listbox', { name: t.chooseTime });
    fireEvent.click(clock);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('saves an edit only after a change and sends the revision it edited', async () => {
    const calls = mockApi([DAY, shift({})]);
    render(<UnitShiftsSection unit={unit} editable />);
    fireEvent.click(await screen.findByRole('button', { name: `Изменить «Ранкова»` }));
    const save = screen.getByRole('button', { name: t.save });
    expect(save).toHaveProperty('disabled', true);
    const name = screen.getByLabelText(new RegExp(t.name));
    fireEvent.change(name, { target: { value: 'Рання' } });
    expect(save).toHaveProperty('disabled', false);
    fireEvent.change(name, { target: { value: 'Ранкова' } });
    expect(save).toHaveProperty('disabled', true);
    fireEvent.change(name, { target: { value: 'Рання' } });
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((call) => call.method === Method.PATCH)).toBe(true));
    expect(calls.find((call) => call.method === Method.PATCH)?.body).toMatchObject({
      name: 'Рання',
      revision: 3,
    });
  });

  it('refuses a name another current shift of the unit uses', async () => {
    mockApi([DAY, shift({})]);
    render(<UnitShiftsSection unit={unit} editable />);
    fireEvent.click(await screen.findByRole('button', { name: t.add }));
    fireEvent.change(screen.getByLabelText(new RegExp(t.name)), { target: { value: 'ранкова' } });
    expect(screen.getByText(t.errors.SHIFT_TEMPLATE_NAME_TAKEN)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.create })).toHaveProperty('disabled', true);
  });

  it('asks before deleting a used shift and says the planned ones stay', async () => {
    const calls = mockApi([DAY, shift({ usedCount: 12 })]);
    render(<UnitShiftsSection unit={unit} editable />);
    fireEvent.click(await screen.findByRole('button', { name: `Удалить «Ранкова»` }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/12/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: t.delete }));
    await waitFor(() => expect(calls.some((call) => call.method === Method.DELETE)).toBe(true));
    expect(calls.find((call) => call.method === Method.DELETE)).toMatchObject({
      path: '/admin/schedules/templates/b0000000-0000-4000-8000-000000000001',
      search: '?revision=3',
    });
  });

  it('is read-only for anyone but an administrator', async () => {
    mockApi([DAY, shift({})]);
    render(<UnitShiftsSection unit={unit} editable={false} />);
    expect(await screen.findByText('05:00–13:00')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.add })).toBeNull();
    expect(screen.queryByRole('button', { name: `Изменить «Ранкова»` })).toBeNull();
    expect(screen.queryByRole('button', { name: `Удалить «Ранкова»` })).toBeNull();
  });
});
