import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, ChevronRight, Circle, Minus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { ProvisioningJobView } from '@vakhta/contracts';
import { ProvisioningStep, StepStatus, isStepWaitingForOperator } from '@vakhta/domain';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { controlApi } from '@/shared/api';
import { currentLocale, fill, t } from '@/shared/i18n';
import { StatusBadge } from '@/shared/ui';
import { stepConfigurationTab } from './job-model';
import { describeError, type Refresh } from './shared';

type Step = ProvisioningJobView['steps'][number];
type StepAction = 'retry' | 'skip';
interface StepProps {
  step: Step;
  tenantId: string;
  pending: boolean;
  onAction: (action: StepAction) => void;
}
const DNS_INSTRUCTION = 'CREATE_DNS_RECORDS';
const DnsRecords = z.array(z.object({ host: z.string(), type: z.string(), target: z.string() }));

function canSkipStep(step: Step): boolean {
  return (
    step.step === ProvisioningStep.REGISTER_DOMAINS && step.status === StepStatus.MANUAL_REQUIRED
  );
}

export function JobCard({ job, onChanged }: { job: ProvisioningJobView; onChanged: Refresh }) {
  const m = t().jobs;
  const act = useMutation({
    mutationFn: ({ step, action }: { step: string; action: StepAction }) =>
      action === 'retry' ? controlApi.retryStep(job.id, step) : controlApi.skipStep(job.id, step),
    onSuccess: () => void onChanged(),
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  const done = job.steps.filter((s) => s.status === StepStatus.DONE).length;
  const skipped = job.steps.filter((s) => s.status === StepStatus.SKIPPED).length;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>
          {m.kinds[job.kind]} · {new Date(job.createdAt).toLocaleString(currentLocale())}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{fill(m.progress, { done, total: job.steps.length })}</span>
          {skipped > 0 ? <span>{fill(m.skippedCount, { count: skipped })}</span> : null}
          <StatusBadge code={job.status} label={m.status[job.status]} />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {job.steps.map((step) => (
            <JobStepItem
              key={step.step}
              step={step}
              tenantId={job.tenantId}
              pending={act.isPending}
              onAction={(action) => {
                if (!act.isPending) act.mutate({ step: step.step, action });
              }}
            />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function JobStepItem(props: StepProps) {
  const { step } = props;
  const m = t().jobs;
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-2 py-4 hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <StepMarker status={step.status} />
          <span className="min-w-0 flex-1 font-medium">{m.steps[step.step]}</span>
          <StatusBadge code={step.status} label={m.stepStatus[step.status]} />
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 group-open:rotate-90" />
        </summary>
        <div className="space-y-3 px-2 pb-4 sm:pl-11">
          {step.status === StepStatus.PENDING ? (
            <p className="text-sm text-muted-foreground">{m.pendingHint}</p>
          ) : null}
          {step.status === StepStatus.SKIPPED ? (
            <p className="text-sm text-muted-foreground">{m.skippedHint}</p>
          ) : null}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>{fill(m.attempts, { n: step.attempts })}</span>
            {step.startedAt ? (
              <span>
                {m.startedAt}: {new Date(step.startedAt).toLocaleString(currentLocale())}
              </span>
            ) : null}
            {step.finishedAt ? (
              <span>
                {m.finishedAt}: {new Date(step.finishedAt).toLocaleString(currentLocale())}
              </span>
            ) : null}
          </div>
          {step.lastError ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{m.stepStatus[StepStatus.FAILED]}</AlertTitle>
              <AlertDescription className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                {step.lastError}
              </AlertDescription>
            </Alert>
          ) : null}
          {step.status === StepStatus.MANUAL_REQUIRED ? (
            <ManualInstruction output={step.output} />
          ) : null}
          <StepActions {...props} />
        </div>
      </details>
    </li>
  );
}

function StepActions({ step, tenantId, pending, onAction }: StepProps) {
  const m = t().jobs;
  if (step.status === StepStatus.DONE) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link
          to="/tenants/$id"
          params={{ id: tenantId }}
          search={{ tab: stepConfigurationTab(step.step) }}
        >
          {m.configure}
        </Link>
      </Button>
      {isStepWaitingForOperator(step.status) ? (
        <Button type="button" size="sm" disabled={pending} onClick={() => onAction('retry')}>
          {m.retry}
        </Button>
      ) : null}
      {canSkipStep(step) ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onAction('skip')}
        >
          {m.skip}
        </Button>
      ) : null}
    </div>
  );
}

function StepMarker({ status }: { status: StepStatus }) {
  if (status === StepStatus.DONE)
    return (
      <Check
        aria-hidden="true"
        className="size-6 shrink-0 rounded-md bg-emerald-100 p-1 text-emerald-700"
      />
    );
  if (status === StepStatus.SKIPPED)
    return (
      <Minus
        aria-hidden="true"
        className="size-6 shrink-0 rounded-md bg-muted p-1 text-muted-foreground"
      />
    );
  return <Circle aria-hidden="true" className="size-6 shrink-0 p-0.5 text-muted-foreground" />;
}

function ManualInstruction({ output }: { output: Record<string, unknown> | null }) {
  const m = t().jobs;
  const parsed = DnsRecords.safeParse(output?.['records']);
  const isDns = output?.['instruction'] === DNS_INSTRUCTION;
  return (
    <Alert className="border-orange-200 bg-orange-50 text-orange-900">
      <TriangleAlert />
      <AlertTitle>{isDns ? m.manualDns : m.manualDatabase}</AlertTitle>
      {parsed.success ? (
        <AlertDescription>
          <pre className="mt-2 max-w-full overflow-x-auto rounded bg-white p-2 text-xs">
            {parsed.data.map((r) => `${r.type}  ${r.host}  →  ${r.target}`).join('\n')}
          </pre>
        </AlertDescription>
      ) : null}
    </Alert>
  );
}
