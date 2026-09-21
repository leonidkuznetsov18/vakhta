import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { brandPalette } from '@vakhta/tenant-client';
import { TenantAccentColor } from '@vakhta/contracts';
import { t } from '@/shared/i18n';

export function BrandingPreview({
  name,
  logoUrl,
  color,
}: {
  name: string;
  logoUrl: string | null;
  color: string;
}) {
  const parsed = TenantAccentColor.safeParse(color.trim().toLowerCase());
  const palette = brandPalette(parsed.success ? parsed.data : '#171717');
  const m = t().branding;
  return (
    <section aria-label={m.preview} className="min-w-0 rounded-xl border bg-muted/30 p-5 sm:p-8">
      <h3 className="mb-6 text-sm font-medium text-muted-foreground">{m.preview}</h3>
      <div
        className="mx-auto flex max-w-sm min-w-0 flex-col gap-6 rounded-xl border bg-background p-6 shadow-sm"
        style={{ borderTop: `4px solid ${palette.accent}` }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <PreviewLogo key={logoUrl} url={logoUrl} />
          <p className="min-w-0 text-xl font-semibold [overflow-wrap:anywhere]">
            {name.trim() || '—'}
          </p>
        </div>
        <div
          className="rounded-md px-4 py-2.5 text-center text-sm font-medium"
          style={{ background: palette.onLight, color: '#ffffff' }}
        >
          {m.previewAction}
        </div>
      </div>
    </section>
  );
}
function PreviewLogo({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed)
    return <Building2 aria-hidden="true" className="size-12 shrink-0 rounded-lg bg-muted p-2" />;
  return (
    <img
      src={url}
      alt=""
      className="size-12 shrink-0 rounded-md object-contain"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
