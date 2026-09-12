import { describe, expect, it, vi } from 'vitest';
import { EmployeeView, type EmployeesPage } from '@vakhta/contracts';
import { loadScheduleRoster } from './roster';

const roster = Array.from({ length: 205 }, (_, index) =>
  EmployeeView.parse({
    id: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    personnelNumber: `P${index}`,
    fullName: `Worker ${index + 1}`,
    status: 'ACTIVE',
    telegramLinked: false,
    email: null,
    phone: null,
    telegramUsername: null,
    currentPosition: null,
    createdAt: '2026-09-01T00:00:00Z',
  }),
);
const first = { items: roster.slice(0, 200), total: 205, nextCursor: roster[199]?.id ?? null };
const last = { items: roster.slice(200), total: 205, nextCursor: null };

describe('complete schedule roster', () => {
  it('finds an employee beyond 200 and passes cancellation through every page', async () => {
    const signal = new AbortController().signal;
    const read = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(last);
    const result = await loadScheduleRoster(signal, read);
    expect(result).toHaveLength(205);
    expect(result.find((employee) => employee.fullName === 'Worker 205')).toEqual(roster[204]);
    expect(read.mock.calls).toEqual([
      [undefined, signal],
      [first.nextCursor, signal],
    ]);
  });
  it.each([
    { ...last, total: 206 },
    { ...last, items: roster.slice(0, 5) },
    { ...last, items: [] },
    { ...last, nextCursor: first.nextCursor },
  ])(
    'rejects changed, duplicate, incomplete or nonprogressing pages',
    async (page: EmployeesPage) => {
      const read = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(page);
      await expect(loadScheduleRoster(new AbortController().signal, read)).rejects.toThrow();
    },
  );
  it('does not return a partial roster after a failed page', async () => {
    const read = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Offline'));
    await expect(loadScheduleRoster(new AbortController().signal, read)).rejects.toThrow('Offline');
  });
  it('ignores a page completing after cancellation and requests no more pages', async () => {
    const controller = new AbortController();
    const read = vi.fn(async () => {
      controller.abort();
      return first;
    });
    await expect(loadScheduleRoster(controller.signal, read)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('accepts a successful empty directory', async () => {
    await expect(
      loadScheduleRoster(new AbortController().signal, async () => ({
        items: [],
        total: 0,
        nextCursor: null,
      })),
    ).resolves.toEqual([]);
  });
});
