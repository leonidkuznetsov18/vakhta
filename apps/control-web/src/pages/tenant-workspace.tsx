import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ProvisioningJobView, TenantDetailView } from '@vakhta/contracts';
import { JobStatus, TenantStatus } from '@vakhta/domain';
import { ExternalLink, Menu, Check } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { TenantStatusDot } from '@/entities/tenant';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { FailureState, LoadingState, PageHeader, IconButton } from '@/shared/ui';
import { AuditTab, BotTab, DangerTab } from './workspace/details';
import { DatabaseTab } from './workspace/database';
import { DomainsTab } from './workspace/domains';
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
    domains: () => <DomainsTab detail={detail} />,
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
      <WorkspaceBreadcrumbs name={detail.name} />
      <WorkspaceHeader detail={detail} />
      <WorkspaceNavigation id={id} tab={tab} />
      {panels[tab]()}
    </div>
  );
}

function WorkspaceNavigation({ id, tab }: { id: string; tab: WorkspaceTab }) {
  const m = t();
  const navigate = useNavigate();
  const select = (value: string) => {
    const next = WORKSPACE_TABS.find((key) => key === value);
    if (next)
      void navigate({ to: '/tenants/$id', params: { id }, search: { tab: next }, replace: true });
  };
  return (
    <>
      <div className="md:hidden">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start gap-3"
              aria-label={`${m.nav.menu}: ${m.workspace.tabs[tab]}`}
            >
              <Menu aria-hidden="true" />
              {m.workspace.tabs[tab]}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={6}
              className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              {WORKSPACE_TABS.map((key) => (
                <DropdownMenu.Item key={key} asChild>
                  <Link
                    to="/tenants/$id"
                    params={{ id }}
                    search={{ tab: key }}
                    replace
                    aria-current={key === tab ? 'page' : undefined}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-md px-3 text-sm outline-none hover:bg-accent focus:bg-accent active:bg-accent data-highlighted:bg-accent"
                  >
                    {m.workspace.tabs[key]}
                    {key === tab ? <Check aria-hidden="true" className="size-4" /> : null}
                  </Link>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <Tabs value={tab} onValueChange={select} className="hidden md:block">
        <TabsList className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto">
          {WORKSPACE_TABS.map((key) => (
            <TabsTrigger key={key} value={key} className="h-9 flex-none px-3">
              {m.workspace.tabs[key]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </>
  );
}

function WorkspaceBreadcrumbs({ name }: { name: string }) {
  const m = t();
  return (
    <nav
      aria-label={m.workspace.breadcrumbs}
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Link to="/" className="control-link">
        {m.nav.tenants}
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{name}</span>
    </nav>
  );
}

function WorkspaceHeader({ detail }: { detail: TenantDetailView }) {
  const m = t();
  return (
    <PageHeader
      title={detail.name}
      subtitle={`${detail.slug} · ${detail.timezone} · ${detail.defaultLocale} · ${m.workspace.schemaVersion}: ${detail.schemaVersion ?? m.workspace.never}`}
      action={
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {detail.panelHost ? (
            <IconButton
              asChild
              variant="outline"
              size="icon"
              icon={ExternalLink}
              label={m.workspace.openPanel}
              tooltip={m.workspace.openPanel}
            >
              <a href={`https://${detail.panelHost}`} target="_blank" rel="noreferrer"></a>
            </IconButton>
          ) : null}
          <TenantStatusDot status={detail.status} />
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
