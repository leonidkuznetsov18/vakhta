import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TENANT_ADMINISTRATORS_PAGE_SIZE, type TenantAdministratorsView } from '@vakhta/contracts';
import { OperatorRole } from '@vakhta/domain';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FailureState, LoadingState } from '@/shared/ui';
import { fill, t } from '@/shared/i18n';
import { administratorQueries } from '../api/administrators';
import { AdministratorActions } from './administrator-actions';

export function TenantAdministrators({ tenantId }: { tenantId: string }) {
  const m = t().administrators;
  const [page, setPage] = useState(1);
  const query = useQuery(administratorQueries.list(tenantId, page));
  const operator = useQuery(administratorQueries.operator());
  const canEdit = operator.data?.role === OperatorRole.PLATFORM_ADMIN;
  const data = query.data;
  return (
    <Card className="min-w-0 lg:col-span-3">
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <p className="text-sm text-muted-foreground">{m.passwordHint}</p>
        {query.isPaused ? (
          <FailureState message={m.offline} onRetry={() => void query.refetch()} />
        ) : null}
        {query.isError ? <FailureState onRetry={() => void query.refetch()} /> : null}
        {query.isFetching ? <LoadingState label={data ? m.refreshing : undefined} /> : null}
        {data ? (
          <AdministratorList
            tenantId={tenantId}
            data={data}
            canEdit={canEdit}
            page={page}
            setPage={setPage}
            fetching={query.isFetching}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function AdministratorList({
  tenantId,
  data,
  canEdit,
  page,
  setPage,
  fetching,
}: {
  tenantId: string;
  data: TenantAdministratorsView;
  canEdit: boolean;
  page: number;
  setPage: (page: number) => void;
  fetching: boolean;
}) {
  const m = t().administrators;
  return (
    <>
      {!data.databaseReady ? <p className="text-sm">{m.notReady}</p> : null}
      {data.databaseReady && data.items.length === 0 ? <p className="text-sm">{m.empty}</p> : null}
      <ul className="divide-y">
        {data.items.map((user) => (
          <li
            key={user.id}
            className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="break-words font-medium">{user.name}</p>
              <p className="break-all text-sm text-muted-foreground">{user.email}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                {user.twoFactorEnabled ? (
                  <ShieldCheck className="size-4 text-emerald-600" />
                ) : (
                  <ShieldAlert className="size-4 text-amber-600" />
                )}
                {user.twoFactorEnabled ? m.mfaEnabled : m.mfaDisabled}
              </p>
            </div>
            {canEdit ? <AdministratorActions tenantId={tenantId} user={user} /> : null}
          </li>
        ))}
      </ul>
      <AdministratorPagination
        total={data.total}
        page={page}
        setPage={setPage}
        fetching={fetching}
      />
    </>
  );
}

function AdministratorPagination({
  total,
  page,
  setPage,
  fetching,
}: {
  total: number;
  page: number;
  setPage: (page: number) => void;
  fetching: boolean;
}) {
  const m = t().administrators;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
      <span>{fill(m.count, { count: total })}</span>
      {total > TENANT_ADMINISTRATORS_PAGE_SIZE || page > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || fetching}
            onClick={() => setPage(page - 1)}
          >
            {m.previous}
          </Button>
          <span>{fill(m.page, { page })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * TENANT_ADMINISTRATORS_PAGE_SIZE >= total || fetching}
            onClick={() => setPage(page + 1)}
          >
            {m.next}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
