import { useQuery } from '@tanstack/react-query';
import { OperatorRole } from '@vakhta/domain';
import type { TenantBrandingView } from '@vakhta/contracts';
import { Button } from '@/components/ui/button';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { FailureState, LoadingState } from '@/shared/ui';
import { useBrandingForm } from '../model/use-branding-form';
import { BrandingPreview } from './branding-preview';
import { BrandingFields } from './branding-fields';
import { FieldError } from './field-error';

export function BrandingEditor({ tenantId }: { tenantId: string }) {
  const me = useQuery({ queryKey: queryKeys.me, queryFn: controlApi.me });
  const query = useQuery({
    queryKey: queryKeys.branding(tenantId),
    queryFn: () => controlApi.branding(tenantId),
  });
  if (query.isPaused && !query.data)
    return <FailureState message={t().branding.offline} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <LoadingState />;
  if (!query.data) return <FailureState onRetry={() => void query.refetch()} />;
  return (
    <div className="grid gap-4">
      {query.isError ? <FailureState onRetry={() => void query.refetch()} /> : null}
      {query.isPaused ? <FieldError message={t().branding.offline} /> : null}
      <BrandingForm
        key={tenantId}
        tenantId={tenantId}
        view={query.data}
        canEdit={me.data?.role === OperatorRole.PLATFORM_ADMIN}
        refreshing={query.isFetching}
      />
    </div>
  );
}

function BrandingForm({
  tenantId,
  view,
  canEdit,
  refreshing,
}: {
  tenantId: string;
  view: TenantBrandingView;
  canEdit: boolean;
  refreshing: boolean;
}) {
  const m = t().branding;
  const form = useBrandingForm(tenantId, view, canEdit);
  return (
    <form
      noValidate
      className="flex w-full min-w-0 max-w-6xl flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        form.submit();
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">{m.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{m.hint}</p>
      </div>
      {!canEdit ? <p className="text-sm text-muted-foreground">{m.readOnly}</p> : null}
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <BrandingFields form={form} />
        <BrandingPreview
          name={form.draft.displayName}
          logoUrl={form.draft.logoUrl}
          color={form.draft.accentColor}
        />
      </div>
      {form.error ? <FieldError message={form.error} /> : null}
      {form.conflict ? (
        <Button type="button" variant="outline" disabled={form.busy} onClick={form.reload}>
          {m.reload}
        </Button>
      ) : null}
      {form.busy || refreshing ? <LoadingState /> : null}
      <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" disabled={!form.canDiscard} onClick={form.discard}>
          {m.reset}
        </Button>
        <Button type="submit" disabled={!form.canSave}>
          {m.save}
        </Button>
      </div>
    </form>
  );
}
