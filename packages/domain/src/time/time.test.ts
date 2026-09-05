import { describe, expect, it } from 'vitest';
import { businessDateOf, formatLocal, planInstants } from './plan.js';
import {
  earlyLeaveMinutes,
  lateMinutes,
  overtimePending,
  shiftDurationMinutes,
} from './deviations.js';

const KYIV = 'Europe/Kyiv';
const DAY = { localStart: '08:00', localEnd: '20:00' };
const NIGHT = { localStart: '20:00', localEnd: '08:00' };

describe('planInstants (ADR-5, NFR-11)', () => {
  it('денна зміна триває 12 годин і має ділову дату свого дня', () => {
    const p = planInstants('2026-09-05', DAY, KYIV);
    expect(p.durationMinutes).toBe(12 * 60);
    expect(p.businessDate).toBe('2026-09-05');
    // Київ у вересні UTC+3: 08:00 локально = 05:00Z
    expect(p.planStartAt.toISOString()).toBe('2026-09-05T05:00:00.000Z');
    expect(p.planEndAt.toISOString()).toBe('2026-09-05T17:00:00.000Z');
  });

  it('T-01: нічна зміна через північ є однією зміною з діловою датою початку', () => {
    const p = planInstants('2026-09-05', NIGHT, KYIV);
    expect(p.businessDate).toBe('2026-09-05');
    expect(p.durationMinutes).toBe(12 * 60);
    expect(p.planStartAt.toISOString()).toBe('2026-09-05T17:00:00.000Z');
    expect(p.planEndAt.toISOString()).toBe('2026-09-06T05:00:00.000Z');
  });

  it('нічна зміна в ніч переходу на літній час (29.03.2026) триває 11 годин', () => {
    const p = planInstants('2026-03-28', NIGHT, KYIV);
    expect(p.durationMinutes).toBe(11 * 60);
    expect(p.businessDate).toBe('2026-03-28');
  });

  it('нічна зміна в ніч переходу на зимовий час (25.10.2026) триває 13 годин', () => {
    const p = planInstants('2026-10-24', NIGHT, KYIV);
    expect(p.durationMinutes).toBe(13 * 60);
    expect(p.businessDate).toBe('2026-10-24');
  });

  it('відхиляє невідомий часовий пояс і некоректний час', () => {
    expect(() => planInstants('2026-09-05', DAY, 'Mars/Olympus')).toThrow(RangeError);
    expect(() =>
      planInstants('2026-09-05', { localStart: '8:00', localEnd: '20:00' }, KYIV),
    ).toThrow(RangeError);
    expect(() => planInstants('2026-13-05', DAY, KYIV)).toThrow(RangeError);
  });
});

describe('businessDateOf і formatLocal', () => {
  it('момент після півночі за Києвом належить наступній локальній даті', () => {
    expect(businessDateOf(new Date('2026-09-05T21:30:00Z'), KYIV)).toBe('2026-09-06');
    expect(businessDateOf(new Date('2026-09-05T20:59:00Z'), KYIV)).toBe('2026-09-05');
  });

  it('показує локальний час і зміщення (ТЗ 6.1)', () => {
    expect(formatLocal(new Date('2026-09-05T17:00:00Z'), KYIV)).toEqual({
      local: '2026-09-05 20:00',
      offset: '+03:00',
    });
    expect(formatLocal(new Date('2026-12-05T17:00:00Z'), KYIV).offset).toBe('+02:00');
  });
});

describe('відхилення (ТЗ 6.1, 7.3)', () => {
  const planStart = new Date('2026-09-05T05:00:00Z');
  const planEnd = new Date('2026-09-05T17:00:00Z');

  it('T-15: початок у пільговому вікні не є запізненням', () => {
    expect(lateMinutes(new Date('2026-09-05T05:04:00Z'), planStart, 5)).toBe(0);
    expect(lateMinutes(new Date('2026-09-05T04:50:00Z'), planStart, 5)).toBe(0);
  });

  it('T-16: запізнення 20 хвилин при вікні 5 дає 15 хвилин понад вікно', () => {
    expect(lateMinutes(new Date('2026-09-05T05:20:00Z'), planStart, 5)).toBe(15);
  });

  it('ранній відхід рахується так само симетрично', () => {
    expect(earlyLeaveMinutes(new Date('2026-09-05T16:58:00Z'), planEnd, 5)).toBe(0);
    expect(earlyLeaveMinutes(new Date('2026-09-05T16:30:00Z'), planEnd, 5)).toBe(25);
    expect(earlyLeaveMinutes(new Date('2026-09-05T17:30:00Z'), planEnd, 5)).toBe(0);
  });

  it('T-21: робота після плану і початок до вікна є overtime_pending', () => {
    const o = overtimePending({
      actualStartAt: new Date('2026-09-05T04:30:00Z'),
      actualEndAt: new Date('2026-09-05T17:45:00Z'),
      planStartAt: planStart,
      planEndAt: planEnd,
      earlyStartWindowMinutes: 15,
    });
    expect(o).toEqual({ beforeMinutes: 15, afterMinutes: 45, totalMinutes: 60 });
  });

  it("фактична тривалість не буває від'ємною", () => {
    expect(shiftDurationMinutes(planEnd, planStart)).toBe(0);
    expect(shiftDurationMinutes(planStart, planEnd)).toBe(720);
  });
});
