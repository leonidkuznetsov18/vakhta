import { describe, expect, it } from 'vitest';
import { incidentNeedsReaction, incidentSla } from './sla';

const incident = {
  severity: 'NORMAL',
  status: 'REPORTED',
  openedAt: '2026-09-10T10:35:00Z',
  slaDueAt: '2026-09-10T11:35:00Z',
  acknowledgedAt: null,
  resolvedAt: null,
  slaBreached: false,
} as const;

describe('incident response SLA presentation', () => {
  it('keeps only unanswered open incidents on the live countdown', () => {
    expect(incidentSla(incident)).toEqual({ kind: 'pending' });
    expect(incidentNeedsReaction(incident)).toBe(false);
    expect(incidentNeedsReaction({ ...incident, slaBreached: true })).toBe(true);
  });

  it('shows the reported 13:35 to 14:04 resolution as on time regardless of the current date', () => {
    const resolved = {
      ...incident,
      status: 'RESOLVED' as const,
      resolvedAt: '2026-09-10T11:04:00Z',
    };
    expect(incidentSla(resolved)).toEqual({ kind: 'onTime', minutes: 29 });
    expect(incidentNeedsReaction(resolved)).toBe(false);
  });

  it('freezes at first acknowledgement even when repair finishes the next day or is reopened', () => {
    expect(
      incidentSla({
        ...incident,
        status: 'IN_PROGRESS',
        acknowledgedAt: '2026-09-10T11:00:00Z',
        resolvedAt: '2026-09-11T11:00:00Z',
      }),
    ).toEqual({ kind: 'onTime', minutes: 25 });
  });

  it('keeps late response duration fixed and removes the row from the unanswered queue', () => {
    const late = {
      ...incident,
      status: 'IN_PROGRESS' as const,
      acknowledgedAt: '2026-09-10T11:42:00Z',
      slaBreached: true,
    };
    expect(incidentSla(late)).toEqual({ kind: 'late', minutes: 7 });
    expect(incidentNeedsReaction(late)).toBe(false);
  });

  it('accepts a response exactly at the deadline', () => {
    expect(incidentSla({ ...incident, acknowledgedAt: incident.slaDueAt })).toEqual({
      kind: 'onTime',
      minutes: 60,
    });
  });

  it('distinguishes safety escalation from the normal deadline before and after response', () => {
    const safety = { ...incident, severity: 'SAFETY' as const, slaDueAt: incident.openedAt };
    expect(incidentSla(safety)).toEqual({ kind: 'immediate', reactionMinutes: null });
    expect(incidentNeedsReaction(safety)).toBe(true);
    expect(incidentSla({ ...safety, acknowledgedAt: '2026-09-10T10:37:00Z' })).toEqual({
      kind: 'immediate',
      reactionMinutes: 2,
    });
  });

  it.each(['REJECTED', 'DUPLICATE'] as const)(
    'does not keep timing an unanswered %s record',
    (status) => {
      const closed = { ...incident, status, slaBreached: true };
      expect(incidentSla(closed)).toEqual({ kind: 'notApplicable' });
      expect(incidentNeedsReaction(closed)).toBe(false);
    },
  );

  it('does not invent reaction times for legacy completed records', () => {
    expect(incidentSla({ ...incident, status: 'CLOSED' })).toEqual({ kind: 'unknown' });
  });
});
