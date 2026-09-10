import type { LossesQuery, LossesView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import type { Locale } from '@vakhta/domain';
import { formatDateTime } from '@/lib/format';

/** Prepared notices and download parameters; the view only renders the selected report state. */
export function reportPresentation(
  data: LossesView | null,
  query: LossesQuery,
  locale: Locale,
  queryFailed: boolean,
) {
  const t = messages(locale).admin.reports;
  if (!data)
    return { asOf: null, count: null, truncation: null, exportWarning: null, exportQuery: null };
  const exportWarning =
    data.intervalsTotal > data.exportLimit
      ? format(t.lossExportTooLarge, { limit: data.exportLimit })
      : null;
  return {
    asOf: format(t.lossAsOf, { at: formatDateTime(data.asOf) }),
    count: data.category
      ? format(t.lossRowsShown, { shown: data.intervals.length, total: data.intervalsTotal })
      : null,
    truncation: data.intervalsTruncated
      ? format(t.lossTruncated, { limit: data.intervalsLimit })
      : null,
    exportWarning,
    // Query retains earlier data after refetch failure; it cannot authorize a current download.
    exportQuery: queryFailed || exportWarning ? null : { ...query, asOf: data.asOf },
  };
}
