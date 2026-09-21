import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { FailureState, LoadingState, PageHeader, StatusBadge } from '@/shared/ui';

export function OperatorsPage() {
  const m = t();
  const query = useQuery({ queryKey: queryKeys.operators, queryFn: controlApi.operators });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={m.operators.title} />
      {query.isPending ? <LoadingState /> : null}
      {query.isError ? <FailureState onRetry={() => void query.refetch()} /> : null}
      {query.data ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.operators.columns.email}</TableHead>
                <TableHead>{m.operators.columns.name}</TableHead>
                <TableHead>{m.operators.columns.role}</TableHead>
                <TableHead>{m.operators.columns.status}</TableHead>
                <TableHead>{m.operators.columns.totp}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((op) => (
                <TableRow key={op.id}>
                  <TableCell className="font-medium">{op.email}</TableCell>
                  <TableCell>{op.name}</TableCell>
                  <TableCell>{m.operators.roles[op.role]}</TableCell>
                  <TableCell>
                    <StatusBadge code={op.status} label={op.status} />
                  </TableCell>
                  <TableCell>{op.twoFactorEnabled ? m.common.yes : m.common.no}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
