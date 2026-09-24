import type { SiteView } from '@vakhta/contracts';
import { Building2Icon, TriangleAlertIcon, UserRoundXIcon, UsersRoundIcon } from 'lucide-react';
import { cn } from 'cn';
import { UserAvatar } from '@/components/app/avatar';
import { SelectField } from '@/components/app/fields';
import { StateFilter } from '@/shared/ui/state-filter';
import { TableSearch } from '@/shared/ui/table-search';
import { UNASSIGNED_KEY, type PersonHit, type WorkspaceTotals } from '../../model/workspace';
import { text } from './text';

const SCOPES = ['all', 'attention'] as const;
export type Scope = (typeof SCOPES)[number];
const scopeLabel: Record<Scope, string> = {
  all: text.filters.all,
  attention: text.filters.attention,
};

export interface ListFilter {
  readonly query: string;
  readonly scope: Scope;
  readonly siteId: string;
}

type Tone = 'neutral' | 'warning';

interface StatProps {
  readonly icon: typeof UsersRoundIcon;
  readonly label: string;
  readonly value: number;
  readonly tone?: Tone;
  readonly onClick?: () => void;
  readonly active?: boolean;
}

/** A count that is also the filter for what it counts, so a worrying number is one click away. */
function Stat({ icon: Icon, label, value, tone = 'neutral', onClick, active = false }: StatProps) {
  const warn = tone === 'warning' && value > 0;
  const iconClass = warn ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground';
  const body = (
    <>
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', iconClass)} />
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn('font-semibold tabular-nums', warn && 'text-orange-700 dark:text-orange-300')}
      >
        {value}
      </span>
    </>
  );
  const className = cn(
    'flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm',
    warn && 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40',
    active && 'ring-2 ring-ring/50',
  );
  if (!onClick) return <span className={className}>{body}</span>;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        className,
        'hover:bg-muted active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      )}
    >
      {body}
    </button>
  );
}

export function Summary({
  totals,
  scope,
  selectedKey,
  onScope,
  onSelect,
}: {
  readonly totals: WorkspaceTotals;
  readonly scope: Scope;
  readonly selectedKey: string | null;
  readonly onScope: (scope: Scope) => void;
  readonly onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={text.title}>
      <Stat icon={Building2Icon} label={text.summary.units} value={totals.units} />
      <Stat icon={UsersRoundIcon} label={text.summary.employees} value={totals.employees} />
      <Stat
        icon={UserRoundXIcon}
        label={text.summary.unassigned}
        value={totals.unassigned}
        tone="warning"
        active={selectedKey === UNASSIGNED_KEY}
        onClick={() => onSelect(UNASSIGNED_KEY)}
      />
      <Stat
        icon={TriangleAlertIcon}
        label={text.summary.attention}
        value={totals.needingAttention}
        tone="warning"
        active={scope === 'attention'}
        onClick={() => onScope(scope === 'attention' ? 'all' : 'attention')}
      />
    </div>
  );
}

export function Toolbar({
  filter,
  sites,
  onChange,
}: {
  readonly filter: ListFilter;
  readonly sites: readonly SiteView[];
  readonly onChange: (filter: ListFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {sites.length > 1 && (
        <SelectField
          label={text.filters.site}
          value={filter.siteId}
          onChange={(siteId) => onChange({ ...filter, siteId })}
          placeholder={text.filters.allSites}
          options={sites.map((site) => ({ value: site.id, label: site.name }))}
          className="w-full sm:w-56"
        />
      )}
      <StateFilter
        label={text.filters.all}
        value={filter.scope}
        onChange={(scope) => onChange({ ...filter, scope })}
        options={SCOPES.map((value) => ({ value, label: scopeLabel[value] }))}
      />
      <TableSearch
        value={filter.query}
        onChange={(query) => onChange({ ...filter, query })}
        label={text.search.label}
        placeholder={text.search.placeholder}
        className="w-full sm:w-72"
      />
    </div>
  );
}

const MAX_HITS = 6;

/** People matching the search, each with the unit they sit in; picking one jumps to that row. */
export function PeopleHits({
  hits,
  onPick,
}: {
  readonly hits: readonly PersonHit[];
  readonly onPick: (hit: PersonHit) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <section aria-label={text.search.people} className="flex flex-col gap-1">
      <h3 className="px-2 text-xs font-medium text-muted-foreground">{text.search.people}</h3>
      <ul className="flex flex-col gap-0.5">
        {hits.slice(0, MAX_HITS).map((hit) => (
          <li key={hit.person.id}>
            <button
              type="button"
              onClick={() => onPick(hit)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            >
              <UserAvatar
                name={hit.person.fullName}
                email={hit.person.id}
                image={null}
                className="size-6"
              />
              <span className="min-w-0 flex-1 truncate">{hit.person.fullName}</span>
              <span className="shrink-0 truncate text-xs text-muted-foreground">
                {hit.unitName ?? text.search.unassigned}
              </span>
            </button>
          </li>
        ))}
        {hits.length > MAX_HITS && (
          <li className="px-2 text-xs text-muted-foreground">+{hits.length - MAX_HITS}</li>
        )}
      </ul>
    </section>
  );
}
