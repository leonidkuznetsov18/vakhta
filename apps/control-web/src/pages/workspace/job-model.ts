import type { TenantDetailView } from '@vakhta/contracts';
import { ProvisioningStep, TenantModule, TenantSecretKind } from '@vakhta/domain';

const STEP_TAB = {
  [ProvisioningStep.CREATE_DATABASE]: 'database',
  [ProvisioningStep.MIGRATE]: 'database',
  [ProvisioningStep.SEED_DEFAULTS]: 'parameters',
  [ProvisioningStep.STORAGE_PREFIX]: 'database',
  [ProvisioningStep.REGISTER_DOMAINS]: 'domains',
  [ProvisioningStep.BOT_WEBHOOK]: 'bot',
  [ProvisioningStep.INVITE_ADMIN]: 'overview',
  [ProvisioningStep.REMOVE_WEBHOOK]: 'bot',
  [ProvisioningStep.EVICT_RUNTIME]: 'modules',
  [ProvisioningStep.FINAL_BACKUP]: 'database',
  [ProvisioningStep.DROP_DATABASE]: 'danger',
  [ProvisioningStep.DROP_STORAGE]: 'danger',
} as const satisfies Record<ProvisioningStep, string>;

export function stepConfigurationTab(step: ProvisioningStep) {
  return STEP_TAB[step];
}

export function needsBotToken(detail: TenantDetailView): boolean {
  return (
    detail.modules.includes(TenantModule.WORKER_BOT) &&
    !detail.secrets.some((secret) => secret.kind === TenantSecretKind.BOT_TOKEN && secret.present)
  );
}
