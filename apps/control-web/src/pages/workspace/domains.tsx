import type { TenantDetailView } from '@vakhta/contracts';
import { TenantSurface } from '@vakhta/domain';
import { ChevronRight, ExternalLink, Globe } from 'lucide-react';
import { currentLocale, fill, t } from '@/shared/i18n';
import { IconButton, StatusBadge } from '@/shared/ui';
import { DetailList } from '@/shared/ui/detail-list';

export function DomainsTab({ detail }: { detail: TenantDetailView }) {
  const m = t().workspace;
  const surfaceLabel = {
    [TenantSurface.PANEL]: m.panel,
    [TenantSurface.API]: m.api,
    [TenantSurface.KIOSK]: m.kiosk,
  };
  return (
    <div className="min-w-0 rounded-xl border bg-card">
      {detail.domains.map((domain) => (
        <details key={domain.id} className="group border-b last:border-b-0">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-lg p-4 hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words font-medium [overflow-wrap:anywhere]">
              {domain.host}
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                {surfaceLabel[domain.surface]}
              </span>
            </span>
            <StatusBadge code={domain.status} label={m.domainStatus[domain.status]} />
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 group-open:rotate-90" />
          </summary>
          <div className="space-y-5 border-t bg-muted/20 p-4 sm:p-6">
            <DetailList
              rows={[
                {
                  label: m.technical.url,
                  value: (
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 break-all">https://{domain.host}</span>
                      <IconButton
                        asChild
                        icon={ExternalLink}
                        size="icon-sm"
                        variant="outline"
                        label={m.technical.openDomain}
                        tooltip={m.technical.openDomain}
                      >
                        <a href={`https://${domain.host}`} target="_blank" rel="noreferrer" />
                      </IconButton>
                    </span>
                  ),
                },
                {
                  label: m.technical.verifiedAt,
                  value: domain.verifiedAt
                    ? new Date(domain.verifiedAt).toLocaleString(currentLocale())
                    : m.never,
                },
                { label: m.technical.management, value: domain.isManaged ? m.managed : m.custom },
                { label: m.primary, value: domain.isPrimary ? t().common.yes : t().common.no },
                { label: m.technical.domainId, value: domain.id },
                { label: m.technical.tenantId, value: detail.id },
              ]}
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {m.technical.domainHint}
            </p>
          </div>
        </details>
      ))}
      <div className="border-t px-4 py-3 text-sm text-muted-foreground">
        {fill(m.technical.domainCount, { count: detail.domains.length })}
      </div>
    </div>
  );
}
