export type ZoneStatus = 'DOWNTIME' | 'UNSTAFFED' | 'UNDERSTAFFED' | 'CLOSING' | 'WORKING' | 'IDLE';

export interface ZoneInput {
  readonly zoneId: string;
  /** People planned in this zone now (by assignment zone or current segment). */
  readonly planned: number;
  /** Open shifts in this zone, by FSM state. */
  readonly openStates: readonly string[];
  /** Start of the earliest open DOWNTIME interval in the zone. */
  readonly downtimeSince: Date | null;
}

export interface ZoneView {
  readonly zoneId: string;
  readonly status: ZoneStatus;
  readonly planned: number;
  readonly present: number;
  /** Since when the status holds, when known (downtime). */
  readonly since: Date | null;
}

const CLOSING = new Set(['CLEANING', 'HANDOVER', 'READY_TO_CLOSE']);
const RANK: Record<ZoneStatus, number> = {
  DOWNTIME: 0,
  UNSTAFFED: 1,
  UNDERSTAFFED: 2,
  CLOSING: 3,
  WORKING: 4,
  IDLE: 5,
};

/** Live state of one workplace (spec 004 US6); problems outrank normal work. */
export function zoneStatus(zone: ZoneInput): ZoneView {
  const present = zone.openStates.length;
  const status: ZoneStatus = zone.downtimeSince
    ? 'DOWNTIME'
    : zone.planned > 0 && present === 0
      ? 'UNSTAFFED'
      : present < zone.planned
        ? 'UNDERSTAFFED'
        : present > 0 && zone.openStates.every((s) => CLOSING.has(s))
          ? 'CLOSING'
          : present > 0
            ? 'WORKING'
            : 'IDLE';
  return {
    zoneId: zone.zoneId,
    status,
    planned: zone.planned,
    present,
    since: zone.downtimeSince,
  };
}

/** Problem zones first, then by longest downtime, then by staffing gap. */
export function sortZones(zones: readonly ZoneView[]): ZoneView[] {
  return [...zones].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.since?.getTime() ?? Infinity) - (b.since?.getTime() ?? Infinity) ||
      b.planned - b.present - (a.planned - a.present),
  );
}
