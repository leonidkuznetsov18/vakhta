import { TenantAdministrators } from '@/features/tenant-administrators';
import { Link } from '@tanstack/react-router';
import type { ProvisioningJobView, TenantDetailView } from '@vakhta/contracts';
import { JobStatus, TenantSecretKind, TenantSurface } from '@vakhta/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/shared/i18n';
import { TenantChecklist } from './jobs';
import { OnboardingCard } from './onboarding';
import { InfoCard, primaryHosts, secretPresent, type Refresh } from './shared';

function isActiveJob(job: ProvisioningJobView): boolean {
  return job.status === JobStatus.RUNNING || job.status === JobStatus.PENDING;
}

export function OverviewTab({
  detail,
  jobs,
  onChanged,
}: {
  detail: TenantDetailView;
  jobs: ProvisioningJobView[];
  onChanged: Refresh;
}) {
  const m = t().workspace;
  const active = jobs.find(isActiveJob);
  const hosts = primaryHosts(detail);
  const hostOf = (surface: string) => hosts.get(surface) ?? '—';
  const webhook = secretPresent(detail, TenantSecretKind.BOT_WEBHOOK_SECRET) ? m.present : m.absent;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <OnboardingCard detail={detail} onChanged={onChanged} />
      <TenantAdministrators key={detail.id} tenantId={detail.id} />
      <InfoCard
        title={m.database}
        lines={[detail.databaseName, `${m.schemaVersion}: ${detail.schemaVersion ?? m.never}`]}
      />
      <InfoCard
        title={m.bot}
        lines={[
          detail.botUsername ? `@${detail.botUsername}` : m.botMissing,
          `${m.webhookSecret}: ${webhook}`,
        ]}
      />
      <InfoCard title={m.kiosk} lines={[hostOf(TenantSurface.KIOSK)]} />
      <InfoCard title={m.panel} lines={[hostOf(TenantSurface.PANEL)]} />
      <InfoCard title={m.api} lines={[hostOf(TenantSurface.API)]} />
      <BrandingCard detail={detail} />
      {active ? (
        <div className="min-w-0 lg:col-span-3">
          <TenantChecklist detail={detail} jobs={jobs} onChanged={onChanged} />
        </div>
      ) : null}
    </div>
  );
}

function BrandingCard({ detail }: { detail: TenantDetailView }) {
  const m = t().workspace;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.branding}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>{detail.displayName}</p>
        <div className="flex items-center gap-2">
          {detail.accentColor ? (
            <span
              aria-hidden="true"
              className="size-4 rounded-full border"
              style={{ background: detail.accentColor }}
            />
          ) : null}
          <span className="text-sm text-muted-foreground">
            {detail.accentColor ?? t().branding.defaultColor}
          </span>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link to="/tenants/$id" params={{ id: detail.id }} search={{ tab: 'branding' }}>
            {t().branding.edit}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
