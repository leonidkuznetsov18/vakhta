import { useQuery } from '@tanstack/react-query';
import type {
  MaintenanceOverview,
  MaintenanceOverviewMachine,
  MaintenanceOverviewWork,
  MeView,
} from '@vakhta/contracts';
import {
  MAINTENANCE_MANAGERS,
  MAINTENANCE_VIEWERS,
  OverviewWorkBucket,
  TenantModule,
  emergencyIsCritical,
} from '@vakhta/domain';
import type { StackedPerson } from '@/components/app/avatar-stack';
import { maintenanceQueries } from '@/entities/maintenance';
import { tenantConfig } from '@/shared/config/tenant';
import type { OverviewSelection } from './destination';

/** Equipment blocks follow the maintenance section: its roles, and only with the module on. */
export interface EquipmentAccess {
  readonly read: boolean;
  /** Reviewing finished maintenance is the chief mechanic's and administrator's queue. */
  readonly review: boolean;
}

function maintenanceModuleOn(): boolean {
  const modules = tenantConfig()?.modules;
  return !modules || modules.includes(TenantModule.MAINTENANCE);
}

export function equipmentAccess(me: MeView): EquipmentAccess {
  const roles = new Set<string>(me.roles.map((grant) => grant.role));
  const has = (allowed: readonly string[]) => allowed.some((role) => roles.has(role));
  const read = me.id !== '' && maintenanceModuleOn() && has(MAINTENANCE_VIEWERS);
  return { read, review: read && has(MAINTENANCE_MANAGERS) };
}

export function useEquipmentOverview(access: EquipmentAccess, selection: OverviewSelection) {
  const query = {
    ...(selection.siteId ? { siteId: selection.siteId } : {}),
    ...(selection.orgUnitId ? { orgUnitId: selection.orgUnitId } : {}),
  };
  return useQuery({ ...maintenanceQueries.overview(query), enabled: access.read });
}

export const EquipmentQueueKey = {
  EMERGENCY: 'maintenanceEmergency',
  OVERDUE: 'maintenanceOverdue',
  REVIEW: 'maintenanceReview',
  UPCOMING: 'maintenanceUpcoming',
} as const;
export type EquipmentQueueKey = (typeof EquipmentQueueKey)[keyof typeof EquipmentQueueKey];
const EQUIPMENT_QUEUE_KEYS: ReadonlySet<string> = new Set(Object.values(EquipmentQueueKey));

export function isEquipmentKey(key: string): key is EquipmentQueueKey {
  return EQUIPMENT_QUEUE_KEYS.has(key);
}

/** One card of equipment facts; the queue adds the shared fields. */
interface EquipmentCard {
  readonly key: EquipmentQueueKey;
  readonly tier: 'critical' | 'warning' | 'info';
  readonly works: readonly MaintenanceOverviewWork[];
  readonly oldestAt: string | null;
  readonly deadlineAt: string | null;
  /** Business date the card reads: the oldest due date or the nearest planned one. */
  readonly dayOn: string | null;
  readonly ageKind: 'waiting' | 'overdueSince' | 'nearestOn';
}

const earliest = (values: readonly (string | null)[]): string | null =>
  values.filter((v): v is string => v !== null).sort()[0] ?? null;

function inBucket(data: MaintenanceOverview, bucket: OverviewWorkBucket) {
  return data.works.filter((work) => work.bucket === bucket);
}

function emergencyCard(data: MaintenanceOverview, now: Date): EquipmentCard {
  const works = inBucket(data, OverviewWorkBucket.EMERGENCY);
  const waiting = works.filter((work) => !work.acceptedAt);
  return {
    key: EquipmentQueueKey.EMERGENCY,
    tier: works.some((work) => emergencyIsCritical(work, now)) ? 'critical' : 'warning',
    works: sortBy(works, (work) => work.reportedAt),
    oldestAt: earliest(works.map((work) => work.reportedAt)),
    deadlineAt: earliest(waiting.map((work) => work.ackDueAt)),
    dayOn: null,
    ageKind: 'waiting',
  };
}

