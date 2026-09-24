import { EmployeeStatusSchema, type EmployeeView, type OrgSnapshot } from '@vakhta/contracts';
import type { Locale } from '@vakhta/domain';
import {
  OrgUnitKind,
  RESPONSIBLE_SLOTS,
  ResponsibleSlot,
  type HistoryEntry,
  type OrgNodeView,
  type ResponsibleAssignment,
} from './org-node';
import { buildOrgTree, type SiteNode, type UnitNode } from './unit-tree';

/** One person as the workspace lists them: where they sit, what they do there, who answers for them. */
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
  /** The head of the person's node unless the placement overrides it. */
  readonly managerName: string | null;
}

/**
 * Why a node asks for the administrator's attention. Every state is derived from the org
 * snapshot and the roster alone; a rule that needs another read is not on this list.
 */
export const UnitAttention = {
  NO_HEAD: 'NO_HEAD',
  NO_SHIFT_MASTER: 'NO_SHIFT_MASTER',
  RESPONSIBLE_INACTIVE: 'RESPONSIBLE_INACTIVE',
  RESPONSIBLE_ELSEWHERE: 'RESPONSIBLE_ELSEWHERE',
  NO_EMPLOYEES: 'NO_EMPLOYEES',
} as const;
export type UnitAttention = (typeof UnitAttention)[keyof typeof UnitAttention];

export const MasterState = {
  MISSING: 'MISSING',
  ASSIGNED: 'ASSIGNED',
  INACTIVE: 'INACTIVE',
  /** The person's placement is neither in this node nor below it. */
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
      readonly worksIn: string | null;
      readonly since: string;
    };

export interface ResponsibleInfo {
  readonly slot: ResponsibleSlot;
  readonly info: MasterInfo;
  /** Name of the ancestor whose shift master answers here because this node names none. */
  readonly inheritedFrom: string | null;
}

export interface WorkspaceUnit {
  readonly unit: OrgNodeView;
  readonly siteName: string;
  readonly parentName: string | null;
  /** Names from the site's root down to this node, for the breadcrumb. */
  readonly path: readonly { readonly id: string; readonly name: string }[];
  /** Nesting level under the site: roots are 0. */
  readonly depth: number;
  readonly childIds: readonly string[];
  readonly people: readonly WorkspacePerson[];
  /** People of this node and every node below it. */
  readonly headcount: number;
  readonly responsibles: readonly ResponsibleInfo[];
  readonly attention: readonly UnitAttention[];
  readonly teams: readonly { readonly id: string; readonly name: string }[];
  readonly zones: number;
  readonly history: readonly HistoryEntry[];
}

export interface WorkspaceTotals {
  readonly units: number;
  readonly employees: number;
  readonly unassigned: number;
  readonly needingAttention: number;
}

export interface Workspace {
  /** Nodes in reading order: site by site, parents before children. */
  readonly units: readonly WorkspaceUnit[];
  readonly unassigned: readonly WorkspacePerson[];
  readonly totals: WorkspaceTotals;
}

export interface WorkspaceOrg extends Pick<OrgSnapshot, 'sites' | 'positions' | 'teams' | 'zones'> {
  readonly orgUnits: readonly OrgNodeView[];
  readonly responsibles: readonly ResponsibleAssignment[];
  readonly history: readonly HistoryEntry[];
}

export interface WorkspaceInput {
  readonly org: WorkspaceOrg;
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
    managerName: null,
    ...placementOf(employee.currentPosition, names),
  };
}

/** Roster minus the terminated, grouped by node; the unassigned sit under `null`. */
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

interface SlotLookup {
  /** Every employee, terminated included: a slot may still point at one. */
  readonly employees: ReadonlyMap<string, EmployeeView>;
  readonly people: ReadonlyMap<string, WorkspacePerson>;
  readonly unitNames: ReadonlyMap<string, string>;
  readonly assignments: ReadonlyMap<string, ResponsibleAssignment>;
}

function slotKey(unitId: string, slot: ResponsibleSlot) {
  return `${unitId}:${slot}`;
}

interface SlotQuery {
  readonly unitId: string;
  readonly slot: ResponsibleSlot;
  /** The node and everything below it: a responsible placed there is not "elsewhere". */
  readonly subtree: ReadonlySet<string>;
}

