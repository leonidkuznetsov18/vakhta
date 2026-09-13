/** A personal DOWNTIME activity interval as recorded; `endedAt` null while it lasts. */
export interface DowntimeInterval {
  readonly employeeId: string;
  readonly zoneId: string | null;
  readonly reasonCode: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

export interface DowntimeSnapshot {
  /** Minutes zones stood: overlapping intervals in one zone are merged (spec 004 D-05). */
  readonly zoneMinutes: number;
  /** Sum of personal intervals; larger than zone minutes when several people stood together. */
  readonly personMinutes: number;
  readonly byZone: readonly { readonly zoneId: string | null; readonly minutes: number }[];
  readonly topReason: { readonly code: string; readonly minutes: number } | null;
}

type Span = readonly [number, number];

function merged(spans: readonly Span[]): number {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const [s, e] of sorted) {
    if (!current || s > current[1]) {
      if (current) total += current[1] - current[0];
      current = [s, e];
    } else current[1] = Math.max(current[1], e);
  }
  if (current) total += current[1] - current[0];
  return total;
}

const minutes = (ms: number) => Math.round(ms / 60_000);

/**
 * Downtime of a window clipped to [from, now]. An interval without a zone cannot be merged with
 * anyone else's, so it stands for itself. Reasons rank by merged minutes of the same reason.
 */
export function downtimeSnapshot(
  intervals: readonly DowntimeInterval[],
  from: Date,
  now: Date,
): DowntimeSnapshot {
  const lo = from.getTime();
  const hi = now.getTime();
  const clipped = intervals.flatMap((i) => {
    const s = Math.max(lo, i.startedAt.getTime());
    const e = Math.min(hi, (i.endedAt ?? now).getTime());
    return e > s ? [{ ...i, span: [s, e] as Span }] : [];
  });
  const group = (key: (i: (typeof clipped)[number]) => string) => {
    const map = new Map<string, Span[]>();
    for (const i of clipped) map.set(key(i), [...(map.get(key(i)) ?? []), i.span]);
    return map;
  };
  const place = (i: (typeof clipped)[number]) => i.zoneId ?? `person:${i.employeeId}`;
  const zones = group(place);
  const byZoneMap = new Map<string | null, number>();
  let zoneMs = 0;
  for (const [key, spans] of zones) {
    const ms = merged(spans);
    zoneMs += ms;
    const zoneId = key.startsWith('person:') ? null : key;
    byZoneMap.set(zoneId, (byZoneMap.get(zoneId) ?? 0) + ms);
  }
  const reasons = new Map<string, number>();
  for (const [key, spans] of group((i) => `${i.reasonCode ?? 'UNKNOWN'}|${place(i)}`)) {
    const code = key.slice(0, key.indexOf('|'));
    reasons.set(code, (reasons.get(code) ?? 0) + merged(spans));
  }
  const top = [...reasons].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return {
    zoneMinutes: minutes(zoneMs),
    personMinutes: minutes(clipped.reduce((s, i) => s + (i.span[1] - i.span[0]), 0)),
    byZone: [...byZoneMap]
      .map(([zoneId, ms]) => ({ zoneId, minutes: minutes(ms) }))
      .sort((a, b) => b.minutes - a.minutes),
    topReason: top ? { code: top[0], minutes: minutes(top[1]) } : null,
  };
}
