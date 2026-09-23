import { useState } from 'react';
import { format, messages } from '@vakhta/i18n';
import {
  EmployeeStatusSchema,
  type EmployeeView,
  type OrgSnapshot,
  type OrgUnitView,
} from '@vakhta/contracts';
import { Building2Icon, ChevronRightIcon, FolderTreeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EmptyState, Muted, StatusPill } from '@/components/app/page';
import { QueryFeedback, type QueryFeedbackState } from '@/components/app/query-feedback';
import { EmployeeProfileLink } from '@/entities/employee';
import { TableSearch } from '@/shared/ui/table-search';
import { currentLocale } from '@/i18n';
import {
  buildOrgTree,
  countOrgTree,
  filterOrgTree,
  type SiteNode,
  type TreeEmployee,
  type UnitNode,
} from '../model/unit-tree';

const all = messages(currentLocale());
const d = all.admin.administration.directories;
const statuses = all.admin.administration.employees.statuses;
const profileText = all.employeeProfile;
const unitShiftsText = all.unitShifts;
const common = all.ui.common;

const TRIGGER_CLASS =
  'group flex min-w-0 items-center gap-1.5 rounded-md text-left font-medium hover:text-primary active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
/** Points right while the branch is closed and down once it is open, like a file tree. */
const CHEVRON_CLASS =
  'size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]:rotate-90';
const BRANCH_CLASS = 'ml-2 flex flex-col gap-2 border-l border-border pl-4 pt-2';

function EmployeeLeaf({ employee }: { readonly employee: TreeEmployee }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <EmployeeProfileLink
        id={employee.id}
        name={employee.fullName}
        avatarVersion={employee.avatarVersion}
      />
      <Muted className="tabular-nums">{employee.personnelNumber}</Muted>
      {employee.status === EmployeeStatusSchema.enum.BLOCKED && (
        <StatusPill tone="caution">{statuses[employee.status]}</StatusPill>
      )}
    </li>
  );
}

function UnitBranch({
  node,
  onOpenUnit,
}: {
  readonly node: UnitNode;
  readonly onOpenUnit: (unit: OrgUnitView) => void;
}) {
  const master = node.unit.designatedMaster?.name ?? profileText.missingMaster;
  const empty = node.children.length === 0 && node.employees.length === 0;
  return (
    <li>
      <Collapsible defaultOpen>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CollapsibleTrigger asChild>
            <button type="button" className={TRIGGER_CLASS}>
              <ChevronRightIcon aria-hidden="true" className={CHEVRON_CLASS} />
              <FolderTreeIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">{node.unit.name}</span>
            </button>
          </CollapsibleTrigger>
          <Muted className="text-xs tabular-nums">
            {format(d.treeEmployees, { n: node.headcount })}
          </Muted>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>
              {d.unitMaster}: <span className="text-foreground">{master}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`${unitShiftsText.openUnit}: ${node.unit.name}`}
              onClick={() => onOpenUnit(node.unit)}
            >
              {unitShiftsText.openUnit}
            </Button>
          </span>
        </div>
        <CollapsibleContent>
          <ul className={BRANCH_CLASS}>
            {node.children.map((child) => (
              <UnitBranch key={child.unit.id} node={child} onOpenUnit={onOpenUnit} />
            ))}
            {node.employees.map((employee) => (
              <EmployeeLeaf key={employee.id} employee={employee} />
            ))}
            {empty && (
              <li>
                <Muted className="text-sm">{d.treeNoEmployees}</Muted>
              </li>
            )}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function SiteBranch({
  node,
  onOpenUnit,
}: {
  readonly node: SiteNode;
  readonly onOpenUnit: (unit: OrgUnitView) => void;
}) {
  return (
    <li>
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button type="button" className={TRIGGER_CLASS}>
            <ChevronRightIcon aria-hidden="true" className={CHEVRON_CLASS} />
            <Building2Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{node.site.name}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className={BRANCH_CLASS}>
            {node.units.map((unit) => (
              <UnitBranch key={unit.unit.id} node={unit} onOpenUnit={onOpenUnit} />
            ))}
            {node.units.length === 0 && (
              <li>
                <Muted className="text-sm">{d.treeNoUnits}</Muted>
              </li>
            )}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/**
 * Sites → units → people as a collapsible tree. The roster arrives separately from the org
 * snapshot, so the tree waits for it and shows the shared query feedback until then.
 */
export function OrgTree({
  org,
  employees,
  roster,
  onOpenUnit,
}: {
  readonly org: Pick<OrgSnapshot, 'sites' | 'orgUnits'>;
  readonly employees: readonly EmployeeView[] | undefined;
  readonly roster: QueryFeedbackState;
  readonly onOpenUnit: (unit: OrgUnitView) => void;
}) {
  const [query, setQuery] = useState('');
  const tree = employees
    ? filterOrgTree(buildOrgTree({ org, employees, locale: currentLocale() }), query)
    : null;
  const totals = tree ? countOrgTree(tree) : null;
  return (
    <div className="flex flex-col gap-3">
      <TableSearch
        value={query}
        onChange={setQuery}
        label={common.search}
        placeholder={common.searchPlaceholder}
      />
      <QueryFeedback query={roster} />
      {tree?.length === 0 && <EmptyState text={common.noResults} />}
      {tree && tree.length > 0 && (
        // Keyed by the query so a branch collapsed by hand reopens when the search changes.
        <ul key={query} className="flex flex-col gap-3">
          {tree.map((site) => (
            <SiteBranch key={site.site.id} node={site} onOpenUnit={onOpenUnit} />
          ))}
        </ul>
      )}
      {totals && (
        <p className="text-sm text-muted-foreground tabular-nums" role="status">
          {d.orgUnits}: {totals.units} · {format(d.treeEmployees, { n: totals.employees })}
        </p>
      )}
    </div>
  );
}
