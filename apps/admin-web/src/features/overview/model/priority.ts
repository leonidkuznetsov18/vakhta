import type { OverviewSnapshot } from '@vakhta/contracts';
import type { StackedPerson } from '@/components/app/avatar-stack';
import type { Attention } from './attention';
import type { AttentionKey } from './destination';

export type Tier = 'critical' | 'warning' | 'info';
export const TIERS: readonly Tier[] = ['critical', 'warning', 'info'];

/** Queue entries: attention list counters plus facts of the current-shift snapshot. */
export type QueueKey =
  | Extract<
      AttentionKey,
      | 'slaBreached'
      | 'safetyIncidents'
      | 'openIncidents'
      | 'pendingHandovers'
      | 'overdueRequests'
      | 'closedNoChecklist'
      | 'requestsForMe'
      | 'overtimePending'
    >
  | 'terminalsOffline'
  | 'longDowntime'
  | 'notArrived';

export interface QueueItem {
  readonly key: QueueKey;
  readonly tier: Tier;
  readonly count: number;
  /** Since when the oldest record waits (age); null when the source has no such instant. */
  readonly oldestAt: string | null;
  /** The nearest deadline; before it the row says "due in", after it "overdue by". */
  readonly deadlineAt: string | null;
  readonly people: readonly StackedPerson[];
  /** Kind of the age line, when the age means something more specific than "waiting". */
  readonly ageKind: 'waiting' | 'plannedFrom' | 'lastSeen';
}

export interface ActionQueue {
  readonly items: readonly QueueItem[];
  /** Sources that loaded and hold nothing to do. */
  readonly checked: readonly QueueKey[];
  /** Sources the reader may read but whose data is missing (loading failed or paused). */
  readonly unknown: readonly QueueKey[];
}

/** Which attention sources the reader's roles request (mirrors `attentionPermissions`). */
export interface QueuePermissions {
  readonly shifts: boolean;
  readonly incidents: boolean;
  readonly handovers: boolean;
  readonly requests: boolean;
  readonly overtime: boolean;
}

const ATTENTION_RULES: readonly {
  readonly key: Extract<QueueKey, AttentionKey>;
  readonly tier: Tier;
  readonly source: keyof QueuePermissions;
}[] = [
  { key: 'slaBreached', tier: 'critical', source: 'incidents' },
  { key: 'safetyIncidents', tier: 'critical', source: 'incidents' },
  { key: 'openIncidents', tier: 'warning', source: 'incidents' },
  { key: 'pendingHandovers', tier: 'warning', source: 'handovers' },
  { key: 'overdueRequests', tier: 'warning', source: 'requests' },
  { key: 'closedNoChecklist', tier: 'warning', source: 'shifts' },
  { key: 'requestsForMe', tier: 'info', source: 'requests' },
  { key: 'overtimePending', tier: 'info', source: 'overtime' },
];

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);

/**
 * The prioritised action queue (spec 004 D-08, AC-009–AC-012): critical before attention before
 * information; inside a tier the nearest deadline, then the oldest waiting record. Zero items are
 * not rows; unknown sources are named so a failure is never read as "all clear".
 */
