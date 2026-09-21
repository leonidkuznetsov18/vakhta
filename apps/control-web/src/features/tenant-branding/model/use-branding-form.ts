import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BrandingErrorCode, type TenantBrandingView } from '@vakhta/contracts';
import { ControlApiError, controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import {
  brandingCommand,
  brandingDirty,
  brandingDraft,
  LogoProblem,
  readLogo,
  type BrandingDraft,
} from './draft';

function errorMessage(error: Error | null): string | null {
  if (!error) return null;
  const m = t().branding;
  if (!(error instanceof ControlApiError)) return m.failed;
  const errors: Record<string, string> = {
    [BrandingErrorCode.VERSION_CONFLICT]: m.conflict,
    [BrandingErrorCode.LOGO_INVALID]: m.invalidLogo,
    [BrandingErrorCode.LOGO_TOO_LARGE]: m.tooLarge,
    [BrandingErrorCode.STORAGE_UNAVAILABLE]: m.storageUnavailable,
  };
  return errors[error.code] ?? m.failed;
}
function fieldState(draft: BrandingDraft, view: TenantBrandingView) {
  const checked = brandingCommand(draft);
  return {
    checked,
    dirty: brandingDirty(draft, view),
    nameError: checked.error?.issues.some((issue) => issue.path[0] === 'displayName'),
    colorError: checked.error?.issues.some((issue) => issue.path[0] === 'accentColor'),
    colorValue: checked.success ? (checked.data.accentColor ?? '#171717') : '#171717',
  };
}

export function useBrandingForm(tenantId: string, view: TenantBrandingView, canEdit: boolean) {
  const client = useQueryClient();
  const [edits, setEdits] = useState<BrandingDraft | null>(null);
  const draft = edits ?? brandingDraft(view);
  const update = (patch: Partial<BrandingDraft>) =>
    setEdits((current) => ({ ...(current ?? brandingDraft(view)), ...patch }));
  const save = useMutation({
    mutationFn: controlApi.updateBranding.bind(null, tenantId),
    retry: false,
    networkMode: 'always',
    onSuccess: (next) => {
      client.setQueryData(queryKeys.branding(tenantId), next);
      setEdits(null);
      void client.invalidateQueries({ queryKey: queryKeys.tenant(tenantId) });
      void client.invalidateQueries({ queryKey: queryKeys.tenants });
      toast.success(t().branding.saved);
    },
  });
  const file = useMutation({ mutationFn: readLogo, retry: false, networkMode: 'always' });
  const discard = () => {
    setEdits(null);
    save.reset();
    file.reset();
  };
  const reload = useMutation({
    mutationFn: () => controlApi.branding(tenantId),
    retry: false,
    networkMode: 'always',
    onSuccess: (next) => {
      client.setQueryData(queryKeys.branding(tenantId), next);
      discard();
    },
  });
  const state = fieldState(draft, view);
  const busy = save.isPending || file.isPending || reload.isPending;
  const disabled = !canEdit || busy;
  const canSave = !disabled && state.dirty && state.checked.success;
  const chooseLogo = (selected: File | undefined) => {
    if (selected && !disabled) file.mutate(selected, { onSuccess: update });
  };
  return {
    ...state,
    draft,
    busy,
    disabled,
    canSave,
    canDiscard: !disabled && (state.dirty || file.isError),
    conflict: isVersionConflict(save.error),
    error: errorMessage(reload.error ?? save.error),
    fileError: logoError(file.error),
    update,
    discard,
    chooseLogo,
    removeLogo: () => {
      update({ logo: null, logoUrl: null });
      file.reset();
    },
    reload: () => reload.mutate(),
    submit: () => {
      if (canSave && state.checked.success) save.mutate(state.checked.data);
    },
  };
}
function isVersionConflict(error: Error | null): boolean {
  return error instanceof ControlApiError && error.code === BrandingErrorCode.VERSION_CONFLICT;
}
function logoError(error: Error | null): string | null {
  if (!error) return null;
  return error.message === LogoProblem.TOO_LARGE ? t().branding.tooLarge : t().branding.invalidLogo;
}
export type BrandingFormModel = ReturnType<typeof useBrandingForm>;
