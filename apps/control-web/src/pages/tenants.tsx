import { TENANT_COUNTS_BATCH_SIZE, type TenantUserCountResult } from '@vakhta/contracts';
import { TenantUserCount, tenantUsersQueries } from '@/features/tenant-users';
import { useState } from 'react';
import type { TenantSummaryView } from '@vakhta/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { controlApi, queryKeys } from '@/shared/api';
import { fill, t } from '@/shared/i18n';
import { FailureState, LoadingState, PageHeader, StatusBadge } from '@/shared/ui';

function matches(row: TenantSummaryView, needle: string): boolean {
  if (!needle) return true;
  return row.name.toLowerCase().includes(needle) || row.slug.includes(needle);
}

export function TenantsPage() {
  const m = t();
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: queryKeys.tenants, queryFn: controlApi.tenants });
  const needle = search.trim().toLowerCase();
  const rows = (query.data ?? []).filter((row) => matches(row, needle));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={m.tenants.title}
        subtitle={m.tenants.subtitle}
        action={
          <Button asChild>
            <Link to="/tenants/new">
              <Plus className="size-4" /> {m.tenants.create}
            </Link>
          </Button>
        }
      />
      <Input
        type="search"
        placeholder={m.tenants.search}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        className="max-w-sm"
        aria-label={m.tenants.search}
      />
      {query.isPending ? <LoadingState /> : null}
      {query.isError ? <FailureState onRetry={() => void query.refetch()} /> : null}
      {query.data ? <TenantResults key={needle} rows={rows} /> : null}
    </div>
  );
}

function TenantResults({ rows }: { rows: TenantSummaryView[] }) {
  const m = t();
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / TENANT_COUNTS_BATCH_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = rows.slice(
    (currentPage - 1) * TENANT_COUNTS_BATCH_SIZE,
    currentPage * TENANT_COUNTS_BATCH_SIZE,
  );
  const counts = useQuery(tenantUsersQueries.counts(visible.map((row) => row.id)));
  const byTenant = new Map(counts.data?.map((row) => [row.tenantId, row]));

  return (
    <>
      {counts.isFetching ? <LoadingState label={m.users.refreshing} /> : null}
      {counts.isError || counts.isPaused ? (
        <FailureState
          message={counts.isPaused ? m.users.offline : m.users.unavailable}
          onRetry={() => void counts.refetch()}
        />
      ) : null}

      <TenantsTable
        rows={visible}
        total={rows.length}
        counts={byTenant}
        loading={counts.isPending && !counts.isPaused}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => void counts.refetch()}
          disabled={counts.isFetching || visible.length === 0}
        >
          {m.users.refresh}
        </Button>
        {pageCount > 1 ? (
          <>
            <Button
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {m.users.previous}
            </Button>
            <Button
              variant="outline"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              {m.users.next}
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}

function TenantsTable({
  rows,
  total,
  counts,
  loading,
}: {
  rows: TenantSummaryView[];
  total: number;
  counts: Map<string, TenantUserCountResult>;
  loading: boolean;
}) {
  const m = t();
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.tenants.columns.tenant}</TableHead>
            <TableHead>{m.tenants.columns.status}</TableHead>
            <TableHead>{m.users.total}</TableHead>
            <TableHead>{m.tenants.columns.modules}</TableHead>
            <TableHead>{m.tenants.columns.schema}</TableHead>
            <TableHead>{m.tenants.columns.lastJob}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TenantRow key={row.id} row={row} count={counts.get(row.id)} loading={loading} />
          ))}
        </TableBody>
      </Table>
      <div className="border-t px-4 py-3 text-sm text-muted-foreground">
        {fill(m.tenants.count, { shown: rows.length, total })}
      </div>
    </div>
  );
}

function TenantRow({
  row,
  count,
  loading,
}: {
  row: TenantSummaryView;
  count: TenantUserCountResult | undefined;
  loading: boolean;
}) {
  const m = t();
  const navigate = useNavigate();
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/70 focus-within:bg-muted/70 active:bg-muted"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a, button')) return;
        void navigate({
          to: '/tenants/$id',
          params: { id: row.id },
          search: { tab: 'overview' },
        });
      }}
    >
      <TableCell className="whitespace-normal break-words [&>*]:max-w-64">
        <Link
          className="control-link inline-block font-medium"
          to="/tenants/$id"
          params={{ id: row.id }}
          search={{ tab: 'overview' }}
        >
          {row.name}
        </Link>
        <div className="text-xs text-muted-foreground">
          {m.tenants.columns.slug}: {row.slug}
        </div>
        {row.panelHost ? (
          <div className="text-xs text-muted-foreground">{row.panelHost}</div>
        ) : null}
      </TableCell>
      <TableCell>
        <StatusBadge code={row.status} label={m.status[row.status]} />
      </TableCell>
      <TableCell>
        <TenantUserCount tenantId={row.id} result={count} loading={loading} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.modules.map((mod) => m.modules[mod]).join(' · ')}
      </TableCell>
      <TableCell className="text-sm">{row.schemaVersion ?? '—'}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.lastJob
          ? `${m.jobs.kinds[row.lastJob.kind]} · ${m.jobs.status[row.lastJob.status]}`
          : '—'}
      </TableCell>
    </TableRow>
  );
}