export function buildActionQueue(input: {
  readonly attention: Attention;
  readonly permissions: QueuePermissions;
  /** Undefined while the snapshot is loading or failed; null sections are not permitted. */
  readonly snapshot: OverviewSnapshot | undefined;
  readonly snapshotEnabled: boolean;
  readonly now: Date;
}): ActionQueue {
  const { attention, permissions, snapshot, now } = input;
  const items: QueueItem[] = [];
  const checked: QueueKey[] = [];
  const unknown: QueueKey[] = [];

  for (const rule of ATTENTION_RULES) {
    if (!permissions[rule.source]) continue;
    const count = attention[rule.key];
    if (count === null) unknown.push(rule.key);
    else if (count === 0) checked.push(rule.key);
    else
      items.push({
        key: rule.key,
        tier: rule.tier,
        count,
        oldestAt: attention.oldestAt[rule.key] ?? null,
        deadlineAt: attention.deadlineAt[rule.key] ?? null,
        people: attention.people[rule.key] ?? [],
        ageKind: 'waiting',
      });
  }

  if (input.snapshotEnabled && !snapshot)
    unknown.push('terminalsOffline', 'longDowntime', 'notArrived');
  if (snapshot?.terminals) {
    const offline = snapshot.terminals.filter((t) => t.connectivity === 'OFFLINE');
    if (offline.length === 0) checked.push('terminalsOffline');
    else
      items.push({
        key: 'terminalsOffline',
        tier: offline.some((t) => t.critical) ? 'critical' : 'warning',
        count: offline.length,
        oldestAt:
          offline
            .map((t) => t.lastSeenAt)
            .filter((v): v is string => v !== null)
            .sort((a, b) => time(a) - time(b))[0] ?? null,
        deadlineAt: null,
        people: offline.map((t) => ({ id: t.id, name: t.name, seed: t.id })),
        ageKind: 'lastSeen',
      });
  }
  if (snapshot?.zones) {
    const limit = now.getTime() - snapshot.downtimeEscalationMinutes * 60_000;
    const long = snapshot.zones.filter(
      (z) => z.status === 'DOWNTIME' && z.since !== null && time(z.since) <= limit,
    );
    if (long.length === 0) checked.push('longDowntime');
    else
      items.push({
        key: 'longDowntime',
        tier: 'critical',
        count: long.length,
        oldestAt: long.map((z) => z.since!).sort((a, b) => time(a) - time(b))[0] ?? null,
        deadlineAt: null,
        people: long.map((z) => ({
          id: z.zoneId,
          name: z.zoneName,
          seed: z.zoneId,
          note: z.orgUnitName,
        })),
        ageKind: 'waiting',
      });
  }
  if (snapshot?.staffing) {
    const s = snapshot.staffing;
    if (s.notArrived === 0) checked.push('notArrived');
    else
      items.push({
        key: 'notArrived',
        tier: 'warning',
        count: s.notArrived,
        oldestAt: s.oldestNotArrivedSince,
        deadlineAt: null,
        people: s.notArrivedPeople.map((p) => ({
          id: p.employeeId,
          name: p.fullName,
          seed: p.employeeId,
          ...(p.zoneName ? { note: p.zoneName } : {}),
        })),
        ageKind: 'plannedFrom',
      });
  }

  const rank = (tier: Tier) => TIERS.indexOf(tier);
  items.sort(
    (a, b) =>
      rank(a.tier) - rank(b.tier) ||
      time(a.deadlineAt) - time(b.deadlineAt) ||
      time(a.oldestAt) - time(b.oldestAt),
  );
  return { items, checked, unknown };
}

/** Setup and onboarding debt (spec 004 FR-005): never mixed with the live queue. */
export interface SetupItem {
  readonly key: 'unlinkedEmployees' | 'unpairedTerminals';
  readonly count: number;
}

export function setupItems(snapshot: OverviewSnapshot | undefined): readonly SetupItem[] {
  if (!snapshot?.setup) return [];
  return (
    [
      { key: 'unlinkedEmployees', count: snapshot.setup.unlinkedEmployees },
      { key: 'unpairedTerminals', count: snapshot.setup.unpairedTerminals },
    ] as const
  ).filter((item) => item.count > 0);
}

/** Which blocks a reader sees (spec 004 D-09): a block appears only when its sources are readable. */
export interface OverviewComposition {
  readonly queue: boolean;
  readonly health: boolean;
  readonly zones: boolean;
  readonly feed: boolean;
  readonly setup: boolean;
  /** Nothing operational is readable: show the shift context and links to the reader's sections. */
  readonly linksOnly: boolean;
}

export function composition(
  permissions: QueuePermissions,
  snapshot: OverviewSnapshot | undefined,
): OverviewComposition {
  const queue =
    Object.values(permissions).some(Boolean) || !!snapshot?.terminals || !!snapshot?.staffing;
  // A day off with nobody planned and nothing recorded has no health to report: hide the block
  // rather than four "nothing" tiles (owner, 2026-09-13). Recorded facts still show it.
  const shiftRuns = !!snapshot?.contexts.some(
    (ctx) => ctx.current?.staffed || ctx.closingPrevious?.staffed,
  );
  const facts =
    !!snapshot &&
    ((snapshot.staffing?.planned ?? 0) + (snapshot.staffing?.present ?? 0) > 0 ||
      (snapshot.timeToAction?.reported ?? 0) > 0 ||
      (snapshot.downtime?.zoneMinutes ?? 0) + (snapshot.downtime?.incidents ?? 0) > 0 ||
      (snapshot.handover?.decided ?? 0) + (snapshot.handover?.pending ?? 0) > 0);
  const health =
    !!snapshot &&
    [snapshot.staffing, snapshot.downtime, snapshot.timeToAction, snapshot.handover].some(
      (s) => s !== null,
    ) &&
    (shiftRuns || facts);
  const zones = !!snapshot?.zones?.some((z) => z.status !== 'IDLE');
  const feed = !!snapshot && (snapshot.timeToAction !== null || snapshot.handover !== null);
  const setup = !!snapshot?.setup;
  return { queue, health, zones, feed, setup, linksOnly: !!snapshot && !queue && !zones };
}
