import { Dialog } from 'radix-ui';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FailureState, LoadingState } from '@/shared/ui';
import { t } from '@/shared/i18n';
import { invitationApi } from '../api/invitations';
import { invitationError } from '../model/forms';
import { InvitationLink } from './invitation-link';
import { invitationDialogClass } from './create-operator';

export function ReissueInvitation({ id, email }: { id: string; email: string }) {
  const m = t().operatorInvitations;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="outline" size="sm">
          {m.reissue}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <ReissueForm id={id} email={email} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function ReissueForm({ id, email }: { id: string; email: string }) {
  const m = t().operatorInvitations;
  const mutation = useMutation({
    mutationFn: () => invitationApi.reissue(id),
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  });
  return (
    <Dialog.Content
      className={invitationDialogClass}
      onEscapeKeyDown={(event) => {
        if (mutation.isPending) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (mutation.isPending) event.preventDefault();
      }}
    >
      <Dialog.Title className="text-lg font-semibold">{m.reissue}</Dialog.Title>
      <Dialog.Description className="my-3 break-all text-sm">{email}</Dialog.Description>
      {mutation.data ? (
        <InvitationLink invitation={mutation.data} />
      ) : (
        <p className="text-sm text-muted-foreground">{m.reissueHint}</p>
      )}
      {mutation.error ? <FailureState message={invitationError(mutation.error)} /> : null}
      {mutation.isPending ? <LoadingState /> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Dialog.Close asChild>
          <Button variant="outline" disabled={mutation.isPending}>
            {m.close}
          </Button>
        </Dialog.Close>
        {!mutation.data ? (
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            {m.createLink}
          </Button>
        ) : null}
      </div>
    </Dialog.Content>
  );
}