function responsibleOf({ unitId, slot, subtree }: SlotQuery, lookup: SlotLookup): MasterInfo {
  const assignment = lookup.assignments.get(slotKey(unitId, slot));
  const employee = assignment ? lookup.employees.get(assignment.employeeId) : undefined;
  if (!assignment || !employee) return { state: MasterState.MISSING };
  const base = {
    id: employee.id,
    name: employee.fullName,
    status: employee.status,
    worksIn: null,
    since: assignment.validFrom,
  };
  if (employee.status !== EmployeeStatusSchema.enum.ACTIVE) {
    return { ...base, state: MasterState.INACTIVE };
  }
  const worksIn = lookup.people.get(employee.id)?.unitId ?? null;
  if (worksIn && !subtree.has(worksIn)) {
    return {
      ...base,
      state: MasterState.ELSEWHERE,
      worksIn: lookup.unitNames.get(worksIn) ?? null,
    };
  }
  return { ...base, state: MasterState.ASSIGNED };
}

function attentionOf(responsibles: readonly ResponsibleInfo[], headcount: number): UnitAttention[] {
  const list: UnitAttention[] = [];
  const missing = (slot: ResponsibleSlot) =>
    responsibles.some((row) => row.slot === slot && row.info.state === MasterState.MISSING);
  if (missing(ResponsibleSlot.HEAD)) list.push(UnitAttention.NO_HEAD);
  // A division has no shift-master rows at all, so it never asks for them.
  if (missing(ResponsibleSlot.SHIFT_MASTER_DAY) || missing(ResponsibleSlot.SHIFT_MASTER_NIGHT)) {
    list.push(UnitAttention.NO_SHIFT_MASTER);
  }
  if (responsibles.some((row) => row.info.state === MasterState.INACTIVE)) {
    list.push(UnitAttention.RESPONSIBLE_INACTIVE);
  }
  if (responsibles.some((row) => row.info.state === MasterState.ELSEWHERE)) {
    list.push(UnitAttention.RESPONSIBLE_ELSEWHERE);
  }
  if (headcount === 0) list.push(UnitAttention.NO_EMPLOYEES);
  return list;
}

function subtreeIds(node: UnitNode, into: Set<string>): Set<string> {
  into.add(node.unit.id);
  for (const child of node.children) subtreeIds(child, into);
  return into;
}

interface Flattener {
  readonly people: ReadonlyMap<string | null, readonly WorkspacePerson[]>;
  readonly lookup: SlotLookup;
  readonly nodes: ReadonlyMap<string, OrgNodeView>;
  readonly teamsByUnit: ReadonlyMap<string, readonly Named[]>;
  readonly zonesByUnit: ReadonlyMap<string, number>;
  readonly historyByUnit: ReadonlyMap<string, readonly HistoryEntry[]>;
  readonly out: WorkspaceUnit[];
}

interface Placing {
  readonly node: UnitNode;
  readonly site: SiteNode;
  readonly path: readonly Named[];
  readonly inherited: ReadonlyMap<ResponsibleSlot, ResponsibleInfo>;
}

/** Shift masters exist where shifts are worked: shops and sections, never a division. */
function slotsOf(kind: OrgUnitKind): readonly ResponsibleSlot[] {
  return kind === OrgUnitKind.DIVISION ? [ResponsibleSlot.HEAD] : RESPONSIBLE_SLOTS;
}

/**
 * A node's own responsible for each slot; a shift-master slot the node leaves empty is answered
 * by the nearest ancestor that fills it, the way scope inheritance works (spec 014, A4).
 */
function responsiblesOf(
  { node, kind, inherited }: Pick<Placing, 'node' | 'inherited'> & { readonly kind: OrgUnitKind },
  lookup: SlotLookup,
): ResponsibleInfo[] {
  const subtree = subtreeIds(node, new Set());
  return slotsOf(kind).map((slot) => {
    const own = responsibleOf({ unitId: node.unit.id, slot, subtree }, lookup);
    const fallback = inherited.get(slot);
    if (own.state === MasterState.MISSING && slot !== ResponsibleSlot.HEAD && fallback) {
      return fallback;
    }
    return { slot, info: own, inheritedFrom: null };
  });
}

/** What the children inherit: every filled shift-master slot, credited to this node. */
function inheritable(
  responsibles: readonly ResponsibleInfo[],
  nodeName: string,
): Map<ResponsibleSlot, ResponsibleInfo> {
  const map = new Map<ResponsibleSlot, ResponsibleInfo>();
  for (const row of responsibles) {
    if (row.slot === ResponsibleSlot.HEAD || row.info.state === MasterState.MISSING) continue;
    map.set(row.slot, { ...row, inheritedFrom: row.inheritedFrom ?? nodeName });
  }
  return map;
}

function headNameOf(responsibles: readonly ResponsibleInfo[]): string | null {
  const head = responsibles.find((row) => row.slot === ResponsibleSlot.HEAD)?.info;
  if (!head || head.state === MasterState.MISSING) return null;
  return head.name;
}

