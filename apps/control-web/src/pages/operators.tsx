import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OperatorRole, OperatorStatus } from '@vakhta/domain';
import type { OperatorView } from '@vakhta/contracts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { fill, t } from '@/shared/i18n';
import { FailureState, LoadingState, PageHeader, StatusBadge } from '@/shared/ui';
import {
  CreateOperator,
  ReissueInvitation,
  operatorQueries,
} from '@/features/operator-invitations';

const PAGE_SIZE = 20;
export function OperatorsPage() {
  const m = t();
  const query = useQuery(operatorQueries.list());
  const me = useQuery(operatorQueries.me());
  const [page, setPage] = useState(1);
  const canEdit = me.data?.role === OperatorRole.PLATFORM_ADMIN;
  const data = query.data;
  const items = data?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title={m.operators.title} action={canEdit ? <CreateOperator /> : undefined} />
      {query.isFetching ? (
        <LoadingState label={data ? m.operatorInvitations.refreshing : undefined} />
      ) : null}
      {query.isPaused ? (
        <FailureState
          message={m.operatorInvitations.offline}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isError ? <FailureState onRetry={() => void query.refetch()} /> : null}
      {items && data ? (
        <OperatorTable data={data} items={items} page={page} setPage={setPage} canEdit={canEdit} />
      ) : null}
    </div>
  );
}
function OperatorRow({ operator: op, canEdit }: { operator: OperatorView; canEdit: boolean }) {
  const m = t();
  const pending = op.invitationPending && op.status === OperatorStatus.ACTIVE;
  let status = m.operatorInvitations.active;
  if (pending) status = m.operatorInvitations.pending;
  if (op.status === OperatorStatus.DISABLED) status = m.operatorInvitations.disabled;
  return (
    <TableRow>
      <TableCell className="max-w-64 break-all whitespace-normal font-medium">{op.email}</TableCell>
      <TableCell className="max-w-52 break-words whitespace-normal">{op.name}</TableCell>
      <TableCell className="whitespace-normal">{m.operators.roles[op.role]}</TableCell>
      <TableCell>
        <StatusBadge code={pending ? 'PENDING' : op.status} label={status} />
      </TableCell>
      <TableCell>{op.twoFactorEnabled ? m.common.yes : m.common.no}</TableCell>
      {canEdit ? (
        <TableCell>{pending ? <ReissueInvitation id={op.id} email={op.email} /> : null}</TableCell>
      ) : null}
    </TableRow>
  );
}

function OperatorTable({
  data,
  items,
  page,
  setPage,
  canEdit,
}: {
  data: OperatorView[];
  items: OperatorView[];
  page: number;
  setPage: (page: number) => void;
  canEdit: boolean;
}) {
  const m = t();
  return (
    <div className="min-w-0 rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.operators.columns.email}</TableHead>
            <TableHead>{m.operators.columns.name}</TableHead>
            <TableHead>{m.operators.columns.role}</TableHead>
            <TableHead>{m.operators.columns.status}</TableHead>
            <TableHead>{m.operators.columns.totp}</TableHead>
            {canEdit ? <TableHead>{m.operatorInvitations.actions}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((op) => (
            <OperatorRow key={op.id} operator={op} canEdit={canEdit} />
          ))}
        </TableBody>
      </Table>
      {data.length === 0 ? <p className="p-4 text-sm">{m.operatorInvitations.empty}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm text-muted-foreground">
        <span>{fill(m.operatorInvitations.count, { count: data.length })}</span>
        {data.length > PAGE_SIZE ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {m.operatorInvitations.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * PAGE_SIZE >= data.length}
              onClick={() => setPage(page + 1)}
            >
              {m.operatorInvitations.next}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
