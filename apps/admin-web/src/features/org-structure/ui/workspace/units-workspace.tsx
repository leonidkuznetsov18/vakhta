import { useState, type ReactNode } from 'react';
import type { EmployeeView } from '@vakhta/contracts';
import { ArrowLeftIcon, PlusIcon } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/app/page';
import { QueryFeedback, type QueryFeedbackState } from '@/components/app/query-feedback';
import { LoadingState } from '@/shared/ui/loading-state';
import { useIsMobile } from '@/hooks/use-mobile';
import { currentLocale } from '@/i18n';
import {
  UNASSIGNED_KEY,
  buildWorkspace,
  searchPeople,
  searchUnits,
  type PersonHit,
  type Workspace,
  type WorkspaceInput,
  type WorkspaceUnit,
} from '../../model/workspace';
import { UnitList } from './unit-list';
import { UnassignedDetail, UnitDetail, type DetailActions, type DetailDemo } from './unit-detail';
import { UnitFormDialog, type UnitDraft, type UnitFormPreset } from './unit-form-dialog';
import { PeopleHits, Summary, Toolbar, type ListFilter, type Scope } from './workspace-chrome';
import { fill, text } from './text';

export interface WorkspaceActions extends Omit<DetailActions, 'onSelect'> {
  readonly onCreate: (draft: UnitDraft) => void;
}

export interface WorkspaceDemo extends DetailDemo {
  readonly selectedKey?: string;
  readonly query?: string;
  readonly scope?: Scope;
  readonly createOpen?: boolean;
  readonly highlightId?: string;
}

function listEmptyText(filter: ListFilter, total: number, peopleFound: boolean) {
  if (total === 0) return text.list.noUnits;
  // A person's name matched: the empty unit list is not news, the hits above are.
  if (filter.query.trim()) return peopleFound ? '' : text.list.noneMatchSearch;
  if (filter.scope === 'attention') return text.list.noneMatch;
  return text.list.noUnits;
}

function filterUnits(units: readonly WorkspaceUnit[], filter: ListFilter) {
  const bySite = filter.siteId ? units.filter((row) => row.unit.siteId === filter.siteId) : units;
  const byScope =
    filter.scope === 'attention' ? bySite.filter((row) => row.attention.length > 0) : bySite;
  return searchUnits(byScope, filter.query);
}

interface Selection {
  readonly key: string | null;
  readonly highlightId: string | null;
}

interface DetailProps {
  readonly workspace: Workspace;
  readonly org: WorkspaceInput['org'];
  readonly selection: Selection;
  readonly editable: boolean;
  readonly actions: DetailActions;
  readonly demo: DetailDemo;
}

function Detail({ workspace, org, selection, editable, actions, demo }: DetailProps) {
  if (selection.key === UNASSIGNED_KEY) {
    return (
      <UnassignedDetail
        people={workspace.unassigned}
        units={workspace.units}
        positions={org.positions}
        editable={editable}
        highlightId={selection.highlightId}
        actions={actions}
        demo={demo}
      />
    );
  }
  const row = workspace.units.find((unit) => unit.unit.id === selection.key);
  if (!row) {
    const hint = workspace.units.length === 0 ? text.list.noUnitsHint : text.search.placeholder;
    return <EmptyState text={hint} />;
  }
  return (
    <UnitDetail
      row={row}
      units={workspace.units}
      people={[...workspace.unassigned, ...workspace.units.flatMap((unit) => unit.people)]}
      positions={org.positions}
      editable={editable}
      highlightId={selection.highlightId}
      actions={actions}
      demo={demo}
    />
  );
}

interface Props {
  readonly org: WorkspaceInput['org'];
  readonly employees: readonly EmployeeView[];
  readonly editable: boolean;
  readonly queryState: QueryFeedbackState;
  readonly actions: WorkspaceActions;
  readonly demo?: WorkspaceDemo;
}

/**
 * Administration → Units: the whole workforce structure on one screen. Left, every unit with its
 * headcount and master and the pinned pool of unplaced people; right, the selected one with the
 * actions that change it. Selection is the URL detail in production (`#/administration/units/<id>`).
 */
export function UnitsWorkspace(props: Props) {
  const { org, employees, queryState, demo = {} } = props;
  if (queryState.isPending && queryState.fetchStatus === 'fetching') {
    return <LoadingState label={text.states.loading} className="w-full py-16" />;
  }
  if (queryState.isError) return <QueryFeedback query={queryState} />;
  const workspace = buildWorkspace({ org, employees, locale: currentLocale() });
  return <Loaded {...props} workspace={workspace} demo={demo} />;
}

