import { InvitationField as Field } from './invitation-field';
import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { OperatorRole } from '@vakhta/domain';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { FailureState, LoadingState } from '@/shared/ui';
import { t } from '@/shared/i18n';
import { invitationError, useCreateOperator } from '../model/forms';
import { InvitationLink } from './invitation-link';

export const invitationDialogClass =
  'fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background p-6 shadow-xl';
export function CreateOperator() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button>
          <UserPlus className="size-4" />
          {t().operatorInvitations.add}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <CreateOperatorForm close={() => setOpen(false)} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function CreateOperatorForm({ close }: { close: () => void }) {
  const m = t().operatorInvitations;
  const { form, mutation } = useCreateOperator();
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
      <Dialog.Title className="text-lg font-semibold">{m.add}</Dialog.Title>
      <Dialog.Description className="mt-2 text-sm text-muted-foreground">
        {m.createHint}
      </Dialog.Description>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {mutation.data ? (
          <InvitationLink invitation={mutation.data} />
        ) : (
          <OperatorFields form={form} busy={mutation.isPending} />
        )}
        {mutation.error ? <FailureState message={invitationError(mutation.error)} /> : null}
        {mutation.isPending ? <LoadingState /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={close}>
            {m.close}
          </Button>
          {!mutation.data ? (
            <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty]}>
              {([canSubmit, dirty]) => (
                <Button type="submit" disabled={!canSubmit || !dirty || mutation.isPending}>
                  {m.createLink}
                </Button>
              )}
            </form.Subscribe>
          ) : null}
        </div>
      </form>
    </Dialog.Content>
  );
}

function OperatorFields({
  form,
  busy,
}: {
  form: ReturnType<typeof useCreateOperator>['form'];
  busy: boolean;
}) {
  const m = t().operatorInvitations;
  return (
    <>
      <form.Field name="name">
        {(field) => (
          <Field
            label={t().operators.columns.name}
            error={field.state.meta.isTouched && !field.state.meta.isValid ? m.nameRule : undefined}
          >
            <Input
              autoComplete="name"
              required
              maxLength={120}
              aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
              value={field.state.value}
              disabled={busy}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <Field
            label={t().operators.columns.email}
            error={
              field.state.meta.isTouched && !field.state.meta.isValid ? m.emailRule : undefined
            }
          >
            <Input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
              value={field.state.value}
              disabled={busy}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="role">
        {(field) => (
          <Field label={t().operators.columns.role}>
            <NativeSelect
              aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
              value={field.state.value}
              disabled={busy}
              onChange={(event) =>
                field.handleChange(
                  event.target.value === OperatorRole.PLATFORM_ADMIN
                    ? OperatorRole.PLATFORM_ADMIN
                    : OperatorRole.PLATFORM_VIEWER,
                )
              }
            >
              <option value={OperatorRole.PLATFORM_VIEWER}>
                {t().operators.roles.PLATFORM_VIEWER}
              </option>
              <option value={OperatorRole.PLATFORM_ADMIN}>
                {t().operators.roles.PLATFORM_ADMIN}
              </option>
            </NativeSelect>
          </Field>
        )}
      </form.Field>
      <p className="text-sm text-muted-foreground">{m.roleHint}</p>
    </>
  );
}
