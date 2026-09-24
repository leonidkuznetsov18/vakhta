import {
  EmployeeStatusSchema,
  type EmployeeView,
  type OrgSnapshot,
  type OrgUnitView,
} from '@vakhta/contracts';
import type { Locale } from '@vakhta/domain';
import { buildOrgTree, type SiteNode, type UnitNode } from './unit-tree';

/** One person as the workspace lists them: where they sit and what they do there. */
export interface WorkspacePerson {
  readonly id: string;
  readonly fullName: string;
  readonly personnelNumber: string;
  readonly status: EmployeeView['status'];
  readonly avatarVersion: string | null;
  /** When the card was created: how long a person has waited for a placement. */
  readonly createdAt: string;
  readonly unitId: string | null;
  readonly positionId: string | null;
  readonly positionName: string | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
}

/**
 * Why a unit asks for the administrator's attention. Every state is derived from the org
 * snapshot and the roster alone; a rule that needs another read is not on this list.
 */
export const UnitAttention = {
  /** No designated shift master. */
  NO_MASTER: 'NO_MASTER',
  /** The designated master is blocked or terminated. */
  MASTER_INACTIVE: 'MASTER_INACTIVE',
  /** The designated master's current position is in another unit. */
  MASTER_ELSEWHERE: 'MASTER_ELSEWHERE',
  /** Nobody's current position is in the unit or below it. */
  NO_EMPLOYEES: 'NO_EMPLOYEES',
} as const;
export type UnitAttention = (typeof UnitAttention)[keyof typeof UnitAttention];

export const MasterState = {
  MISSING: 'MISSING',
  ASSIGNED: 'ASSIGNED',
  INACTIVE: 'INACTIVE',
  ELSEWHERE: 'ELSEWHERE',
} as const;
export type MasterState = (typeof MasterState)[keyof typeof MasterState];

export type MasterInfo =
  | { readonly state: typeof MasterState.MISSING }
  | {
      readonly state: Exclude<MasterState, typeof MasterState.MISSING>;
      readonly id: string;
      readonly name: string;
      readonly status: EmployeeView['status'];
      /** Name of the unit the master actually works in, when it is another one. */
      readonly worksIn: string | null;
    };

export interface WorkspaceUnit {
  readonly unit: OrgUnitView;
  readonly siteName: string;
  readonly parentName: string | null;
  /** Nesting level under the site: roots are 0. */
  readonly depth: number;
  readonly childIds: readonly string[];
  readonly people: readonly WorkspacePerson[];
  /** People of this unit and every unit below it. */
  readonly headcount: number;
  readonly master: MasterInfo;
  readonly attention: readonly UnitAttention[];
  readonly teams: readonly { readonly id: string; readonly name: string }[];
  readonly zones: number;
}

export interface WorkspaceTotals {
  readonly units: number;
  readonly employees: number;
  readonly unassigned: number;
  readonly withoutMaster: number;
  readonly needingAttention: number;
}

export interface Workspace {
  /** Units in reading order: site by site, parents before children. */
  readonly units: readonly WorkspaceUnit[];
  readonly unassigned: readonly WorkspacePerson[];
  readonly totals: WorkspaceTotals;
}

export interface WorkspaceInput {
  readonly org: Pick<OrgSnapshot, 'sites' | 'orgUnits' | 'positions' | 'teams' | 'zones'>;
  readonly employees: readonly EmployeeView[];
  readonly locale: Locale;
}

type Named = { readonly id: string; readonly name: string };

function nameIndex(rows: readonly Named[]) {
  return new Map(rows.map((row) => [row.id, row.name]));
}

interface Names {
  readonly positions: ReadonlyMap<string, string>;
  readonly teams: ReadonlyMap<string, string>;
}

type Placement = Pick<
  WorkspacePerson,
  'unitId' | 'positionId' | 'positionName' | 'teamId' | 'teamName'
>;

const NOWHERE: Placement = {
  unitId: null,
  positionId: null,
  positionName: null,
  teamId: null,
  teamName: null,
};

function placementOf(position: EmployeeView['currentPosition'], names: Names): Placement {
  if (!position) return NOWHERE;
  return {
    unitId: position.orgUnitId,
    positionId: position.positionId,
    positionName: names.positions.get(position.positionId) ?? null,
    teamId: position.teamId,
    teamName: position.teamId === null ? null : (names.teams.get(position.teamId) ?? null),
  };
}

function toPerson(employee: EmployeeView, names: Names): WorkspacePerson {
  return {
    id: employee.id,
    fullName: employee.fullName,
    personnelNumber: employee.personnelNumber,
    status: employee.status,
    avatarVersion: employee.avatarVersion ?? null,
    createdAt: employee.createdAt,
    ...placementOf(employee.currentPosition, names),
  };
}

/** Roster minus the terminated, grouped by unit; the unassigned sit under `null`. */
function indexPeople(input: WorkspaceInput) {
  const names = { positions: nameIndex(input.org.positions), teams: nameIndex(input.org.teams) };
  const byUnit = new Map<string | null, WorkspacePerson[]>();
  for (const employee of input.employees) {
    if (employee.status === EmployeeStatusSchema.enum.TERMINATED) continue;
    const person = toPerson(employee, names);
    const group = byUnit.get(person.unitId) ?? [];
    group.push(person);
    byUnit.set(person.unitId, group);
  }
  const compare = (a: WorkspacePerson, b: WorkspacePerson) =>
    a.fullName.localeCompare(b.fullName, input.locale);
  for (const group of byUnit.values()) group.sort(compare);
  return byUnit;
}

