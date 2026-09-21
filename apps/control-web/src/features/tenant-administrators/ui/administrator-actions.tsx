import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TenantAdministratorView } from '@vakhta/contracts';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LoadingState, FailureState } from '@/shared/ui';
import { queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { administratorApi } from '../api/administrators';
import { administratorError } from '../model/password';
import { usePassword } from '../model/use-password';

const contentClass =
  'fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background p-6 shadow-xl';

export function AdministratorActions({
  tenantId,
  user,
}: {
  tenantId: string;
  user: TenantAdministratorView;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <PasswordDialog tenantId={tenantId} user={user} />
      <RemoveDialog tenantId={tenantId} user={user} />
    </div>
  );
}

function PasswordDialog({ tenantId, user }: { tenantId: string; user: TenantAdministratorView }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="outline" size="sm">
          {t().administrators.changePassword}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <PasswordForm tenantId={tenantId} user={user} close={() => setOpen(false)} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PasswordForm({
  tenantId,
  user,
  close,
}: {
  tenantId: string;
  user: TenantAdministratorView;
  close: () => void;
}) {
  const m = t().administrators;
  const form = usePassword(tenantId, user.id);
  return (
    <Dialog.Content
      className={contentClass}
      onInteractOutside={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => {
        if (form.busy) event.preventDefault();
      }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          form.submit();
        }}
      >
        <Dialog.Title className="text-lg font-semibold">{m.changePassword}</Dialog.Title>
        <Dialog.Description className="break-all text-sm text-muted-foreground">
          {user.email}
        </Dialog.Description>
        <PasswordFields form={form} />
        {form.error || form.copyFailed ? (
          <FailureState message={form.error ?? t().common.error} />
        ) : null}
        {form.saved ? (
          <p role="status" className="text-sm">
            {m.saved}
          </p>
        ) : null}
        {form.busy ? <LoadingState /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={form.busy} onClick={close}>
            {form.saved ? m.close : m.cancel}
          </Button>
          {!form.saved ? (
            <Button type="submit" disabled={!form.canSave}>
              {m.save}
            </Button>
          ) : null}
        </div>
      </form>
    </Dialog.Content>
  );
}

function RemoveDialog({ tenantId, user }: { tenantId: string; user: TenantAdministratorView }) {
  const m = t().administrators;
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => administratorApi.remove({ tenantId, userId: user.id }),
    retry: false,
    networkMode: 'always',
    onSuccess: async () => {
      setOpen(false);
      await client.invalidateQueries({ queryKey: queryKeys.tenant(tenantId) });
    },
  });
  if (!user.canDelete)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button variant="outline" size="sm" disabled>
              {m.remove}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{m.lastAdmin}</TooltipContent>
      </Tooltip>
    );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!mutation.isPending) setOpen(value);
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="outline" size="sm">
          {m.remove}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className={contentClass}>
          <Dialog.Title className="text-lg font-semibold">{m.remove}</Dialog.Title>
          <Dialog.Description className="my-4 break-all text-sm">{user.email}</Dialog.Description>
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>{m.remove}</AlertTitle>
            <AlertDescription>{m.removeHint}</AlertDescription>
          </Alert>
          {mutation.error ? <FailureState message={administratorError(mutation.error)} /> : null}
          {mutation.isPending ? <LoadingState /> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={mutation.isPending}>
                {m.cancel}
              </Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => {
                if (!mutation.isPending) mutation.mutate();
              }}
            >
              {m.confirmRemove}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PasswordFields({ form }: { form: ReturnType<typeof usePassword> }) {
  const m = t().administrators;
  return (
    <>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {m.newPassword}
        <Input
          type={form.visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={form.password}
          disabled={form.busy || form.saved}
          minLength={12}
          maxLength={128}
          required
          aria-describedby="administrator-password-rule"
          onChange={(event) => form.change(event.target.value)}
        />
      </label>
      <p id="administrator-password-rule" className="text-sm text-muted-foreground">
        {m.passwordRule}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={form.busy || form.saved}
          onClick={form.generate}
        >
          {m.resetPassword}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={form.toggleVisible}>
          {form.visible ? m.hide : m.show}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!form.password}
          onClick={form.copy}
        >
          {form.copied ? m.copied : m.copy}
        </Button>
      </div>
    </>
  );
}
