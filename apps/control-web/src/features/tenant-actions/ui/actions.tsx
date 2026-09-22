import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DropdownMenu } from 'radix-ui';
import { Ellipsis, Pause, Trash2 } from 'lucide-react';
import { OperatorRole, TenantStatus } from '@vakhta/domain';
import type { TenantSummaryView } from '@vakhta/contracts';
import { Button } from '@/components/ui/button';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { FailureState, LoadingState, IconButton } from '@/shared/ui';
import { TenantAction, useTenantAction } from '../model/use-tenant-action';

export function TenantActions({ tenant }: { tenant: TenantSummaryView }) {
  const [action, setAction] = useState<TenantAction | null>(null);
  const triggerId = `tenant-actions-${tenant.id}`;
  const operator = useQuery({ queryKey: queryKeys.me, queryFn: controlApi.me });
  const m = t().tenantActions;
  if (operator.data?.role !== OperatorRole.PLATFORM_ADMIN) return null;
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <IconButton
            id={triggerId}
            icon={Ellipsis}
            label={`${m.title}: ${tenant.name}`}
            tooltip={m.title}
            size="icon"
            variant="ghost"
          />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-44 rounded-lg border bg-popover p-1 shadow-lg"
          >
            <DropdownMenu.Item
              disabled={tenant.status !== TenantStatus.ACTIVE}
              onSelect={() => setAction(TenantAction.SUSPEND)}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none focus:bg-accent active:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50"
            >
              <Pause className="size-4" aria-hidden="true" />
              {m.suspend}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={tenant.status === TenantStatus.ARCHIVED}
              onSelect={() => setAction(TenantAction.DELETE)}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm text-destructive outline-none focus:bg-destructive/10 active:bg-destructive/10 data-disabled:pointer-events-none data-disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {m.delete}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <Dialog.Root
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        {action ? (
          <ActionDialog
            tenant={tenant}
            action={action}
            triggerId={triggerId}
            onDone={() => setAction(null)}
          />
        ) : null}
      </Dialog.Root>
    </div>
  );
}

function ActionDialog({
  tenant,
  action,
  triggerId,
  onDone,
}: {
  tenant: TenantSummaryView;
  action: TenantAction;
  triggerId: string;
  onDone: () => void;
}) {
  const m = t().tenantActions;
  const form = useTenantAction({ tenantId: tenant.id, status: tenant.status, action, onDone });
  const deleting = action === TenantAction.DELETE;
  const label = deleting ? m.delete : m.suspend;
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Content
        className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background p-6 shadow-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(triggerId)?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (form.pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <Dialog.Title className="break-words text-lg font-semibold">
          {label}: {tenant.name}
        </Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">
          {deleting ? m.deleteHint : m.suspendHint}
        </Dialog.Description>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            form.submit();
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-medium">
            {m.reason}
            <textarea
              autoFocus
              required
              minLength={3}
              maxLength={500}
              value={form.reason}
              disabled={form.pending}
              onChange={(event) => form.setReason(event.target.value)}
              className="min-h-28 w-full resize-y rounded-md border bg-background px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <p className="text-sm text-muted-foreground">{m.reasonHint}</p>
          {form.error ? <FailureState message={m.failed} /> : null}
          {form.pending ? <LoadingState label={m.saving} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={form.pending} onClick={onDone}>
              {m.cancel}
            </Button>
            <Button
              type="submit"
              variant={deleting ? 'destructive' : 'default'}
              disabled={!form.canSubmit}
            >
              {label}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
