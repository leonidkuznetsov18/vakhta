import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ControlApiError, controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { Field } from '@/shared/ui';

type Stage = 'credentials' | 'totp' | 'setup';
interface Setup {
  readonly image: string;
  readonly secret: string;
}

/**
 * Operator sign-in: password, then TOTP. An operator without a second factor is walked through
 * the setup once, because the control routes refuse sessions without it.
 */
export function SignInPage() {
  const m = t().auth;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>('credentials');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const result = await controlApi.signIn(email, password);
      if (result.twoFactorRedirect) return { next: 'totp' as const, setup: null };
      // Signed in without a second factor: the guard will refuse, so enable it now.
      const enabled = await controlApi.enableTotp(password);
      const image = await QRCode.toDataURL(enabled.totpURI);
      const secret = new URL(enabled.totpURI).searchParams.get('secret') ?? '';
      return { next: 'setup' as const, setup: { image, secret } };
    },
    onSuccess: (result) => {
      setError(null);
      setSetup(result.setup);
      setStage(result.next);
    },
    onError: () => setError(m.failed),
  });

  const verify = useMutation({
    mutationFn: (code: string) => controlApi.verifyTotp(code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      await navigate({ to: '/' });
    },
    onError: (e: unknown) => setError(e instanceof ControlApiError ? e.message : m.failed),
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{stage === 'setup' ? m.setupTitle : m.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {stage === 'credentials' ? (
            <CredentialsForm busy={signIn.isPending} onSubmit={(values) => signIn.mutate(values)} />
          ) : (
            <TotpForm
              setup={setup}
              busy={verify.isPending}
              onSubmit={(code) => verify.mutate(code)}
            />
          )}
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function CredentialsForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (v: { email: string; password: string }) => void;
}) {
  const m = t().auth;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const ready = Boolean(email && password) && !busy;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit({ email, password });
      }}
    >
      <Field label={m.email}>
        <Input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={m.password}>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={!ready}>
        {m.signIn}
      </Button>
    </form>
  );
}

function TotpForm({
  setup,
  busy,
  onSubmit,
}: {
  setup: Setup | null;
  busy: boolean;
  onSubmit: (code: string) => void;
}) {
  const m = t().auth;
  const [code, setCode] = useState('');
  const ready = code.length >= 6 && !busy;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit(code);
      }}
    >
      {setup ? (
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <p>{m.setupHint}</p>
          <img src={setup.image} alt="TOTP QR" width={176} height={176} />
          <p className="break-all text-xs">
            {m.setupSecret}: <code>{setup.secret}</code>
          </p>
        </div>
      ) : null}
      <Field label={m.totpCode}>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
        />
      </Field>
      <Button type="submit" disabled={!ready}>
        {setup ? m.enable : m.verify}
      </Button>
    </form>
  );
}