/** The node's people with their manager filled in: the head, unless the placement names one. */
function peopleOf(unitId: string, headName: string | null, ctx: Flattener): WorkspacePerson[] {
  return (ctx.people.get(unitId) ?? []).map((person) => ({
    ...person,
    managerName: person.managerName ?? headName,
  }));
}

function flatten({ node, site, path, inherited }: Placing, ctx: Flattener) {
  const unit = ctx.nodes.get(node.unit.id);
  if (!unit) return;
  const responsibles = responsiblesOf({ node, kind: unit.kind, inherited }, ctx.lookup);
  const people = peopleOf(unit.id, headNameOf(responsibles), ctx);
  const nextPath = [...path, { id: unit.id, name: unit.name }];
  ctx.out.push({
    unit,
    siteName: site.site.name,
    parentName: path.at(-1)?.name ?? null,
    path: nextPath,
    depth: path.length,
    childIds: node.children.map((child) => child.unit.id),
    people,
    headcount: node.headcount,
    responsibles,
    attention: attentionOf(responsibles, node.headcount),
    teams: ctx.teamsByUnit.get(unit.id) ?? [],
    zones: ctx.zonesByUnit.get(unit.id) ?? 0,
    history: ctx.historyByUnit.get(unit.id) ?? [],
  });
  const passDown = inheritable(responsibles, unit.name);
  for (const child of node.children) {
    flatten({ node: child, site, path: nextPath, inherited: passDown }, ctx);
  }
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

/** Everything the structure section shows, computed once from the two reads it depends on. */
export function buildWorkspace(input: WorkspaceInput): Workspace {
  const people = indexPeople(input);
  const personById = new Map<string, WorkspacePerson>();
  for (const group of people.values())
    for (const person of group) personById.set(person.id, person);
  const live = input.org.orgUnits.filter((unit) => unit.archivedAt === null);
  const ctx: Flattener = {
    people,
    lookup: {
      employees: new Map(input.employees.map((employee) => [employee.id, employee])),
      people: personById,
      unitNames: nameIndex(input.org.orgUnits),
      assignments: new Map(
        input.org.responsibles.map((row) => [slotKey(row.unitId, row.slot), row]),
      ),
    },
    nodes: new Map(live.map((unit) => [unit.id, unit])),
    teamsByUnit: groupBy(input.org.teams, (team) => team.orgUnitId),
    zonesByUnit: countBy(input.org.zones, (zone) => zone.orgUnitId),
    historyByUnit: groupBy(input.org.history, (entry) => entry.unitId),
    out: [],
  };
  const tree = buildOrgTree({
    org: { sites: input.org.sites, orgUnits: live },
    employees: input.employees,
    locale: input.locale,
  });
  for (const site of tree) {
    for (const root of site.units) {
      flatten({ node: root, site, path: [], inherited: new Map() }, ctx);
    }
  }
  const unassigned = people.get(null) ?? [];
  return {
    units: ctx.out,
    unassigned,
    totals: {
      units: ctx.out.length,
      employees: personById.size,
      unassigned: unassigned.length,
      needingAttention: ctx.out.filter((row) => row.attention.length > 0).length,
    },
  };
}

/** Identifier of the pinned "no node" row in the tree. */
export const UNASSIGNED_KEY = 'unassigned';

function matches(text: string | null, needle: string) {
  return text?.toLocaleLowerCase().includes(needle) ?? false;
}

export interface PersonHit {
  readonly person: WorkspacePerson;
  readonly unitName: string | null;
}

/** People whose name or number match, with the node they sit in, for the global search. */
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

/** Nodes whose name matches, together with their ancestors so the tree keeps its shape. */
export function searchUnits(units: readonly WorkspaceUnit[], query: string): WorkspaceUnit[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...units];
  const keep = new Set<string>();
  for (const row of units) {
    if (!matches(row.unit.name, needle)) continue;
    for (const step of row.path) keep.add(step.id);
  }
  return units.filter((row) => keep.has(row.unit.id));
}

/** Rows visible after collapsing: a collapsed node hides everything below it. */
export function visibleUnits(
  units: readonly WorkspaceUnit[],
  collapsed: ReadonlySet<string>,
): WorkspaceUnit[] {
  const out: WorkspaceUnit[] = [];
  let hiddenBelow: number | null = null;
  for (const row of units) {
    if (hiddenBelow !== null && row.depth > hiddenBelow) continue;
    hiddenBelow = collapsed.has(row.unit.id) ? row.depth : null;
    out.push(row);
  }
  return out;
}
