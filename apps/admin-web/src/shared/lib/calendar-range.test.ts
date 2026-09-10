import { describe, expect, it } from 'vitest';
import { createCalendarRangeDraft } from './calendar-range';

describe('calendar range draft', () => {
  it('requires two endpoints, sorts reverse selection and starts a fresh range after completion', () => {
    const model = createCalendarRangeDraft();
    model.reset('all', '2026-09-10', '2026-09-10');
    model.select('2026-09-10');
    expect(model.value()).toBeNull();
    model.select('2026-07-31');
    expect(model.value()).toEqual({ mode: 'month', from: '2026-07-01', to: '2026-09-01' });
    model.select('2026-10-01');
    expect(model.value()).toBeNull();
    model.select('2026-10-01');
    expect(model.value()).toEqual({ mode: 'month', from: '2026-10-01', to: '2026-10-01' });
  });
  it('changes unit without reusing hidden day selections and supports ranges across year pages', () => {
    const model = createCalendarRangeDraft();
    model.reset('day', '2026-09-10', '2026-09-12');
    model.setUnit('year');
    expect(model.value()).toBeNull();
    model.select('2025-12-31');
    model.move(1);
    model.select('2028-02-29');
    expect(model.value()).toEqual({ mode: 'year', from: '2025-01-01', to: '2028-01-01' });
    model.reset('day', '2026-09-10', '2026-09-12');
    expect(model.value()).toEqual({ mode: 'day', from: '2026-09-10', to: '2026-09-12' });
  });
});
