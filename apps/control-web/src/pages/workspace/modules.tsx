import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DELIVERED_TENANT_MODULES, TENANT_MODULES, TenantModule } from '@vakhta/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { controlApi } from '@/shared/api';
import { t } from '@/shared/i18n';
import { describeError, type TabProps } from './shared';

type Delivered = (typeof DELIVERED_TENANT_MODULES)[number];
const DELIVERED = new Set<string>(DELIVERED_TENANT_MODULES);

function hintFor(module: string): string {
  const m = t();
  return DELIVERED.has(module) ? m.moduleHints[module as Delivered] : m.reserved;
}

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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {TENANT_MODULES.map((module) => {
        const enabled = enabledOf.get(module) ?? false;
        return (
          <Card key={module} className={DELIVERED.has(module) ? '' : 'border-dashed opacity-70'}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{m.modules[module]}</CardTitle>
              {DELIVERED.has(module) ? (
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={enabled}
                    disabled={toggle.isPending}
                    onCheckedChange={(checked) =>
                      toggle.mutate({ module, enabled: checked === true })
                    }
                  />
                  {enabled ? m.workspace.enabled : m.workspace.disabled}
                </label>
              ) : null}
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {hintFor(module)}
              {module === TenantModule.ADMIN_PANEL && !enabled ? (
                <p className="mt-2 text-orange-700">{m.workspace.adminPanelRequired}</p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
