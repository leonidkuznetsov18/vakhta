import { describe, expect, it } from 'vitest';
import {
  allowedIncidentTransitions,
  canTransitionIncident,
  escalatesImmediately,
  findDuplicateCandidate,
  slaBreached,
  slaDueAt,
} from './lifecycle.js';

describe('життєвий цикл інциденту (ТЗ 5.5, FR-DWN-03..05)', () => {
  it('дозволяє лише переходи з таблиці; термінальні статуси не мають виходів', () => {
    expect(canTransitionIncident('REPORTED', 'ACKNOWLEDGED')).toBe(true);
    expect(canTransitionIncident('ACKNOWLEDGED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionIncident('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canTransitionIncident('RESOLVED', 'CLOSED')).toBe(true);
    expect(canTransitionIncident('RESOLVED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionIncident('CLOSED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionIncident('REPORTED', 'CLOSED')).toBe(false);
    expect(allowedIncidentTransitions('DUPLICATE')).toEqual([]);
  });

  it('SLA за критичністю; безпека ескалюється негайно', () => {
    const at = new Date('2026-09-07T10:00:00Z');
    const policy = { normalMinutes: 60, criticalMinutes: 30, safetyMinutes: 0 };
    expect(slaDueAt(at, 'NORMAL', policy).toISOString()).toBe('2026-09-07T11:00:00.000Z');
    expect(slaDueAt(at, 'CRITICAL', policy).toISOString()).toBe('2026-09-07T10:30:00.000Z');
    expect(slaDueAt(at, 'SAFETY', policy).getTime()).toBe(at.getTime());
    expect(escalatesImmediately('SAFETY')).toBe(true);
    expect(escalatesImmediately('CRITICAL')).toBe(false);
  });

  it('лінкує повідомлення до відкритого інциденту тієї ж зони і причини у вікні', () => {
    const now = new Date('2026-09-07T10:00:00Z');
    const candidates = [
      {
        id: 'old',
        zoneId: 'z1',
        reasonCode: 'BREAKDOWN',
        status: 'REPORTED' as const,
        openedAt: new Date('2026-09-07T08:00:00Z'),
      },
      {
        id: 'closed',
        zoneId: 'z1',
        reasonCode: 'BREAKDOWN',
        status: 'CLOSED' as const,
        openedAt: new Date('2026-09-07T09:50:00Z'),
      },
      {
        id: 'other-zone',
        zoneId: 'z2',
        reasonCode: 'BREAKDOWN',
        status: 'REPORTED' as const,
        openedAt: new Date('2026-09-07T09:55:00Z'),
      },
      {
        id: 'match',
        zoneId: 'z1',
        reasonCode: 'BREAKDOWN',
        status: 'ACKNOWLEDGED' as const,
        openedAt: new Date('2026-09-07T09:30:00Z'),
      },
    ];
    const hit = findDuplicateCandidate(
      candidates,
      { zoneId: 'z1', reasonCode: 'BREAKDOWN', reportedAt: now },
      60,
    );
    expect(hit?.id).toBe('match');
    expect(
      findDuplicateCandidate(
        candidates,
        { zoneId: null, reasonCode: 'BREAKDOWN', reportedAt: now },
        60,
      ),
    ).toBeNull();
    expect(
      findDuplicateCandidate(
        candidates,
        { zoneId: 'z1', reasonCode: 'POWER', reportedAt: now },
        60,
      ),
    ).toBeNull();
  });

  it('порушення SLA рахується за фактом реакції або поточним часом', () => {
    const due = new Date('2026-09-07T11:00:00Z');
    expect(
      slaBreached(
        { slaDueAt: due, acknowledgedAt: null, resolvedAt: null },
        new Date('2026-09-07T10:59:00Z'),
      ),
    ).toBe(false);
    expect(
      slaBreached(
        { slaDueAt: due, acknowledgedAt: null, resolvedAt: null },
        new Date('2026-09-07T11:01:00Z'),
      ),
    ).toBe(true);
    expect(
      slaBreached(
        { slaDueAt: due, acknowledgedAt: new Date('2026-09-07T10:30:00Z'), resolvedAt: null },
        new Date('2026-09-08T00:00:00Z'),
      ),
    ).toBe(false);
    expect(
      slaBreached(
        { slaDueAt: due, acknowledgedAt: new Date('2026-09-07T11:30:00Z'), resolvedAt: null },
        new Date('2026-09-08T00:00:00Z'),
      ),
    ).toBe(true);
  });
});
