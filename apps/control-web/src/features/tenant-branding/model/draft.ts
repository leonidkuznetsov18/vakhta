import {
  TENANT_LOGO_MAX_BYTES,
  UpdateTenantBrandingCommand,
  type TenantBrandingView,
} from '@vakhta/contracts';

export interface BrandingDraft {
  displayName: string;
  accentColor: string;
  logo: string | null | undefined;
  logoUrl: string | null;
  expectedVersion: string;
}
export function brandingDraft(view: TenantBrandingView): BrandingDraft {
  return {
    displayName: view.displayName,
    accentColor: view.accentColor ?? '',
    logo: undefined,
    logoUrl: view.logoUrl,
    expectedVersion: view.updatedAt,
  };
}
export function brandingCommand(draft: BrandingDraft) {
  return UpdateTenantBrandingCommand.safeParse({
    displayName: draft.displayName,
    accentColor: draft.accentColor.trim().toLowerCase() || null,
    expectedVersion: draft.expectedVersion,
    ...(draft.logo === undefined ? {} : { logo: draft.logo }),
  });
}
export function brandingDirty(draft: BrandingDraft, view: TenantBrandingView): boolean {
  return (
    draft.displayName.trim() !== view.displayName ||
    (draft.accentColor.trim().toLowerCase() || null) !== view.accentColor ||
    (draft.logo !== undefined && (draft.logo !== null || view.logoUrl !== null))
  );
}
export const LogoProblem = { INVALID: 'INVALID', TOO_LARGE: 'TOO_LARGE' } as const;
export async function readLogo(file: File): Promise<{ logo: string; logoUrl: string }> {
  if (file.size > TENANT_LOGO_MAX_BYTES) throw new Error(LogoProblem.TOO_LARGE);
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error(LogoProblem.INVALID);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(LogoProblem.INVALID));
    reader.onload = () => {
      if (typeof reader.result !== 'string') return reject(new Error(LogoProblem.INVALID));
      const logo = reader.result.split(',')[1];
      if (!logo) return reject(new Error(LogoProblem.INVALID));
      resolve({ logo, logoUrl: reader.result });
    };
    reader.readAsDataURL(file);
  });
}
