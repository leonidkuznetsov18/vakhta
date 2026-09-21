import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DELIVERED_TENANT_MODULES, TenantModule } from '@vakhta/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { TriangleAlert } from 'lucide-react';
import { controlApi } from '@/shared/api';
import { t } from '@/shared/i18n';
import { describeError, type TabProps } from './shared';

export function ModulesTab({ detail, onChanged }: TabProps) {
  const m = t();
  const toggle = useMutation({
    mutationFn: ({ module, enabled }: { module: string; enabled: boolean }) =>
      controlApi.setModule(detail.id, module, { enabled }),
    onSuccess: () => void onChanged(),
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  const enabledOf = new Map(detail.moduleRows.map((row) => [row.module, row.enabled]));
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {DELIVERED_TENANT_MODULES.map((module) => {
        const enabled = enabledOf.get(module) ?? false;
        return (
          <Card key={module}>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>{m.modules[module]}</CardTitle>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex shrink-0">
                      <Checkbox
                        aria-label={m.modules[module]}
                        className="size-6 data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 hover:border-emerald-600 active:opacity-80 [&_[data-slot=checkbox-indicator]>svg]:size-4"
                        checked={enabled}
                        disabled={toggle.isPending}
                        onCheckedChange={(checked) => {
                          if (toggle.isPending || (checked === true) === enabled) return;
                          toggle.mutate({ module, enabled: checked === true });
                        }}
                      />
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
      })}
    </div>
  );
}
