import { InvitationField as Field } from './invitation-field';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FailureState, LoadingState } from '@/shared/ui';
import { t } from '@/shared/i18n';
import { operatorQueries } from '../api/invitations';
import { invitationError, useAcceptInvitation } from '../model/forms';

export function AcceptInvitation({ token, done }: { token: string; done: boolean }) {
  const m = t().operatorInvitations;
  const query = useQuery(operatorQueries.invitation(done ? '' : token));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-8">
      <Card className="w-full min-w-0">
        <CardHeader>
          <CardTitle>{done ? m.saved : m.setPassword}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {done ? (
            <>
              <p className="text-sm text-muted-foreground">{m.signInHint}</p>
              <Button asChild>
                <Link to="/">{t().auth.signIn}</Link>
              </Button>
            </>
          ) : (
            <>
              {!token ? <FailureState message={m.unavailable} /> : null}
              {query.isFetching ? <LoadingState /> : null}
              {query.isPaused ? (
                <FailureState message={m.offline} onRetry={() => void query.refetch()} />
              ) : null}
              {query.error ? (
                <FailureState
                  message={invitationError(query.error)}
                  onRetry={() => void query.refetch()}
                />
              ) : null}
              {query.data ? (
                <>
                  <p className="break-words font-medium">{query.data.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{query.data.email}</p>
                  <PasswordForm token={token} />
                </>
              ) : null}
            </>
          )}
          {!done ? (
            <Button asChild variant="outline">
              <Link to="/">{t().auth.signIn}</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
function PasswordForm({ token }: { token: string }) {
  const m = t().operatorInvitations;
  const { form, mutation } = useAcceptInvitation(token);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p id="password-rule" className="text-sm text-muted-foreground">
        {m.passwordRule}
      </p>
      <form.Field name="password">
        {(field) => (
          <Field
            label={t().auth.password}
            error={
              field.state.meta.isTouched && !field.state.meta.isValid ? m.passwordRule : undefined
            }
          >
            <Input
              type="password"
              autoComplete="new-password"
              aria-describedby="password-rule"
              required
              minLength={12}
              maxLength={128}
              disabled={mutation.isPending}
              aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="confirm">
        {(field) => (
          <Field
            label={m.confirmPassword}
            error={field.state.meta.isTouched && !field.state.meta.isValid ? m.mismatch : undefined}
          >
            <Input
              type="password"
              autoComplete="new-password"
              required
              maxLength={128}
              disabled={mutation.isPending}
              aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </Field>
        )}
      </form.Field>
      {mutation.error ? <FailureState message={invitationError(mutation.error)} /> : null}
      {mutation.isPending ? <LoadingState /> : null}
      <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty]}>
        {([canSubmit, dirty]) => (
          <Button type="submit" disabled={!canSubmit || !dirty || mutation.isPending}>
            {m.setPassword}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