interface PaneProps {
  readonly workspace: Workspace;
  readonly org: WorkspaceInput['org'];
  readonly editable: boolean;
  readonly filter: ListFilter;
  readonly selection: Selection;
  readonly actions: DetailActions;
  readonly demo: WorkspaceDemo;
  readonly onSelect: (key: string) => void;
  readonly onPickHit: (hit: PersonHit) => void;
  readonly onBack: () => void;
  readonly createButton: ReactNode;
}

function ListPane(props: PaneProps) {
  const { workspace, org, filter } = props;
  const hits = searchPeople(workspace, filter.query);
  return (
    <aside className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-2 md:self-start">
      <PeopleHits hits={hits} onPick={props.onPickHit} />
      <UnitList
        units={filterUnits(workspace.units, filter)}
        unassignedCount={workspace.totals.unassigned}
        selectedKey={props.selection.key}
        onSelect={props.onSelect}
        emptyText={listEmptyText(filter, workspace.units.length, hits.length > 0)}
        groupBySite={org.sites.length > 1 && !filter.siteId}
      />
      {workspace.units.length === 0 && props.createButton}
    </aside>
  );
}

function DetailPane(props: PaneProps & { readonly isMobile: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
      {props.isMobile && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={props.onBack}
        >
          <ArrowLeftIcon aria-hidden="true" />
          {text.list.heading}
        </Button>
      )}
      <Detail
        workspace={props.workspace}
        org={props.org}
        selection={props.selection}
        editable={props.editable}
        actions={props.actions}
        demo={props.demo}
      />
    </section>
  );
}

/** On a phone the two panes become two screens: the list, then the selected unit with a way back. */
function Panes(props: PaneProps) {
  const isMobile = useIsMobile();
  const showList = !isMobile || props.selection.key === null;
  const showDetail = !isMobile || props.selection.key !== null;
  return (
    <div className={cn('grid gap-4', !isMobile && 'grid-cols-[minmax(260px,320px)_minmax(0,1fr)]')}>
      {showList && <ListPane {...props} />}
      {showDetail && <DetailPane {...props} isMobile={isMobile} />}
    </div>
  );
}

/** A unit deleted elsewhere leaves a stale key; the pane then shows nothing rather than a ghost. */
function knownSelection(workspace: Workspace, selection: Selection): Selection {
  if (selection.key === UNASSIGNED_KEY) return selection;
  const known = workspace.units.some((row) => row.unit.id === selection.key);
  return known ? selection : { key: null, highlightId: null };
}

function CreateButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button type="button" onClick={onClick}>
      <PlusIcon aria-hidden="true" />
      {text.unit.create}
    </Button>
  );
}

function Loaded({
  workspace,
  org,
  editable,
  actions,
  demo,
}: Props & { readonly workspace: Workspace; readonly demo: WorkspaceDemo }) {
  const [selection, setSelection] = useState<Selection>({
    key: demo.selectedKey ?? null,
    highlightId: demo.highlightId ?? null,
  });
  const [filter, setFilter] = useState<ListFilter>({
    query: demo.query ?? '',
    scope: demo.scope ?? 'all',
    siteId: '',
  });
  const [create, setCreate] = useState<UnitFormPreset | null>(demo.createOpen ? {} : null);

  const current = knownSelection(workspace, selection);
  const select = (key: string) => setSelection({ key, highlightId: null });
  const detailActions: DetailActions = {
    ...actions,
    onSelect: select,
    onAddChild: (row) => setCreate({ siteId: row.unit.siteId, parentId: row.unit.id }),
  };
  const createButton = editable ? <CreateButton onClick={() => setCreate({})} /> : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Summary
          totals={workspace.totals}
          scope={filter.scope}
          selectedKey={current.key}
          onScope={(scope) => setFilter({ ...filter, scope })}
          onSelect={select}
        />
        <div className="ml-auto">{createButton}</div>
      </div>
      <Toolbar filter={filter} sites={org.sites} onChange={setFilter} />
      <Panes
        workspace={workspace}
        org={org}
        editable={editable}
        filter={filter}
        selection={current}
        actions={detailActions}
        demo={demo}
        onSelect={select}
        onPickHit={(hit) =>
          setSelection({ key: hit.person.unitId ?? UNASSIGNED_KEY, highlightId: hit.person.id })
        }
        onBack={() => setSelection({ key: null, highlightId: null })}
        createButton={createButton}
      />
      <p className="text-sm text-muted-foreground tabular-nums" role="status">
        {text.summary.units}: {workspace.totals.units} ·{' '}
        {fill(text.list.people, { n: workspace.totals.employees })}
      </p>
      {create && (
        <UnitFormDialog
          open
          onOpenChange={(open) => !open && setCreate(null)}
          choices={{
            sites: org.sites,
            units: workspace.units,
            people: workspace.units.flatMap((row) => row.people),
          }}
          preset={create}
          onSubmit={(draft) => {
            actions.onCreate(draft);
            setCreate(null);
          }}
        />
      )}
    </div>
  );
}
