import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { ProvisioningJobView, TenantDetailView } from '@vakhta/contracts';
import { JobStatus, TenantSecretKind, TenantSurface } from '@vakhta/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { controlApi } from '@/shared/api';
import { t } from '@/shared/i18n';
import { JobCard } from './jobs';
import {
  CopyButton,
  InfoCard,
  describeError,
  primaryHosts,
  secretPresent,
  type Refresh,
} from './shared';

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
  const reissue = useMutation({
    mutationFn: () => controlApi.reissueInvitation(detail.id),
    onSuccess: async (result) => {
      await onChanged();
      toast.success(result.url);
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  const active = jobs.find(isActiveJob);
  const hosts = primaryHosts(detail);
  const hostOf = (surface: string) => hosts.get(surface) ?? '—';
  const webhook = secretPresent(detail, TenantSecretKind.BOT_WEBHOOK_SECRET) ? m.present : m.absent;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="bg-neutral-900 text-white lg:col-span-3">
        <CardHeader>
          <CardTitle>{m.onboardingTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">{m.onboardingHint}</p>
          {detail.onboarding ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-neutral-800 px-3 py-2 text-xs">
                {detail.onboarding.url}
              </code>
              <CopyButton value={detail.onboarding.url} />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={reissue.isPending}
                onClick={() => reissue.mutate()}
              >
                {m.reissue}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-neutral-300">{m.onboardingMissing}</p>
          )}
        </CardContent>
      </Card>
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
          <JobCard job={active} onChanged={onChanged} />
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
