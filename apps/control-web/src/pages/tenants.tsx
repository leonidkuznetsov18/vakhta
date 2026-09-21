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
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        aria-label={m.tenants.search}
      />
      {query.isPending ? <LoadingState /> : null}
      {query.isError ? <FailureState onRetry={() => void query.refetch()} /> : null}
      {query.data ? <TenantsTable rows={rows} total={query.data.length} /> : null}
    </div>
  );
}

function TenantsTable({ rows, total }: { rows: TenantSummaryView[]; total: number }) {
  const m = t();
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.tenants.columns.tenant}</TableHead>
            <TableHead>{m.tenants.columns.status}</TableHead>
            <TableHead>{m.tenants.columns.modules}</TableHead>
            <TableHead>{m.tenants.columns.schema}</TableHead>
            <TableHead>{m.tenants.columns.lastJob}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
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
              <TableCell>
                <Link
                  className="control-link font-medium"
                  to="/tenants/$id"
                  params={{ id: row.id }}
                  search={{ tab: 'overview' }}
                >
                  {row.name}
                </Link>
                <div className="text-xs text-muted-foreground">{row.panelHost ?? row.slug}</div>
              </TableCell>
              <TableCell>
                <StatusBadge code={row.status} label={m.status[row.status]} />
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
          ))}
        </TableBody>
      </Table>
      <div className="border-t px-4 py-3 text-sm text-muted-foreground">
        {total === 0 ? m.tenants.empty : fill(m.tenants.count, { shown: rows.length, total })}
      </div>
    </div>
  );
}
