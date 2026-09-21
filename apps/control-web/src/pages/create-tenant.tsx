import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { CreateTenantCommand } from '@vakhta/contracts';
import {
  DELIVERED_TENANT_MODULES,
  LOCALES,
  suggestTenantSlug,
  type Locale,
  type TenantModule,
} from '@vakhta/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { ControlApiError, controlApi, queryKeys } from '@/shared/api';
import { fill, t } from '@/shared/i18n';
import { Field, PageHeader } from '@/shared/ui';

const TIMEZONES = [
  'Europe/Kyiv',
  'Europe/Warsaw',
  'Europe/Berlin',
  'Europe/Vilnius',
  'Asia/Almaty',
];
const LOCALE_LABEL: Record<Locale, string> = { uk: 'Українська', en: 'English', ru: 'Русский' };
const SLUG_TAKEN = 'TENANT_SLUG_TAKEN';

function pattern(name: string, fallback: string): string {
  const value: unknown = import.meta.env[name];
  return typeof value === 'string' && value ? value : fallback;
}
const HOST_PATTERNS = {
  panel: pattern('VITE_PANEL_HOST_PATTERN', '{slug}.vakhta.xyz'),
  kiosk: pattern('VITE_KIOSK_HOST_PATTERN', '{slug}-kiosk.vakhta.xyz'),
  api: pattern('VITE_API_HOST_PATTERN', '{slug}-api.vakhta.xyz'),
};

interface Draft {
  name: string;
  slug: string;
  slugTouched: boolean;
  defaultLocale: Locale;
  timezone: string;
  modules: TenantModule[];
  adminName: string;
  adminEmail: string;
  botToken: string;
}
type Errors = Partial<Record<string, string>>;
interface DraftProps {
  draft: Draft;
  errors: Errors;
  update: (patch: Partial<Draft>) => void;
}

const EMPTY: Draft = {
  name: '',
  slug: '',
  slugTouched: false,
  defaultLocale: 'uk',
  timezone: 'Europe/Kyiv',
  modules: [...DELIVERED_TENANT_MODULES],
  adminName: '',
  adminEmail: '',
  botToken: '',
};

function draftInput(draft: Draft): Record<string, unknown> {
  return {
    name: draft.name,
    slug: draft.slug,
    defaultLocale: draft.defaultLocale,
    timezone: draft.timezone,
    modules: draft.modules,
    adminName: draft.adminName,
    adminEmail: draft.adminEmail,
    botToken: draft.botToken || undefined,
    provision: true,
  };
}

function toggleModule(
  modules: readonly TenantModule[],
  module: TenantModule,
  on: boolean,
): TenantModule[] {
  const next = new Set(modules);
  if (on) next.add(module);
  else next.delete(module);
  return [...next];
}

function isComplete(draft: Draft): boolean {
  return Boolean(
    draft.name && draft.slug && draft.adminName && draft.adminEmail && draft.modules.length > 0,
  );
}

/** The quick-create wizard (spec AC-032): one form, provisioning starts at once. */
export function CreateTenantPage() {
  const m = t().create;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});

  const create = useMutation({
    mutationFn: (cmd: CreateTenantCommand) => controlApi.createTenant(cmd),
    onSuccess: async (tenant) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tenants });
      await navigate({ to: '/tenants/$id', params: { id: tenant.id }, search: { tab: 'jobs' } });
    },
    onError: (error: unknown) => {
      const taken = error instanceof ControlApiError && error.code === SLUG_TAKEN;
      setErrors(
        taken
          ? { slug: m.slugTaken }
          : { form: error instanceof ControlApiError ? error.message : t().common.error },
      );
    },
  });

  function update(patch: Partial<Draft>): void {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.name !== undefined && !current.slugTouched)
        next.slug = suggestTenantSlug(patch.name);
      return next;
    });
  }

  function submit(): void {
    const parsed = CreateTenantCommand.safeParse(draftInput(draft));
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0] ?? 'form')] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  const ready = isComplete(draft) && !create.isPending;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={m.title} subtitle={m.subtitle} />
      <form
        className="grid gap-5 lg:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) submit();
        }}
      >
        <IdentityCard draft={draft} errors={errors} update={update} />
        <div className="flex flex-col gap-5">
          <ModulesCard draft={draft} errors={errors} update={update} />
          <BotTokenCard draft={draft} errors={errors} update={update} />
          {errors['form'] ? (
            <p role="alert" className="text-sm text-red-700">
              {errors['form']}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button asChild variant="outline">
              <Link to="/">{m.cancel}</Link>
            </Button>
            <Button type="submit" disabled={!ready}>
              {create.isPending ? m.submitting : m.submit}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function IdentityCard({ draft, errors, update }: DraftProps) {
  const m = t().create;
  const slug = draft.slug || '…';
  const hosts = {
    panel: HOST_PATTERNS.panel.replace('{slug}', slug),
    kiosk: HOST_PATTERNS.kiosk.replace('{slug}', slug),
    api: HOST_PATTERNS.api.replace('{slug}', slug),
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t().tenants.columns.tenant}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label={m.name} error={errors['name']}>
          <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label={m.slug} error={errors['slug']}>
          <Input
            value={draft.slug}
            onChange={(e) => update({ slug: e.target.value.toLowerCase(), slugTouched: true })}
          />
          <span className="text-xs font-normal text-muted-foreground">
            {fill(m.slugHint, hosts)}
          </span>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={m.locale}>
            <NativeSelect
              value={draft.defaultLocale}
              onChange={(e) => update({ defaultLocale: e.target.value as Locale })}
            >
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {LOCALE_LABEL[locale]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={m.timezone}>
            <NativeSelect
              value={draft.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <h3 className="mt-2 font-semibold">{m.adminTitle}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={m.adminName} error={errors['adminName']}>
            <Input
              value={draft.adminName}
              onChange={(e) => update({ adminName: e.target.value })}
            />
          </Field>
          <Field label={m.adminEmail} error={errors['adminEmail']}>
            <Input
              type="email"
              value={draft.adminEmail}
              onChange={(e) => update({ adminEmail: e.target.value })}
            />
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

function ModulesCard({ draft, errors, update }: DraftProps) {
  const m = t();
  const selected = new Set(draft.modules);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.create.modulesTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {DELIVERED_TENANT_MODULES.map((module) => (
          <label key={module} className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              checked={selected.has(module)}
              onCheckedChange={(checked) =>
                update({ modules: toggleModule(draft.modules, module, checked === true) })
              }
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{m.modules[module]}</span>
              <span className="text-sm text-muted-foreground">{m.moduleHints[module]}</span>
            </span>
          </label>
        ))}
        {errors['modules'] ? (
          <span className="text-xs text-red-700">{errors['modules']}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BotTokenCard({ draft, errors, update }: DraftProps) {
  const m = t().create;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {m.botTokenTitle}{' '}
          <span className="text-sm font-normal text-muted-foreground">{m.botTokenOptional}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field label={m.botTokenTitle} error={errors['botToken']}>
          <Input
            type="password"
            placeholder={m.botTokenPlaceholder}
            value={draft.botToken}
            onChange={(e) => update({ botToken: e.target.value.trim() })}
          />
        </Field>
        <p className="text-sm text-muted-foreground">{m.botTokenHint}</p>
      </CardContent>
    </Card>
  );
}
