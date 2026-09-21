import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { OnboardingPassword, OnboardingStatus, type OnboardingView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale, LanguageSwitcher } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Feedback } from '@/components/app/feedback';
import { FormField } from '@/components/app/fields';
import { LoadingState } from '@/shared/ui/loading-state';
import { acceptInvitation, InvitationUnavailable } from '../api/onboarding';
import { welcomeQueries } from '../api/queries';
import { LogoMark } from '@/components/app/logo';

const t = messages(currentLocale()).onboarding;
function errorMessage(error: Error): string {
  return error instanceof InvitationUnavailable ? t.invalid : t.failed;
}
function signIn() {
  location.replace(`${location.pathname}${location.search}#/overview`);
  location.reload();
}

export function WelcomePage({ token }: { readonly token: string }) {
  const invitation = useQuery(welcomeQueries.invitation(token));
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full min-w-0 max-w-lg">
        <CardHeader className="gap-3">
          <LanguageSwitcher />
          <CardTitle className="break-words">{t.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-5">
          {invitation.isPending ? <LoadingState label={t.loading} /> : null}
          {invitation.isError ? (
            <>
              <Feedback error={errorMessage(invitation.error)} />
              <Button
                variant="outline"
                onClick={() => void invitation.refetch()}
                disabled={invitation.isFetching}
              >
                {t.retry}
              </Button>
            </>
          ) : null}
          {invitation.data ? <WelcomeContent token={token} invitation={invitation.data} /> : null}
        </CardContent>
      </Card>
    </main>
  );
}

function WelcomeContent({
  token,
  invitation,
}: {
  readonly token: string;
  readonly invitation: OnboardingView;
}) {
  const [completed, setCompleted] = useState(invitation.status === OnboardingStatus.USED);
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <LogoMark className="size-12" />
        <p className="break-words text-lg font-semibold [overflow-wrap:anywhere]">
          {invitation.displayName}
        </p>
      </div>
      {completed ? (
        <>
          <p>{t.success}</p>
          <Button onClick={signIn}>{t.signIn}</Button>
        </>
      ) : (
        <PasswordForm
          token={token}
          email={invitation.email}
          onCompleted={() => setCompleted(true)}
        />
      )}
      <div className="grid gap-3 border-t pt-4">
        <BotSetup url={invitation.botUrl} />
        {invitation.kioskUrl ? (
          <>
            <p className="text-sm">{t.kioskSteps}</p>
            <Button asChild variant="outline">
              <a href={invitation.kioskUrl} target="_blank" rel="noreferrer">
                {t.kiosk}
              </a>
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}

function BotSetup({ url }: { readonly url: string | null }) {
  const qr = useQuery(welcomeQueries.qr(url));
  if (!url) return <p className="text-sm text-muted-foreground">{t.botPending}</p>;
  return (
    <>
      <Button asChild variant="outline">
        <a href={url} target="_blank" rel="noreferrer">
          {t.bot}
        </a>
      </Button>
      {qr.data ? (
        <img src={qr.data} alt={t.bot} width={208} height={208} className="mx-auto" />
      ) : null}
    </>
  );
}

function PasswordForm({
  token,
  email,
  onCompleted,
}: {
  readonly token: string;
  readonly email: string;
  readonly onCompleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const accept = useMutation({
    mutationFn: () => acceptInvitation(token, password),
    onSuccess: onCompleted,
  });
  const valid = OnboardingPassword.safeParse(password).success && password === confirmation;
  const mismatch = confirmation && confirmation !== password ? t.mismatch : null;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid && !accept.isPending) accept.mutate();
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <p>{t.intro}</p>
      <p className="break-all font-medium">{email}</p>
      <FormField label={t.password} hint={t.passwordHint}>
        {(id) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            value={password}
            minLength={12}
            maxLength={128}
            onChange={(event) => setPassword(event.target.value)}
            disabled={accept.isPending}
          />
        )}
      </FormField>
      <FormField label={t.confirmPassword} error={mismatch}>
        {(id) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            maxLength={128}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={accept.isPending}
          />
        )}
      </FormField>
      {accept.isError ? <Feedback error={errorMessage(accept.error)} /> : null}
      <Button type="submit" disabled={!valid || accept.isPending}>
        {accept.isPending ? <LoadingState label={t.saving} /> : t.submit}
      </Button>
    </form>
  );
}
