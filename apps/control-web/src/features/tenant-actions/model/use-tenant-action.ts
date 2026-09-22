import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SuspendTenantCommand } from '@vakhta/contracts';
import { TenantStatus } from '@vakhta/domain';
import { controlApi, queryKeys } from '@/shared/api';

export const TenantAction = { SUSPEND: 'SUSPEND', DELETE: 'DELETE' } as const;
export type TenantAction = (typeof TenantAction)[keyof typeof TenantAction];

export function useTenantAction({
  tenantId,
  status,
  action,
  onDone,
}: {
  tenantId: string;
  status: TenantStatus;
  action: TenantAction;
  onDone: () => void;
}) {
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const parsed = SuspendTenantCommand.safeParse({ reason });
  const mutation = useMutation({
    mutationFn: async (command: SuspendTenantCommand) => {
      if (action === TenantAction.DELETE) await controlApi.deleteTenant(tenantId, command.reason);
      else await controlApi.suspend(tenantId, command.reason);
    },
    retry: false,
    networkMode: 'always',
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.tenants });
      onDone();
    },
  });
  const allowed =
    action === TenantAction.DELETE
      ? status !== TenantStatus.ARCHIVED
      : status === TenantStatus.ACTIVE;
  const canSubmit = parsed.success && allowed && !mutation.isPending;
  const submit = () => {
    if (canSubmit) mutation.mutate(parsed.data);
  };
  return {
    reason,
    setReason,
    canSubmit,
    submit,
    pending: mutation.isPending,
    error: mutation.error,
  };
}
