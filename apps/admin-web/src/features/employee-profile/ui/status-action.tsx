import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { EmployeeProfileView } from '@vakhta/contracts';
import { messages, format } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { adminEmployeesApi } from '@/api';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/app/confirm-dialog';
import { notifySuccess } from '@/lib/toast';
import { profileError } from '../model/editor';
import { refreshProfiles } from '../model/api';

/** Status is an explicit, reasoned operation, separate from personal-data edits. */
export function StatusAction({ profile }: { profile: EmployeeProfileView }) {
  const all = messages(currentLocale());
  const t = all.admin.administration.employees;
  const { confirm, dialog } = useConfirm();
  const employee = profile.employee;
  const { mutation, removal } = useStatusMutations(employee.id);
  if (!profile.access.statusEdit) return null;
  const busy = mutation.isPending || removal.isPending;
  const change = async (status: 'ACTIVE' | 'BLOCKED', label: string) => {
    if (busy || status === employee.status) return;
    const reason = await confirm({
      title: `${label}: ${employee.fullName}`,
      confirmLabel: label,
      commentLabel: all.admin.administration.common.reason,
      commentRequired: true,
    });
    if (typeof reason === 'string' && reason.trim()) mutation.mutate({ status, reason });
  };
  const remove = async () => {
    if (busy) return;
    const reason = await confirm({
      title: t.deleteEmployee,
      description: format(t.deleteEmployeeConfirm, { name: employee.fullName }),
      confirmLabel: t.deleteEmployee,
      commentLabel: all.admin.administration.common.reason,
      commentRequired: true,
      destructive: true,
    });
    if (typeof reason === 'string' && reason.trim()) removal.mutate(reason);
  };
  const restoreLabel = employee.status === 'TERMINATED' ? t.reinstate : t.unblock;
  const error = mutation.error ?? removal.error;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <StatusButton
          label={employee.status === 'ACTIVE' ? t.block : restoreLabel}
          disabled={busy}
          pending={mutation.isPending}
          onClick={() => {
            if (employee.status === 'ACTIVE') void change('BLOCKED', t.block);
            else void change('ACTIVE', restoreLabel);
          }}
        />
        <StatusButton
          label={t.deleteEmployee}
          destructive
          disabled={busy}
          pending={removal.isPending}
          onClick={remove}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {profileError(error)}
        </p>
      )}
      {dialog}
    </div>
  );
}

function StatusButton({
  label,
  disabled,
  pending,
  destructive = false,
  onClick,
}: {
  label: string;
  disabled: boolean;
  pending: boolean;
  destructive?: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={destructive ? 'text-destructive hover:text-destructive' : undefined}
      disabled={disabled}
      pending={pending}
      onClick={() => {
        void onClick();
      }}
    >
      {label}
    </Button>
  );
}

function useStatusMutations(employeeId: string) {
  const t = messages(currentLocale()).admin.administration.employees;
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (command: { status: 'ACTIVE' | 'BLOCKED'; reason: string }) =>
      adminEmployeesApi.changeStatus(employeeId, command),
    retry: false,
    onSuccess: () => refreshProfiles(client),
  });
  // The server deletes a card without worked history and terminates one with history.
  const removal = useMutation({
    mutationFn: (reason: string) => adminEmployeesApi.bulkDelete([employeeId], reason),
    retry: false,
    onSuccess: async (result) => {
      if (result.deleted === 0) {
        notifySuccess(t.employeeArchived);
        await refreshProfiles(client);
        return;
      }
      notifySuccess(t.employeeDeleted);
      await navigate({
        to: '/administration/{-$tab}/{-$detail}',
        params: { tab: 'employees', detail: undefined },
        replace: true,
      });
      await refreshProfiles(client);
    },
  });
  return { mutation, removal };
}
