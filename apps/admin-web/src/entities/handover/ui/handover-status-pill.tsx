import type { HandoverStatus } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { StatusPill } from '@/components/app/page';
import { currentLocale } from '@/i18n';
import { HANDOVER_SHOWN_AS, HANDOVER_STATUS_TONE } from '../model/status';

/** How a handover report ended, in the reader's five words with the matching colour. */
export function HandoverStatusPill({ status }: { readonly status: HandoverStatus }) {
  const shown = HANDOVER_SHOWN_AS[status];
  return (
    <StatusPill tone={HANDOVER_STATUS_TONE[shown]}>
      {messages(currentLocale()).admin.handover.shown[shown]}
    </StatusPill>
  );
}
