import {
  EmployeeStatusSchema,
  type EmployeeView,
  type OrgSnapshot,
  type OrgUnitView,
  type SiteView,
} from '@vakhta/contracts';
import type { Locale } from '@vakhta/domain';

export interface TreeEmployee {
  readonly id: string;
  readonly fullName: string;
  readonly personnelNumber: string;
  readonly status: EmployeeView['status'];
  readonly avatarVersion: string | null;
}

export interface UnitNode {
  readonly unit: OrgUnitView;
  readonly children: readonly UnitNode[];
  /** People whose current position sits directly in this unit. */
  readonly employees: readonly TreeEmployee[];
  /** Employees of this unit and every unit below it. */
  readonly headcount: number;
}

export interface SiteNode {
  readonly site: SiteView;
  readonly units: readonly UnitNode[];
}

export interface OrgTreeInput {
  readonly org: Pick<OrgSnapshot, 'sites' | 'orgUnits'>;
  readonly employees: readonly EmployeeView[];
  readonly locale: Locale;
}

type Named = { readonly name: string };

function byName(locale: Locale) {
  return (a: Named, b: Named) => a.name.localeCompare(b.name, locale);
}

function headcountOf(nodes: readonly UnitNode[]): number {
  let total = 0;
  for (const node of nodes) total += node.headcount;
  return total;
}

function toTreeEmployee(employee: EmployeeView): TreeEmployee {
  return {
    id: employee.id,
    fullName: employee.fullName,
    personnelNumber: employee.personnelNumber,
    status: employee.status,
    avatarVersion: employee.avatarVersion ?? null,
  };
}

/** Roster grouped by the unit of the current position, each group sorted by name. */
function indexEmployees(employees: readonly EmployeeView[], locale: Locale) {
  const byUnit = new Map<string, TreeEmployee[]>();
  for (const employee of employees) {
    const unitId = employee.currentPosition?.orgUnitId;
    if (!unitId || employee.status === EmployeeStatusSchema.enum.TERMINATED) continue;
    const group = byUnit.get(unitId) ?? [];
    group.push(toTreeEmployee(employee));
    byUnit.set(unitId, group);
  }
  const compare = (a: TreeEmployee, b: TreeEmployee) =>
    a.fullName.localeCompare(b.fullName, locale);
  for (const group of byUnit.values()) group.sort(compare);
  return byUnit;
}

/**
 * A unit hangs under its parent only when that parent exists on the same site; otherwise it is a
 * root of its site, so a dangling reference never hides a unit from the picture.
 */
function parentKey(unit: OrgUnitView, units: ReadonlyMap<string, OrgUnitView>): string {
  const parent = unit.parentId ? units.get(unit.parentId) : undefined;
  if (parent?.siteId === unit.siteId) return parent.id;
  return `site:${unit.siteId}`;
}

function indexChildren(orgUnits: readonly OrgUnitView[], locale: Locale) {
  const units = new Map(orgUnits.map((unit) => [unit.id, unit]));
  const children = new Map<string, OrgUnitView[]>();
  for (const unit of orgUnits) {
    const key = parentKey(unit, units);
    const group = children.get(key) ?? [];
    group.push(unit);
    children.set(key, group);
  }
  const compare = byName(locale);
  for (const group of children.values()) group.sort(compare);
  return children;
}

interface Builder {
  readonly children: ReadonlyMap<string, readonly OrgUnitView[]>;
  readonly employees: ReadonlyMap<string, readonly TreeEmployee[]>;
  /** Units already placed; a parent cycle would otherwise recurse forever. */
  readonly placed: Set<string>;
}

function buildBranch(unit: OrgUnitView, builder: Builder): UnitNode {
  builder.placed.add(unit.id);
  const children = (builder.children.get(unit.id) ?? [])
    .filter((child) => !builder.placed.has(child.id))
    .map((child) => buildBranch(child, builder));
  const employees = builder.employees.get(unit.id) ?? [];
  return { unit, children, employees, headcount: employees.length + headcountOf(children) };
}

function buildRoots(key: string, builder: Builder): UnitNode[] {
  return (builder.children.get(key) ?? [])
    .filter((unit) => !builder.placed.has(unit.id))
    .map((unit) => buildBranch(unit, builder));
}

/** Sites, their unit hierarchy and the people in each unit, every level sorted by name. */
export function buildOrgTree({ org, employees, locale }: OrgTreeInput): SiteNode[] {
  const builder: Builder = {
    children: indexChildren(org.orgUnits, locale),
    employees: indexEmployees(employees, locale),
    placed: new Set(),
  };
  const sites = [...org.sites].sort(byName(locale));
  const roots = new Map(sites.map((site) => [site.id, buildRoots(`site:${site.id}`, builder)]));
  // Units left over after the site pass sit in a parent cycle: they become roots of their site.
  for (const unit of org.orgUnits) {
    if (builder.placed.has(unit.id)) continue;
    roots.get(unit.siteId)?.push(buildBranch(unit, builder));
  }
  return sites.map((site) => ({ site, units: roots.get(site.id) ?? [] }));
}

function matches(text: string, needle: string): boolean {
  return text.toLocaleLowerCase().includes(needle);
}

function matchesEmployee(employee: TreeEmployee, needle: string): boolean {
  return matches(employee.fullName, needle) || matches(employee.personnelNumber, needle);
}

/** A matching unit keeps everything under it; otherwise only matching people and branches stay. */
function filterUnit(node: UnitNode, needle: string): UnitNode | null {
  if (matches(node.unit.name, needle)) return node;
  const children = filterUnits(node.children, needle);
  const employees = node.employees.filter((employee) => matchesEmployee(employee, needle));
  if (children.length === 0 && employees.length === 0) return null;
  return { ...node, children, employees, headcount: employees.length + headcountOf(children) };
}

function filterUnits(nodes: readonly UnitNode[], needle: string): UnitNode[] {
  const kept: UnitNode[] = [];
  for (const node of nodes) {
    const filtered = filterUnit(node, needle);
    if (filtered) kept.push(filtered);
  }
  return kept;
}

/** Sites are kept while any of their units survive the search; a blank query returns the tree as is. */
export function filterOrgTree(tree: readonly SiteNode[], query: string): SiteNode[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...tree];
  return tree
    .map((site) => ({ site: site.site, units: filterUnits(site.units, needle) }))
    .filter((site) => site.units.length > 0);
}

export interface OrgTreeTotals {
  readonly units: number;
  readonly employees: number;
}

function countUnits(nodes: readonly UnitNode[]): number {
  let total = 0;
  for (const node of nodes) total += 1 + countUnits(node.children);
  return total;
}

/** Totals of what the tree shows, for the count line under it. */
export function countOrgTree(tree: readonly SiteNode[]): OrgTreeTotals {
  let units = 0;
  let employees = 0;
  for (const site of tree) {
    units += countUnits(site.units);
    employees += headcountOf(site.units);
  }
  return { units, employees };
}
