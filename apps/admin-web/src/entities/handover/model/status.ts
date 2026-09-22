import type { HandoverStatus } from '@vakhta/domain';
import type { Tone } from '@/components/app/page';

/** The five states a reader acts on; every stored status maps onto one (spec 5.9). */
export type ShownHandoverStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REMARK' | 'SUPERSEDED';

export const HANDOVER_SHOWN_AS: Record<HandoverStatus, ShownHandoverStatus> = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  // Raised by the next shift, still waiting on the master: for the reader it is simply waiting.
  DISPUTED: 'SUBMITTED',
  // Accepted by the next shift, or by the master, or found to be nobody's fault: all approved.
  ACCEPTED: 'APPROVED',
  RESOLVED_ACCEPTED: 'APPROVED',
  RESOLVED_NO_FAULT: 'APPROVED',
  RESOLVED_ISSUE_CONFIRMED: 'REMARK',
  SUPERSEDED: 'SUPERSEDED',
};

export const HANDOVER_STATUS_TONE: Record<ShownHandoverStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  APPROVED: 'success',
  REMARK: 'danger',
  SUPERSEDED: 'neutral',
};