function masterOf(
  unit: OrgUnitView,
  people: ReadonlyMap<string, WorkspacePerson>,
  unitNames: ReadonlyMap<string, string>,
): MasterInfo {
  const master = unit.designatedMaster;
  if (!master) return { state: MasterState.MISSING };
  const base = { id: master.id, name: master.name, status: master.status, worksIn: null };
  if (master.status !== EmployeeStatusSchema.enum.ACTIVE) {
    return { ...base, state: MasterState.INACTIVE };
  }
  const worksIn = people.get(master.id)?.unitId ?? null;
  if (worksIn && worksIn !== unit.id) {
    return { ...base, state: MasterState.ELSEWHERE, worksIn: unitNames.get(worksIn) ?? null };
  }
  return { ...base, state: MasterState.ASSIGNED };
}

function attentionOf(master: MasterInfo, headcount: number): UnitAttention[] {
  const list: UnitAttention[] = [];
  if (master.state === MasterState.MISSING) list.push(UnitAttention.NO_MASTER);
  if (master.state === MasterState.INACTIVE) list.push(UnitAttention.MASTER_INACTIVE);
  if (master.state === MasterState.ELSEWHERE) list.push(UnitAttention.MASTER_ELSEWHERE);
  if (headcount === 0) list.push(UnitAttention.NO_EMPLOYEES);
  return list;
}

interface Flattener {
  readonly input: WorkspaceInput;
  readonly people: ReadonlyMap<string | null, readonly WorkspacePerson[]>;
  readonly personById: ReadonlyMap<string, WorkspacePerson>;
  readonly unitNames: ReadonlyMap<string, string>;
  readonly teamsByUnit: ReadonlyMap<string, readonly Named[]>;
  readonly zonesByUnit: ReadonlyMap<string, number>;
  readonly out: WorkspaceUnit[];
}

interface Placing {
  readonly node: UnitNode;
  readonly site: SiteNode;
  readonly depth: number;
}

function flatten({ node, site, depth }: Placing, ctx: Flattener) {
  const unit = node.unit;
  const master = masterOf(unit, ctx.personById, ctx.unitNames);
  ctx.out.push({
    unit,
    siteName: site.site.name,
    parentName: unit.parentId ? (ctx.unitNames.get(unit.parentId) ?? null) : null,
    depth,
    childIds: node.children.map((child) => child.unit.id),
    people: ctx.people.get(unit.id) ?? [],
    headcount: node.headcount,
    master,
    attention: attentionOf(master, node.headcount),
    teams: ctx.teamsByUnit.get(unit.id) ?? [],
    zones: ctx.zonesByUnit.get(unit.id) ?? 0,
  });
  for (const child of node.children) flatten({ node: child, site, depth: depth + 1 }, ctx);
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row)) ?? [];
    group.push(row);
    groups.set(key(row), group);
  }
  return groups;
}

function countBy<T>(rows: readonly T[], key: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return counts;
}

/** Everything the units workspace shows, computed once from the two reads it depends on. */
export function buildWorkspace(input: WorkspaceInput): Workspace {
  const people = indexPeople(input);
  const personById = new Map<string, WorkspacePerson>();
  for (const group of people.values())
    for (const person of group) personById.set(person.id, person);
  const ctx: Flattener = {
    input,
    people,
    personById,
    unitNames: nameIndex(input.org.orgUnits),
    teamsByUnit: groupBy(input.org.teams, (team) => team.orgUnitId),
    zonesByUnit: countBy(input.org.zones, (zone) => zone.orgUnitId),
    out: [],
  };
  const tree = buildOrgTree({ org: input.org, employees: input.employees, locale: input.locale });
  for (const site of tree)
    for (const root of site.units) flatten({ node: root, site, depth: 0 }, ctx);
  const unassigned = people.get(null) ?? [];
  return {
    units: ctx.out,
    unassigned,
    totals: {
      units: ctx.out.length,
      employees: personById.size,
      unassigned: unassigned.length,
      withoutMaster: ctx.out.filter((row) => row.master.state === MasterState.MISSING).length,
      needingAttention: ctx.out.filter((row) => row.attention.length > 0).length,
    },
  };
}

/** Identifier of the pinned "no unit" row in the unit list. */
export const UNASSIGNED_KEY = 'unassigned';

function matches(text: string | null, needle: string) {
  return text?.toLocaleLowerCase().includes(needle) ?? false;
}

export interface PersonHit {
  readonly person: WorkspacePerson;
  readonly unitName: string | null;
}

/** People whose name or number match, with the unit they sit in, for the global search. */
export function searchPeople(workspace: Workspace, query: string): PersonHit[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const hits: PersonHit[] = [];
  const consider = (person: WorkspacePerson, unitName: string | null) => {
    if (matches(person.fullName, needle) || matches(person.personnelNumber, needle)) {
      hits.push({ person, unitName });
    }
  };
  for (const person of workspace.unassigned) consider(person, null);
  for (const row of workspace.units)
    for (const person of row.people) consider(person, row.unit.name);
  return hits;
}

/** Units whose name matches; a blank query keeps them all. */
export function searchUnits(units: readonly WorkspaceUnit[], query: string): WorkspaceUnit[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...units];
  return units.filter((row) => matches(row.unit.name, needle));
}
