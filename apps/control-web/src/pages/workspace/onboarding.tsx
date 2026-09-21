import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { OperatorRole } from '@vakhta/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { controlApi, queryKeys } from '@/shared/api';
import { t } from '@/shared/i18n';
import { CopyButton, describeError, type TabProps } from './shared';

export function OnboardingCard({ detail, onChanged }: TabProps) {
  const m = t().workspace;
  const me = useQuery({ queryKey: queryKeys.me, queryFn: controlApi.me });
  const reissue = useMutation({
    mutationFn: () => controlApi.reissueInvitation(detail.id),
    onSuccess: async () => {
      await onChanged();
    },
    onError: (error: unknown) => toast.error(describeError(error)),
  });
  if (detail.onboarding?.usedAt) return null;
  if (!detail.onboarding && me.data?.role !== OperatorRole.PLATFORM_ADMIN) return null;
  return (
    <Card className="min-w-0 gap-4 border-sky-200 border-l-4 border-l-sky-600 bg-sky-50 lg:col-span-3 dark:border-sky-800 dark:border-l-sky-400 dark:bg-sky-950/40">
      <CardHeader className="flex flex-row items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">
            {m.onboardingFirstStep}
          </p>
          <CardTitle className="text-xl leading-snug text-sky-950 dark:text-sky-100">
            {m.onboardingTitle}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <p className="max-w-3xl text-sm leading-relaxed text-sky-950 dark:text-sky-100">
          {m.onboardingHint}
        </p>
        {detail.onboarding ? (
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
              {detail.onboarding.url}
            </code>
            <CopyButton value={detail.onboarding.url} />
            <Button
              type="button"
              variant="outline"
              disabled={reissue.isPending}
              onClick={() => {
                if (!reissue.isPending) reissue.mutate();
              }}
            >
              {m.reissue}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-sky-200 bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-sky-800 dark:bg-sky-950/60">
            <p className="text-sm text-sky-900 dark:text-sky-200">{m.onboardingMissing}</p>
            <Button asChild className="bg-sky-700 text-white hover:bg-sky-800 active:bg-sky-900">
              <Link to="/tenants/$id" params={{ id: detail.id }} search={{ tab: 'jobs' }}>
                {m.onboardingTasks}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
