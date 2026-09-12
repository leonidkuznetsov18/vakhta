import { useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
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
import { useAppearance, type Theme } from '@/lib/theme';
import { CameraIcon, ShieldCheckIcon, ShieldAlertIcon, XIcon } from 'lucide-react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Label } from '@/components/ui/label';
import { IconButton } from '@/shared/ui/icon-button';
import { UserAvatar, photoToDataUrl } from '@/components/app/avatar';
import { InfoTip } from '@/components/app/info-tip';
import { notifySuccess } from '@/lib/toast';
import { ApiError, authApi } from '../api.ts';
import { currentLocale } from '../i18n.tsx';

const m = messages(currentLocale());
const t = m.admin.auth;
const THEMES = ['system', 'light', 'dark'] as const satisfies readonly Theme[];

interface Props {
  me: MeView;
  onChanged: () => void;
}

/** Profile: roles with scopes and enabling TOTP (password → QR → code). */
export function ProfilePanel({ me, onChanged }: Props) {
  const [step, setStep] = useState<'idle' | 'password' | 'verify' | 'done'>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  /** The QR and the backup codes come back once, with the secret; they are the answer, not state. */
  const enable = useMutation({
    mutationFn: async () => {
      const result = await authApi.enableTwoFactor(password);
      return {
        qr: await QRCode.toDataURL(result.totpURI, { margin: 1, width: 220 }),
        backupCodes: result.backupCodes,
      };
    },
    onSuccess: () => setStep('verify'),
    onSettled: () => setPassword(''),
  });
  const verify = useMutation({
    mutationFn: () => authApi.verifyTotp(code.trim()),
    onSuccess: () => {
      setStep('done');
      onChanged();
    },
  });
  const qr = enable.data?.qr ?? null;
  const backupCodes = enable.data?.backupCodes ?? [];
  const busy = enable.isPending || verify.isPending;
  const error = enable.error
    ? enable.error instanceof ApiError
      ? t.invalidCredentials
      : t.networkError
    : verify.error
      ? verify.error instanceof ApiError
        ? t.invalidCode
        : t.networkError
      : null;

  function startEnable(e: FormEvent) {
    e.preventDefault();
    enable.mutate();
  }

  function confirm(e: FormEvent) {
    e.preventDefault();
    verify.mutate();
  }

  const enabled = me.twoFactorEnabled || step === 'done';
  const appearance = useAppearance();
  const c = m.ui.common;
  const [name, setName] = useState(me.name);
  /** The file picker is a DOM element the page has to reach for; nothing about it is state. */
  const fileInput = useRef<HTMLInputElement>(null);

  const saveProfile = useMutation({
    mutationFn: (cmd: { name?: string; image?: string | null }) => authApi.updateMe(cmd),
    onSuccess: () => {
      notifySuccess(t.profileSaved);
      onChanged();
    },
  });
  /** A picture too big to send never reaches the server, so its refusal is not the mutation's. */
  const choosePhoto = useMutation({
    mutationFn: async (file: File) =>
      saveProfile.mutateAsync({ image: await photoToDataUrl(file) }),
    onSettled: () => {
      if (fileInput.current) fileInput.current.value = '';
    },
  });
  const profileBusy = saveProfile.isPending || choosePhoto.isPending;
  const profileError = saveProfile.error
    ? saveProfile.error instanceof ApiError
      ? saveProfile.error.message
      : t.networkError
    : choosePhoto.error
      ? t.photoTooLarge
      : null;

  return (
    <Section className="w-full max-w-3xl">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3">
        <div className="flex flex-col items-center gap-2 sm:row-span-2">
          <div className="relative size-16">
            <button
              type="button"
              className="group relative block size-16 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
              aria-label={t.uploadPhoto}
              title={t.uploadPhoto}
              disabled={profileBusy}
              onClick={() => fileInput.current?.click()}
            >
              <UserAvatar name={me.name} email={me.email} image={me.image} className="size-16" />
              <span className="absolute right-0 bottom-0 flex size-6 items-center justify-center rounded-full border bg-background text-foreground group-hover:bg-muted group-focus-visible:bg-muted">
                <CameraIcon className="size-3.5" aria-hidden="true" />
              </span>
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) choosePhoto.mutate(file);
            }}
          />
          <div className="flex items-center gap-1">
            {me.image && (
              <IconButton
                icon={XIcon}
                label={t.removePhoto}
                tooltip={t.removePhoto}
                size="icon-sm"
                variant="ghost"
                disabled={profileBusy}
                onClick={() => saveProfile.mutate({ image: null })}
              />
            )}
          </div>
        </div>
        <form
          className="flex min-w-0 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2 && name.trim() !== me.name) {
              saveProfile.mutate({ name: name.trim() });
            }
          }}
          noValidate
        >
          <div className="flex flex-wrap items-end gap-2">
            <FormField label={t.name} className="flex-1 basis-48">
              {(id) => (
                <Input
                  id={id}
                  name="name"
                  autoComplete="name"
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </FormField>
            <Button
              type="submit"
              disabled={
                profileBusy || isBlank(name) || name.trim().length < 2 || name.trim() === me.name
              }
            >
              {c.save}
            </Button>
          </div>
          <Feedback error={profileError} />
        </form>
        <dl className="col-span-2 grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 text-sm sm:col-span-1 sm:col-start-2 sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="sr-only text-muted-foreground sm:not-sr-only">{t.email}</dt>
          <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{me.email}</dd>
          <dt className="sr-only text-muted-foreground sm:not-sr-only">{t.roles}</dt>
          <dd className="min-w-0">
            {me.roles.length === 0 ? (
              <Muted>{t.noRoles}</Muted>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {me.roles.map((r) => (
                  <li key={r.id} className="min-w-0 max-w-full">
                    <Badge
                      variant="secondary"
                      className="h-auto max-w-full flex-wrap justify-start whitespace-normal"
                    >
                      {m.roles[r.role]}
                      <span className="ml-1 text-muted-foreground">
                        {m.admin.administration.users.scopeTypes[r.scopeType]}
                      </span>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-1">
          <Label htmlFor="profile-theme">{c.theme}</Label>
          <InfoTip text={m.ui.hints.profileTheme} />
        </div>
        <NativeSelect
          id="profile-theme"
          name="theme"
          value={appearance.theme}
          onChange={(event) => {
            const theme = THEMES.find((option) => option === event.target.value);
            if (theme) appearance.set({ theme });
          }}
          className="w-44 max-w-full"
        >
          {THEMES.map((key) => (
            <NativeSelectOption key={key} value={key}>
              {c.themes[key]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <section className="min-w-0 border-t pt-4" aria-labelledby="profile-security">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
            {enabled ? (
              <ShieldCheckIcon
                className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <ShieldAlertIcon
                className="size-5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
            )}
            <h2 id="profile-security" className="text-sm font-medium">
              {enabled ? t.twoFactorOn : t.twoFactorOff}
            </h2>
            <InfoTip text={m.ui.hints.profileTwoFactor} />
          </div>
          {!me.twoFactorEnabled && step === 'idle' && (
            <div>
              <Button type="button" onClick={() => setStep('password')}>
                {t.enableTwoFactor}
              </Button>
            </div>
          )}
        </div>
        {step === 'password' && (
          <form className="mt-4 flex max-w-sm flex-col gap-3" onSubmit={startEnable}>
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
          <form className="mt-4 flex min-w-0 flex-col gap-3" onSubmit={confirm}>
            <p className="text-sm text-muted-foreground">{t.scanQr}</p>
            {qr && (
              <img
                src={qr}
                alt="TOTP QR"
                width={220}
                height={220}
                className="h-auto max-w-full self-start rounded-lg border"
              />
            )}
            <FormField label={t.code} className="max-w-xs">
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
            <ul className="grid max-w-sm grid-cols-2 gap-1 font-mono text-sm">
              {backupCodes.map((c) => (
                <li key={c} className="break-all rounded-md bg-muted px-2 py-1">
                  {c}
                </li>
              ))}
            </ul>
          </form>
        )}
        {step === 'done' && <p className="text-sm">{t.twoFactorEnabled}</p>}
        <Feedback error={error} notice={null} />
      </section>
    </Section>
  );
}
