/** Safe diagnostic text only; provider errors may contain credentials. */
export class RetryableProvisioningError extends Error {}
export const PROVISIONING_RETRY_LIMIT = 4;
export const PROVISIONING_RETRY_DELAY_MS = 2_000;
