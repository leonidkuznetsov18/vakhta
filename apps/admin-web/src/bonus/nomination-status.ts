import type { BonusPointsView } from '@vakhta/contracts';
import { format, messages, type Locale } from '@vakhta/i18n';

/** Presentation stays outside the page; a missing site closure is always preliminary. */
export function nominationStatus(data: BonusPointsView | null, locale: Locale): string | null {
  if (!data) return null;
  const labels = messages(locale).admin.bonus;
  if (!data.finalizedAt) return labels.nominationsPreliminary;
  return format(labels.nominationsFinal, {
    at: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(data.finalizedAt),
    ),
  });
}
