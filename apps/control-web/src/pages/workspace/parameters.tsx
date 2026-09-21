import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  TENANT_SETTING_GROUPS,
  TENANT_SETTING_KEYS,
  TenantSettings,
  tenantSettingsProblems,
  type TenantSettingKey,
  type TenantSettingsView,
} from '@vakhta/contracts';
import { OperatorRole } from '@vakhta/domain';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ControlApiError, controlApi, queryKeys } from '@/shared/api';
import { fill, t } from '@/shared/i18n';
import { FailureState, LoadingState } from '@/shared/ui';
import { describeError } from './shared';

type Draft = Record<TenantSettingKey, string>;
/** Only the fields the operator typed in; the rest follow the latest server values. */
type Edits = Partial<Draft>;
type Changes = Partial<Record<TenantSettingKey, number | null>>;
const DATABASE_MISSING = 'TENANT_DATABASE_MISSING';
const INTEGER = /^-?\d+$/;

function draftOf(view: TenantSettingsView, edits: Edits): Draft {
  const entries = TENANT_SETTING_KEYS.map(
    (key) => [key, edits[key] ?? String(view.effective[key])] as const,
  );
  return Object.fromEntries(entries) as Draft;
}

function defaultEdits(view: TenantSettingsView): Edits {
  const entries = TENANT_SETTING_KEYS.map((key) => [key, String(view.defaults[key])] as const);
  return Object.fromEntries(entries) as Edits;
}

function atDefaults(draft: Draft, view: TenantSettingsView): boolean {
  return TENANT_SETTING_KEYS.every((key) => draft[key] === String(view.defaults[key]));
}

/** Removes stored rows the server could not apply, so the defaults become explicit again. */
function clearInvalidChanges(view: TenantSettingsView): Changes {
  const keys = view.invalid.filter((key): key is TenantSettingKey => LABEL_KEYS.has(key));
  return Object.fromEntries(keys.map((key) => [key, null] as const));
}

type FieldErrors = Map<TenantSettingKey, string>;

function rangeError(key: TenantSettingKey, raw: string): string | null {
  const m = t().settings;
  if (!INTEGER.test(raw.trim())) return m.notInteger;
  const schema = TenantSettings.shape[key];
  if (schema.safeParse(Number(raw)).success) return null;
  return fill(m.outOfRange, { min: schema.minValue ?? '', max: schema.maxValue ?? '' });
}

/** Field problems from the zod contract and the shared cross-field rule, before anything is sent. */
function fieldErrors(draft: Draft, view: TenantSettingsView): FieldErrors {
  const errors: FieldErrors = new Map();
  const values: TenantSettings = { ...view.effective };
  for (const key of TENANT_SETTING_KEYS) {
    const error = rangeError(key, draft[key]);
    if (error) errors.set(key, error);
    else values[key] = Number(draft[key]);
  }
  if (errors.size > 0) return errors;
  for (const key of tenantSettingsProblems(values)) errors.set(key, t().settings.qrTtlTooShort);
  return errors;
}

/** What to send: new values, and `null` where a value returns to the platform default. */
function changesOf(draft: Draft, view: TenantSettingsView): Changes {
  const changes: Changes = {};
  for (const key of TENANT_SETTING_KEYS) {
    const value = Number(draft[key]);
    if (!INTEGER.test(draft[key].trim()) || value === view.effective[key]) continue;
    changes[key] = value === view.defaults[key] ? null : value;
  }
  return changes;
}

