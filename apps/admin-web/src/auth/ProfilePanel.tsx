import React, { useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import type { MeView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { ApiError, authApi } from '../api.ts';

const m = messages('ru');
const t = m.admin.auth;

interface Props {
  me: MeView;
  onChanged: () => void;
}

/** Профіль: ролі з областями і ввімкнення TOTP (пароль → QR → код). */
export function ProfilePanel({ me, onChanged }: Props) {
  const [step, setStep] = useState<'idle' | 'password' | 'verify' | 'done'>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await authApi.enableTwoFactor(password);
      setQr(await QRCode.toDataURL(result.totpURI, { margin: 1, width: 220 }));
      setBackupCodes(result.backupCodes);
      setStep('verify');
    } catch (err) {
      setError(err instanceof ApiError ? t.invalidCredentials : t.networkError);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.verifyTotp(code.trim());
      setStep('done');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? t.invalidCode : t.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile">
      <dl className="kv">
        <dt>{t.email}</dt>
        <dd>{me.email}</dd>
        <dt>{t.roles}</dt>
        <dd>
          {me.roles.length === 0 ? (
            <span className="muted">{t.noRoles}</span>
          ) : (
            <ul className="chips">
              {me.roles.map((r) => (
                <li key={r.id} className="chip">
                  {m.roles[r.role]}
                  <small>{r.scopeType}</small>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      <section className="card">
        <h2>{me.twoFactorEnabled || step === 'done' ? t.twoFactorOn : t.twoFactorOff}</h2>
        {!me.twoFactorEnabled && step === 'idle' && (
          <button type="button" onClick={() => setStep('password')}>
            {t.enableTwoFactor}
          </button>
        )}
        {step === 'password' && (
          <form onSubmit={startEnable}>
            <label>
              <span>{t.confirmPassword}</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {t.enableTwoFactor}
            </button>
          </form>
        )}
        {step === 'verify' && (
          <form onSubmit={confirm}>
            <p className="muted">{t.scanQr}</p>
            {qr && <img src={qr} alt="TOTP QR" width={220} height={220} />}
            <label>
              <span>{t.code}</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {t.verify}
            </button>
            <p className="muted">{t.backupCodes}</p>
            <ul className="codes">
              {backupCodes.map((c) => (
                <li key={c}>
                  <code>{c}</code>
                </li>
              ))}
            </ul>
          </form>
        )}
        {step === 'done' && <p>{t.twoFactorEnabled}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
