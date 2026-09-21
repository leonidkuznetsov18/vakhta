import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ProvisioningJobView, TenantDetailView } from '@vakhta/contracts';
import { JobStatus, TenantStatus } from '@vakhta/domain';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { FailureState, LoadingState, PageHeader, StatusBadge } from '@/shared/ui';
import { AuditTab, BotTab, DangerTab, DatabaseTab, DomainsTab } from './workspace/details';
import { JobCard } from './workspace/jobs';
import { ModulesTab } from './workspace/modules';
import { OverviewTab } from './workspace/overview';
import { ParametersTab } from './workspace/parameters';
import { BrandingEditor } from '@/features/tenant-branding';

export type WorkspaceTab =
  | 'overview'
  | 'modules'
  | 'database'
  | 'bot'
  | 'domains'
  | 'parameters'
  | 'branding'
  | 'jobs'
  | 'audit'
  | 'danger';
export const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  'overview',
  'modules',
  'database',
  'bot',
  'domains',
  'parameters',
  'branding',
  'jobs',
  'audit',
  'danger',
];

function hasLiveJob(jobs: ProvisioningJobView[] | undefined): boolean {
  return Boolean(
    jobs?.some((j) => j.status === JobStatus.RUNNING || j.status === JobStatus.PENDING),
  );
}

/** The single place where every configuration of a tenant is visible and editable (spec US7). */
export function TenantWorkspacePage({ id, tab }: { id: string; tab: WorkspaceTab }) {
  const m = t();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tenant = useQuery({
    queryKey: queryKeys.tenant(id),
    queryFn: () => controlApi.tenant(id),
    refetchInterval: (query) =>
      query.state.data?.status === TenantStatus.PROVISIONING ? 2000 : false,
  });
  const jobs = useQuery({
    queryKey: queryKeys.jobs(id),
    queryFn: () => controlApi.jobs(id),
    refetchInterval: (query) => (hasLiveJob(query.state.data) ? 2000 : false),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tenant(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tenants }),
    ]);

  if (tenant.isPaused && !tenant.data)
    return <FailureState onRetry={() => void tenant.refetch()} />;
  if (tenant.isPending) return <LoadingState />;
  if (!tenant.data) return <FailureState onRetry={() => void tenant.refetch()} />;
  const detail = tenant.data;
  const panels: Record<WorkspaceTab, () => React.ReactElement> = {
    overview: () => <OverviewTab detail={detail} jobs={jobs.data ?? []} onChanged={refresh} />,
    modules: () => <ModulesTab detail={detail} onChanged={refresh} />,
    database: () => <DatabaseTab detail={detail} />,
    bot: () => <BotTab detail={detail} onChanged={refresh} />,
    domains: () => <DomainsTab detail={detail} onChanged={refresh} />,
    parameters: () => <ParametersTab tenantId={id} />,
    branding: () => <BrandingEditor tenantId={id} />,
    jobs: () => (
      <JobsPanel
        jobs={jobs.data}
        pending={jobs.isPending}
        failed={jobs.isError}
        onRetry={() => void jobs.refetch()}
        onChanged={refresh}
      />
    ),
    audit: () => <AuditTab id={id} />,
    danger: () => <DangerTab detail={detail} onChanged={refresh} />,
  };

  return (
    <div className="flex flex-col gap-5">
      {tenant.isError ? <FailureState onRetry={() => void tenant.refetch()} /> : null}
      <div className="text-sm text-muted-foreground">
        <Link to="/">{m.nav.tenants}</Link> / {detail.name}
      </div>
      <WorkspaceHeader detail={detail} />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          void navigate({
            to: '/tenants/$id',
            params: { id },
            search: { tab: next as WorkspaceTab },
            replace: true,
          })
        }
      >
        <TabsList className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto max-md:overflow-visible max-md:group-data-horizontal/tabs:h-auto">
          {WORKSPACE_TABS.map((key) => (
            <TabsTrigger key={key} value={key} className="h-9 flex-none px-3">
              {m.workspace.tabs[key]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {panels[tab]()}
    </div>
  );
}

function WorkspaceHeader({ detail }: { detail: TenantDetailView }) {
  const m = t();
  return (
    <PageHeader
      title={detail.name}
      subtitle={`${detail.slug} · ${detail.timezone} · ${detail.defaultLocale} · ${m.workspace.schemaVersion}: ${detail.schemaVersion ?? m.workspace.never}`}
      action={
        <div className="flex flex-wrap gap-2">
          <StatusBadge code={detail.status} label={m.status[detail.status]} />
          {detail.panelHost ? (
            <Button asChild variant="outline" size="sm">
              <a href={`https://${detail.panelHost}`} target="_blank" rel="noreferrer">
                {m.workspace.openPanel}
              </a>
            </Button>
          ) : null}
        </div>
      }
    />
  );
}

function JobsPanel({
  jobs,
  pending,
  failed,
  onRetry,
  onChanged,
}: {
  jobs: ProvisioningJobView[] | undefined;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const m = t().workspace;
  if (pending) return <LoadingState />;
  if (failed || !jobs) return <FailureState onRetry={onRetry} />;
  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">{m.noJobs}</p>;
  return (
    <div className="flex flex-col gap-4">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} onChanged={onChanged} />
      ))}
    </div>
  );
}
