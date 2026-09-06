import { useState, type FormEvent } from 'react';
import { isBlank } from '@/lib/forms';
import QRCode from 'qrcode';
import type { MeView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Feedback } from '@/components/app/feedback';
import { FormField } from '@/components/app/fields';
import { Muted, Section } from '@/components/app/page';
import { SelectField } from '@/components/app/fields';
import { useAppearance, type Density, type Theme } from '@/lib/theme';
import { ApiError, authApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';

const m = messages(currentLocale());
const t = m.admin.auth;

interface Props {
  me: MeView;
  onChanged: () => void;
}

/** Profile: roles with scopes and enabling TOTP (password → QR → code). */
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

  const enabled = me.twoFactorEnabled || step === 'done';
  const appearance = useAppearance();
  const c = m.ui.common;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t.profile}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t.email}</dt>
          <dd>{me.email}</dd>
          <dt className="text-muted-foreground">{t.roles}</dt>
          <dd>
            {me.roles.length === 0 ? (
              <Muted>{t.noRoles}</Muted>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {me.roles.map((r) => (
                  <li key={r.id}>
                    <Badge variant="secondary">
                      {m.roles[r.role]}
                      <span className="ml-1 text-muted-foreground">{r.scopeType}</span>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </Section>

      <Section title={c.theme} hint={m.ui.hints.profileTheme}>
        <div className="flex flex-wrap gap-4">
          <SelectField
            label={c.theme}
            value={appearance.theme}
            onChange={(v) => appearance.set({ theme: v as Theme })}
            options={(['system', 'light', 'dark'] as const).map((k) => ({
              value: k,
              label: c.themes[k],
            }))}
            className="w-56"
          />
          <SelectField
            label={c.density}
            hint={m.ui.hints.profileDensity}
            value={appearance.density}
            onChange={(v) => appearance.set({ density: v as Density })}
            options={(['comfortable', 'compact'] as const).map((k) => ({
              value: k,
              label: c.densities[k],
            }))}
            className="w-56"
          />
        </div>
      </Section>

      <Section title={enabled ? t.twoFactorOn : t.twoFactorOff} hint={m.ui.hints.profileTwoFactor}>
        {!me.twoFactorEnabled && step === 'idle' && (
          <div>
            <Button type="button" onClick={() => setStep('password')}>
              {t.enableTwoFactor}
            </Button>
          </div>
        )}
        {step === 'password' && (
          <form className="flex flex-col gap-4" onSubmit={startEnable}>
            <FormField label={t.confirmPassword}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </FormField>
            <div>
              <Button type="submit" disabled={busy || !password}>
                {t.enableTwoFactor}
              </Button>
            </div>
          </form>
        )}
        {step === 'verify' && (
          <form className="flex flex-col gap-4" onSubmit={confirm}>
            <p className="text-sm text-muted-foreground">{t.scanQr}</p>
            {qr && (
              <img src={qr} alt="TOTP QR" width={220} height={220} className="rounded-lg border" />
            )}
            <FormField label={t.code}>
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              )}
            </FormField>
            <div>
              <Button type="submit" disabled={busy || isBlank(code)}>
                {t.verify}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t.backupCodes}</p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
              {backupCodes.map((c) => (
                <li key={c} className="rounded-md bg-muted px-2 py-1">
                  {c}
                </li>
              ))}
            </ul>
          </form>
        )}
        {step === 'done' && <p className="text-sm">{t.twoFactorEnabled}</p>}
        <Feedback error={error} notice={null} />
      </Section>
    </div>
  );
}
