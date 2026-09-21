import type { ProvisioningJobView, TenantDetailView } from '@vakhta/contracts';
import { OperatorRole } from '@vakhta/domain';
import type { Operator } from './operator.guard.js';

/** Onboarding links grant tenant access, so read-only operators must never receive them. */
export function tenantForOperator(detail: TenantDetailView, operator: Operator): TenantDetailView {
  if (operator.role === OperatorRole.PLATFORM_ADMIN) return detail;
  return { ...detail, onboarding: null };
}

export function jobForOperator(job: ProvisioningJobView, operator: Operator): ProvisioningJobView {
  if (operator.role === OperatorRole.PLATFORM_ADMIN) return job;
  return {
    ...job,
    steps: job.steps.map((step) => ({ ...step, output: publicOutput(step.output) })),
  };
}

function publicOutput(output: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!output) return null;
  const result = { ...output };
  delete result['onboardingUrl'];
  return result;
}