function overdueCard(data: MaintenanceOverview): EquipmentCard {
  const works = sortBy(inBucket(data, OverviewWorkBucket.OVERDUE), (work) => work.dueOn);
  return {
    key: EquipmentQueueKey.OVERDUE,
    tier: 'warning',
    works,
    oldestAt: null,
    deadlineAt: null,
    dayOn: works[0]?.dueOn ?? null,
    ageKind: 'overdueSince',
  };
}

function reviewCard(data: MaintenanceOverview): EquipmentCard {
  const works = sortBy(inBucket(data, OverviewWorkBucket.REVIEW), (work) => work.submittedAt);
  return {
    key: EquipmentQueueKey.REVIEW,
    tier: 'info',
    works,
    oldestAt: works[0]?.submittedAt ?? null,
    deadlineAt: null,
    dayOn: null,
    ageKind: 'waiting',
  };
}

function upcomingCard(data: MaintenanceOverview): EquipmentCard {
  const works = sortBy(inBucket(data, OverviewWorkBucket.UPCOMING), (work) => work.plannedOn);
  return {
    key: EquipmentQueueKey.UPCOMING,
    tier: 'info',
    works,
    oldestAt: null,
    deadlineAt: null,
    dayOn: works[0]?.plannedOn ?? null,
    ageKind: 'nearestOn',
  };
}

function sortBy<T>(rows: readonly T[], value: (row: T) => string | null): T[] {
  return [...rows].sort((a, b) => (value(a) ?? '').localeCompare(value(b) ?? ''));
}

/** The equipment cards the reader may see, empty ones included so the queue can name them checked. */
export function equipmentCards(
  data: MaintenanceOverview,
  access: EquipmentAccess,
  now: Date,
): EquipmentCard[] {
  const cards = [emergencyCard(data, now), overdueCard(data)];
  if (access.review) cards.push(reviewCard(data));
  cards.push(upcomingCard(data));
  return cards;
}

export function equipmentCardKeys(access: EquipmentAccess): EquipmentQueueKey[] {
  if (!access.read) return [];
  const keys: EquipmentQueueKey[] = [EquipmentQueueKey.EMERGENCY, EquipmentQueueKey.OVERDUE];
  if (access.review) keys.push(EquipmentQueueKey.REVIEW);
  keys.push(EquipmentQueueKey.UPCOMING);
  return keys;
}

/** Machines behind the work of a card, each once, as the avatar stack shows them. */
export function machinesOf(works: readonly MaintenanceOverviewWork[]): StackedPerson[] {
  const seen = new Map<string, StackedPerson>();
  for (const work of works) {
    if (seen.has(work.equipment.id)) continue;
    seen.set(work.equipment.id, {
      id: work.equipment.id,
      name: `${work.equipment.code} ${work.equipment.name}`,
      seed: work.equipment.id,
      note: work.location,
    });
  }
  return [...seen.values()];
}

/** Facts of the "Equipment" tile: machines stopped now and maintenance planned for today. */
export interface EquipmentHealth {
  readonly stopped: readonly MaintenanceOverviewMachine[];
  readonly today: readonly MaintenanceOverviewWork[];
  readonly upcoming: number;
}

export function equipmentHealth(data: MaintenanceOverview): EquipmentHealth {
  return {
    stopped: data.stopped,
    today: sortBy(inBucket(data, OverviewWorkBucket.TODAY), (work) => work.equipment.code),
    upcoming: inBucket(data, OverviewWorkBucket.UPCOMING).length,
  };
}

/** Something to report without a running shift: a stopped machine or maintenance due today. */
export function equipmentHasFacts(health: EquipmentHealth): boolean {
  return health.stopped.length > 0 || health.today.length > 0;
}

/** Stopped machine names by zone, for the zone cards. */
export function stoppedByZone(data: MaintenanceOverview | undefined): Map<string, string[]> {
  const byZone = new Map<string, string[]>();
  for (const machine of data?.stopped ?? []) {
    if (!machine.zoneId) continue;
    const names = byZone.get(machine.zoneId) ?? [];
    names.push(`${machine.code} ${machine.name}`);
    byZone.set(machine.zoneId, names);
  }
  return byZone;
}
