import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EmployeeProfileView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { adminEmployeesApi } from '@/api';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/app/confirm-dialog';
import { profileError } from '../model/editor';
import { refreshProfiles } from '../model/api';

/** Status is an explicit, reasoned operation, separate from personal-data edits. */
export function StatusAction({ profile }: { profile: EmployeeProfileView }) {
  const all = messages(currentLocale());
  const t = all.admin.administration.employees;
  const { confirm, dialog } = useConfirm();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (command: { status: 'ACTIVE' | 'BLOCKED' | 'TERMINATED'; reason: string }) =>
      adminEmployeesApi.changeStatus(profile.employee.id, command),
    retry: false,
    onSuccess: () => refreshProfiles(client),
  });
  if (!profile.access.statusEdit) return null;
  const change = async (status: 'ACTIVE' | 'BLOCKED' | 'TERMINATED', label: string) => {
    if (mutation.isPending || status === profile.employee.status) return;
    const reason = await confirm({
      title: `${label}: ${profile.employee.fullName}`,
      confirmLabel: label,
      commentLabel: all.admin.administration.common.reason,
      commentRequired: true,
      destructive: status === 'TERMINATED',
    });
    if (typeof reason === 'string' && reason.trim()) mutation.mutate({ status, reason });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {profile.employee.status === 'ACTIVE' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              void change('BLOCKED', t.block);
            }}
          >
            {t.block}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              void change(
                'ACTIVE',
                profile.employee.status === 'TERMINATED' ? t.reinstate : t.unblock,
              );
            }}
          >
            {profile.employee.status === 'TERMINATED' ? t.reinstate : t.unblock}
          </Button>
        )}
        {profile.employee.status !== 'TERMINATED' && (
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              void change('TERMINATED', t.terminate);
            }}
          >
            {t.terminate}
          </Button>
        )}
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {profileError(mutation.error)}
        </p>
      )}
      {dialog}
    </div>
  );
}
