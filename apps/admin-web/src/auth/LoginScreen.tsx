import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { isBlank } from '@/lib/forms';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Feedback } from '@/components/app/feedback';
import { FormField } from '@/components/app/fields';
import { ApiError, authApi } from '../api.ts';
import { LanguageSwitcher, currentLocale } from '../i18n.tsx';
import { useDocumentTitle } from '@/lib/title';
import { validateWith, type FieldErrors } from '@/lib/validation';
import { z } from 'zod';

const all = messages(currentLocale());
const t = all.admin.auth;
/** Only presence and shape are checked here; the password policy is the server's business. */
const SignInForm = z.object({ email: z.email(), password: z.string().min(1) });

interface Props {
  onSignedIn: () => void;
  offline: boolean;
}

/** Two-step sign-in: password, then TOTP when the user has the second factor enabled. */
export function LoginScreen({ onSignedIn, offline }: Props) {
  useDocumentTitle(`${all.admin.auth.signInTitle} · ${all.admin.productName}`);
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const signIn = useMutation({
    mutationFn: () => authApi.signIn(email.trim(), password),
    onSuccess: (result) => {
      if (result.twoFactorRedirect) setStep('totp');
      else onSignedIn();
    },
  });
  const verify = useMutation({
    mutationFn: () => authApi.verifyTotp(code.trim()),
    onSuccess: () => onSignedIn(),
  });
  const busy = signIn.isPending || verify.isPending;
  /** A refused password and a server that never answered read differently to whoever is typing. */
  const failed = signIn.error ?? verify.error;
  const error =
    failed === null
      ? offline
        ? t.networkError
        : null
      : failed instanceof ApiError
        ? signIn.error
          ? t.invalidCredentials
          : t.invalidCode
        : t.networkError;

  function submitPassword(e: FormEvent) {
    e.preventDefault();
    const checked = validateWith(SignInForm, { email: email.trim(), password });
    setFieldErrors(checked.errors);
    if (checked.ok) signIn.mutate();
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    verify.mutate();
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="text-sm font-semibold text-muted-foreground">{all.admin.productName}</div>
          <CardTitle>{step === 'password' ? t.signInTitle : t.totpTitle}</CardTitle>
          {step === 'totp' ? <CardDescription>{t.totpHint}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={step === 'password' ? submitPassword : submitCode}
            noValidate={step === 'password'}
          >
            {step === 'password' ? (
              <>
                <FormField label={t.email} error={fieldErrors.email}>
                  {(id) => (
                    <Input
                      id={id}
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label={t.password} error={fieldErrors.password}>
                  {(id) => (
                    <Input
                      id={id}
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  )}
                </FormField>
              </>
            ) : (
              <FormField label={t.code}>
                {(id) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    required
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                )}
              </FormField>
            )}
            <Feedback error={error} notice={null} />
            <Button
              type="submit"
              disabled={busy || (step === 'password' ? isBlank(email) || !password : isBlank(code))}
            >
              {step === 'password' ? t.signIn : t.verify}
            </Button>
            <LanguageSwitcher />
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
