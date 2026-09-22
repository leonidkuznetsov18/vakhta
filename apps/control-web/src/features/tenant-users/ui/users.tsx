import { Info } from 'lucide-react';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { useState } from 'react';
import { useQuery, type FetchStatus } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  TENANT_USERS_PAGE_SIZE,
  TenantUserFilter,
  type TenantUserCounts,
  type TenantUsersView,
} from '@vakhta/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FailureState, LoadingState } from '@/shared/ui';
import { TenantUserAvatar } from './avatar';
import { fill, t } from '@/shared/i18n';
import { tenantUsersQueries } from '../api/users';
import { checkedTime, roleOptions, userPresentation } from '../model/view';

export function TenantUsers({ tenantId }: { tenantId: string }) {
  const m = t().users;
  const search = useSearch({ from: '/authenticated/tenants/$id' });
  const navigate = useNavigate();
  const filter = { page: search.usersPage, role: search.usersRole, search: search.usersSearch };
  const query = useQuery(tenantUsersQueries.directory(tenantId, filter));
  const change = (next: Partial<typeof search>) =>
    void navigate({
      to: '/tenants/$id',
      params: { id: tenantId },
      search: { ...search, ...next },
      replace: true,
    });
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label={m.title}>
      <UsersHeader
        fetchStatus={query.fetchStatus}
        hasData={Boolean(query.data)}
        onRefresh={() => void query.refetch()}
      />
      {query.isPaused ? (
        <FailureState message={m.offline} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isError ? <FailureState onRetry={() => void query.refetch()} /> : null}
      {query.isFetching && !query.data ? <LoadingState /> : null}
      {query.data ? (
        <UserGroups
          counts={query.data.counts}
          role={filter.role}
          onSelect={(role) => change({ usersRole: role, usersPage: 1 })}
        />
      ) : null}
      <UserSearch
        key={filter.search}
        value={filter.search}
        onApply={(value) => change({ usersSearch: value, usersPage: 1 })}
      />
      {query.data ? (
        <UserResults
          data={query.data}
          tenantId={tenantId}
          pending={query.isPlaceholderData || query.fetchStatus !== 'idle'}
          onPage={(page) => change({ usersPage: page })}
        />
      ) : null}
    </section>
  );
}
function UsersHeader({
  fetchStatus,
  hasData,
  onRefresh,
}: {
  fetchStatus: FetchStatus;
  hasData: boolean;
  onRefresh: () => void;
}) {
  const m = t().users;
  const disabled = fetchStatus !== 'idle';
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{m.title}</h2>
      <div className="flex items-center gap-3">
        <div className="size-4 [&>div]:py-0 [&_span]:sr-only">
          {fetchStatus === 'fetching' && hasData ? <LoadingState label={m.refreshing} /> : null}
        </div>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => {
            if (!disabled) onRefresh();
          }}
        >
          {m.refresh}
        </Button>
      </div>
    </div>
  );
}

function UserResults({
  data,
  tenantId,
  pending,
  onPage,
}: {
  data: TenantUsersView & { page: number };
  tenantId: string;
  pending: boolean;
  onPage: (page: number) => void;
}) {
  const m = t().users;
  const previousDisabled = pending || data.page <= 1;
  const nextDisabled = pending || data.page * TENANT_USERS_PAGE_SIZE >= data.total;
  return (
    <div className="flex min-w-0 flex-col gap-4" aria-busy={pending}>
      <Directory data={data} tenantId={tenantId} />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>{fill(m.count, { shown: data.items.length, total: data.total })}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={previousDisabled}
            onClick={() => {
              if (!previousDisabled) onPage(data.page - 1);
            }}
          >
            {m.previous}
          </Button>
          <span>{fill(m.page, { page: data.page })}</span>
          <Button
            variant="outline"
            disabled={nextDisabled}
            onClick={() => {
              if (!nextDisabled) onPage(data.page + 1);
            }}
          >
            {m.next}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {fill(m.checkedAt, { time: checkedTime(data.counts.checkedAt) })}
      </p>
    </div>
  );
}

function UserSearch({ value, onApply }: { value: string; onApply: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const m = t().users;
  const unchanged = draft.trim() === value;
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!unchanged) onApply(draft.trim());
      }}
    >
      <Input
        type="search"
        maxLength={200}
        className="max-w-lg"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={m.search}
        placeholder={m.search}
      />
      <Button type="submit" disabled={unchanged}>
        {m.apply}
      </Button>
    </form>
  );
}
function Directory({ data, tenantId }: { data: TenantUsersView; tenantId: string }) {
  const m = t().users;
  if (data.items.length === 0) return <p className="rounded-xl border p-6 text-sm">{m.empty}</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card px-4">
      {data.items.map((item) => {
        const user = userPresentation(item, tenantId);
        return (
          <li key={`${user.kind}:${user.id}`} className="flex min-w-0 gap-3 py-4">
            <TenantUserAvatar
              key={user.image}
              name={user.name}
              email={user.email ?? user.id}
              image={user.image}
            />
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="break-words font-medium">{user.name}</p>
                <p className="break-all text-sm text-muted-foreground">{user.email ?? m.noEmail}</p>
                {user.personnelNumber ? (
                  <p className="text-xs text-muted-foreground">
                    {m.personnelNumber} {user.personnelNumber}
                  </p>
                ) : null}
              </div>
              <p className="break-words text-sm sm:self-center">{user.roleLabel}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UserGroups({
  counts,
  role,
  onSelect,
}: {
  counts: TenantUserCounts;
  role: string;
  onSelect: (role: TenantUsersView['counts']['roles'][number]['role'] | 'ALL' | 'WORKER') => void;
}) {
  const m = t().users;
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <p className="flex items-center gap-1">
          {m.total} <strong className="ml-2 text-3xl tabular-nums">{counts.total}</strong>
          <InfoTooltip label={m.total} text={m.explanation}>
            <Info className="size-4" />
          </InfoTooltip>
        </p>
        <p className="text-sm">
          {m.workers}: <strong>{counts.workers}</strong>
        </p>
        <p className="text-sm">
          {m.panel}: <strong>{counts.panel}</strong>
        </p>
      </div>
      <div className="flex items-center gap-1 text-sm font-medium">
        {m.roles}
        <InfoTooltip label={m.roles} text={m.overlap}>
          <Info className="size-4" />
        </InfoTooltip>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={m.roles}>
        {roleOptions(counts).map((option) => (
          <Button
            key={option.value}
            variant={role === option.value ? 'default' : 'outline'}
            aria-pressed={role === option.value}
            disabled={role === option.value}
            className="h-auto min-h-9 whitespace-normal text-left disabled:opacity-100"
            onClick={() => onSelect(TenantUserFilter.parse(option.value))}
          >
            {option.label}
            <span className="tabular-nums">{option.count}</span>
          </Button>
        ))}
      </div>
    </>
  );
}
