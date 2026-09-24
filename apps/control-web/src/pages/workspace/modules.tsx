import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DELIVERED_TENANT_MODULES, TenantModule } from '@vakhta/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { TriangleAlert } from 'lucide-react';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { describeError, type Refresh, type TabProps } from './shared';

export function ModulesTab({ detail, onChanged }: TabProps) {
  const enabledOf = new Map(detail.moduleRows.map((row) => [row.module, row.enabled]));
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {DELIVERED_TENANT_MODULES.map((module) => (
        <ModuleCard
          key={module}
          tenantId={detail.id}
          module={module}
          enabled={enabledOf.get(module) ?? false}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

type DeliveredModule = (typeof DELIVERED_TENANT_MODULES)[number];

interface ModuleCardProps {
  tenantId: string;
  module: DeliveredModule;
  enabled: boolean;
  onChanged: Refresh;
}

/** Each card owns its save so one toggle never dims or re-styles the other checkboxes. */
function ModuleCard({ tenantId, module, enabled, onChanged }: ModuleCardProps) {
  const m = t();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (next: boolean) => controlApi.setModule(tenantId, module, { enabled: next }),
    onSuccess: (next) => {
      // The response is the saved detail: show it at once so the checkbox never
      // falls back to the old state while the list refetches.
      queryClient.setQueryData(queryKeys.tenant(tenantId), next);
      void onChanged();
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  const saving = toggle.isPending;
  const checked = saving ? toggle.variables : enabled;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>{m.modules[module]}</CardTitle>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="relative inline-flex shrink-0">
                <Checkbox
                  aria-label={m.modules[module]}
                  aria-busy={saving}
                  className="size-6 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 hover:border-emerald-600 active:opacity-80 aria-busy:cursor-progress aria-busy:opacity-40 [&_[data-slot=checkbox-indicator]>svg]:size-4"
                  checked={checked}
                  onCheckedChange={(next) => {
                    if (saving || (next === true) === enabled) return;
                    toggle.mutate(next === true);
                  }}
                />
                {saving ? (
                  <Spinner
                    aria-label={m.tenantActions.saving}
                    className="pointer-events-none absolute inset-0 m-auto text-emerald-700"
                  />
                ) : null}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {enabled ? m.workspace.disableModule : m.workspace.enableModule}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {m.moduleHints[module]}
        {module === TenantModule.ADMIN_PANEL && !enabled ? (
          <Alert className="mt-3 border-orange-200 bg-orange-50 text-orange-900">
            <TriangleAlert />
            <AlertTitle>{m.workspace.adminPanelRequired}</AlertTitle>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
