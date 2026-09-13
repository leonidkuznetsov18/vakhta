export interface IncidentReaction {
  readonly status: string;
  readonly openedAt: Date;
  readonly slaDueAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly resolvedAt: Date | null;
}

export interface TimeToActionSnapshot {
  readonly reported: number;
  readonly acknowledged: number;
  /** Median minutes from report to the master's reaction; null before the first reaction. */
  readonly medianMinutes: number | null;
  readonly slaMet: number;
  readonly slaMissed: number;
  /** Still open and not yet acknowledged: shown as running, never dropped from the picture. */
  readonly awaiting: number;
  readonly awaitingBreached: number;
}

const CLOSED_WITHOUT_REACTION = new Set(['DUPLICATE']);

/** Time to action for incidents reported in the window (spec 004 D-06). */
export function timeToAction(
  incidents: readonly IncidentReaction[],
  now: Date,
): TimeToActionSnapshot {
  const relevant = incidents.filter((i) => !CLOSED_WITHOUT_REACTION.has(i.status));
  // An incident resolved without an explicit acknowledgement was acted on at resolution.
  const reactedAt = (i: IncidentReaction) => i.acknowledgedAt ?? i.resolvedAt;
  const reacted = relevant.filter((i) => reactedAt(i) !== null);
  const durations = reacted
    .map((i) => (reactedAt(i)!.getTime() - i.openedAt.getTime()) / 60_000)
    .sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median =
    durations.length === 0
      ? null
      : durations.length % 2
        ? durations[mid]!
        : (durations[mid - 1]! + durations[mid]!) / 2;
  const waiting = relevant.filter((i) => reactedAt(i) === null && i.status !== 'REJECTED');
  return {
    reported: relevant.length,
    acknowledged: reacted.length,
    medianMinutes: median === null ? null : Math.round(median),
    slaMet: reacted.filter((i) => reactedAt(i)!.getTime() <= i.slaDueAt.getTime()).length,
    slaMissed:
      reacted.filter((i) => reactedAt(i)!.getTime() > i.slaDueAt.getTime()).length +
      waiting.filter((i) => now.getTime() > i.slaDueAt.getTime()).length,
    awaiting: waiting.length,
    awaitingBreached: waiting.filter((i) => now.getTime() > i.slaDueAt.getTime()).length,
  };
}
