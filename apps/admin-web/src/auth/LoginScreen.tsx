import React, { useState, type FormEvent } from 'react';
import { messages } from '@vakhta/i18n';
import { ApiError, authApi } from '../api.ts';

const t = messages('ru').admin.auth;

interface Props {
  onSignedIn: () => void;
  offline: boolean;
}

/** Вхід у два кроки: пароль, потім TOTP, якщо у користувача ввімкнено другий фактор. */
export function LoginScreen({ onSignedIn, offline }: Props) {
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(offline ? t.networkError : null);
  const [busy, setBusy] = useState(false);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authApi.signIn(email.trim(), password);
      if (result.twoFactorRedirect) {
        setStep('totp');
        return;
      }
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? t.invalidCredentials : t.networkError);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.verifyTotp(code.trim());
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? t.invalidCode : t.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={step === 'password' ? submitPassword : submitCode}>
        <div className="brand">{messages('ru').admin.productName}</div>
        <h1>{step === 'password' ? t.signInTitle : t.totpTitle}</h1>

        {step === 'password' ? (
          <>
            <label>
              <span>{t.email}</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              <span>{t.password}</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <p className="muted">{t.totpHint}</p>
            <label>
              <span>{t.code}</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {step === 'password' ? t.signIn : t.verify}
        </button>
      </form>
    </main>
  );
}
