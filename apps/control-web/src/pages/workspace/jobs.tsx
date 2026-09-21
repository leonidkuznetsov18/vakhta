import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ProvisioningJobView } from '@vakhta/contracts';
import {
  ProvisioningStep,
  StepStatus,
  isStepSettled,
  isStepWaitingForOperator,
} from '@vakhta/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { controlApi } from '@/shared/api';
import { fill, t } from '@/shared/i18n';
import { StatusBadge } from '@/shared/ui';
import { describeError, type Refresh } from './shared';

const DNS_INSTRUCTION = 'CREATE_DNS_RECORDS';

function canSkipStep(step: ProvisioningJobView['steps'][number]): boolean {
  return (
    step.step === ProvisioningStep.REGISTER_DOMAINS && step.status === StepStatus.MANUAL_REQUIRED
  );
}

/** Live steps of one job with the operator's retry and skip actions on waiting steps. */
export function JobCard({ job, onChanged }: { job: ProvisioningJobView; onChanged: Refresh }) {
  const m = t().jobs;
  const act = useMutation({
    mutationFn: ({ step, action }: { step: string; action: 'retry' | 'skip' }) =>
      action === 'retry' ? controlApi.retryStep(job.id, step) : controlApi.skipStep(job.id, step),
    onSuccess: () => void onChanged(),
    onError: (e: unknown) => toast.error(describeError(e)),
  });
  const done = job.steps.filter((s) => isStepSettled(s.status)).length;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>
          {m.kinds[job.kind]} · {new Date(job.createdAt).toLocaleString()}
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{fill(m.progress, { done, total: job.steps.length })}</span>
          <StatusBadge code={job.status} label={m.status[job.status]} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {job.steps.map((step) => (
          <div key={step.step} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.steps[step.step]}</span>
                <StatusBadge code={step.status} label={m.stepStatus[step.status]} />
                {step.attempts > 1 ? (
                  <span className="text-xs text-muted-foreground">
                    {fill(m.attempts, { n: step.attempts })}
                  </span>
                ) : null}
              </div>
              {step.lastError ? (
                <p className="mt-1 text-sm text-red-700">{step.lastError}</p>
              ) : null}
              {step.status === StepStatus.MANUAL_REQUIRED ? (
                <ManualInstruction output={step.output} />
              ) : null}
            </div>
            {isStepWaitingForOperator(step.status) ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ step: step.step, action: 'retry' })}
                >
                  {m.retry}
                </Button>
                {canSkipStep(step) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ step: step.step, action: 'skip' })}
                  >
                    {m.skip}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface DnsRecord {
  host: string;
  type: string;
  target: string;
}

function dnsRecords(output: Record<string, unknown> | null): DnsRecord[] {
  const raw = output?.['records'];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is DnsRecord =>
      typeof r === 'object' && r !== null && 'host' in r && 'target' in r && 'type' in r,
  );
}

function ManualInstruction({ output }: { output: Record<string, unknown> | null }) {
  const m = t().jobs;
  const records = dnsRecords(output);
  const isDns = output?.['instruction'] === DNS_INSTRUCTION;
  return (
    <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
      <p className="font-medium text-orange-800">{isDns ? m.manualDns : m.manualDatabase}</p>
      {records.length > 0 ? (
        <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs">
          {records.map((r) => `${r.type}  ${r.host}  →  ${r.target}`).join('\n')}
        </pre>
      ) : null}
    </div>
  );
}