/** The Parameters tab (spec AC-026–028): section-18 values of this tenant, edited in place. */
export function ParametersTab({ tenantId }: { tenantId: string }) {
  const m = t().settings;
  const me = useQuery({ queryKey: queryKeys.me, queryFn: controlApi.me });
  const query = useQuery({
    queryKey: queryKeys.settings(tenantId),
    queryFn: () => controlApi.settings(tenantId),
    retry: false,
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    const missing = query.error instanceof ControlApiError && query.error.code === DATABASE_MISSING;
    if (missing) return <p className="text-sm text-muted-foreground">{m.notProvisioned}</p>;
    return <FailureState onRetry={() => void query.refetch()} />;
  }
  const canEdit = me.data?.role === OperatorRole.PLATFORM_ADMIN;
  return <ParametersForm key={tenantId} tenantId={tenantId} view={query.data} canEdit={canEdit} />;
}

interface FormProps {
  tenantId: string;
  view: TenantSettingsView;
  canEdit: boolean;
}

function ParametersForm({ tenantId, view, canEdit }: FormProps) {
  const m = t().settings;
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Edits>({});
  const save = useMutation({
    mutationFn: (values: Changes) => controlApi.updateSettings(tenantId, { values }),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.settings(tenantId), next);
      toast.success(m.saved);
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  const draft = draftOf(view, edits);
  const errors = fieldErrors(draft, view);
  const changes = changesOf(draft, view);
  const dirty = Object.keys(changes).length > 0;
  const ready = canEdit && dirty && errors.size === 0 && !save.isPending;
  const busy = !canEdit || save.isPending;
  const update = (key: TenantSettingKey, value: string) =>
    setEdits((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        // Clearing invalid rows keeps unsaved input; only a full save empties it.
        if (ready) save.mutate(changes, { onSuccess: () => setEdits({}) });
      }}
    >
      <ParametersHeader
        view={view}
        canEdit={canEdit}
        clearDisabled={busy}
        onClearInvalid={() => save.mutate(clearInvalidChanges(view))}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(TENANT_SETTING_GROUPS).map(([group, keys]) => (
          <GroupCard
            key={group}
            title={m.groups[group as keyof typeof TENANT_SETTING_GROUPS]}
            keys={keys}
            draft={draft}
            view={view}
            errors={errors}
            disabled={busy}
            onChange={update}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy || atDefaults(draft, view)}
          onClick={() => setEdits(defaultEdits(view))}
        >
          {m.resetAll}
        </Button>
        <Button type="submit" disabled={!ready}>
          {m.save}
        </Button>
      </div>
    </form>
  );
}

const LABEL_KEYS = new Set<string>(TENANT_SETTING_KEYS);

/** Human labels for stored keys the server reported as invalid. */
function invalidLabels(keys: readonly string[]): string {
  const labels = t().settings.labels;
  return keys
    .map((key) => (LABEL_KEYS.has(key) ? labels[key as TenantSettingKey] : key))
    .join(', ');
}

interface HeaderProps {
  view: TenantSettingsView;
  canEdit: boolean;
  clearDisabled: boolean;
  onClearInvalid: () => void;
}

function ParametersHeader({ view, canEdit, clearDisabled, onClearInvalid }: HeaderProps) {
  const m = t().settings;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{m.title}</h2>
        <p className="text-sm text-muted-foreground">{m.hint}</p>
      </div>
      {view.invalid.length > 0 ? (
        <Alert variant="warning" className="border-orange-300">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            {fill(m.invalidStored, { keys: invalidLabels(view.invalid) })}
          </AlertDescription>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="col-start-2 mt-2 w-fit"
              disabled={clearDisabled}
              onClick={onClearInvalid}
            >
              {m.clearInvalid}
            </Button>
          ) : null}
        </Alert>
      ) : null}
      {canEdit ? null : (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>{m.readOnly}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

interface GroupProps {
  title: string;
  keys: readonly TenantSettingKey[];
  draft: Draft;
  view: TenantSettingsView;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (key: TenantSettingKey, value: string) => void;
}

function GroupCard({ title, keys, draft, view, errors, disabled, onChange }: GroupProps) {
  const m = t().settings;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {keys.map((key) => {
          const overridden = view.overrides[key] !== undefined;
          const atDefault = draft[key] === String(view.defaults[key]);
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  {m.labels[key]}
                  {overridden ? <Badge variant="secondary">{m.overridden}</Badge> : null}
                </span>
                <Input
                  className="w-24 text-right"
                  inputMode="numeric"
                  aria-invalid={errors.has(key)}
                  value={draft[key]}
                  disabled={disabled}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              </label>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{fill(m.defaultValue, { value: view.defaults[key] })}</span>
                {errors.has(key) ? <span className="text-red-700">{errors.get(key)}</span> : null}
                {atDefault || disabled ? null : (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => onChange(key, String(view.defaults[key]))}
                  >
                    {m.reset}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
