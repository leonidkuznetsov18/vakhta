import type { IncidentDetailView, IncidentView } from '@vakhta/contracts';

/** Remove repeated presentation only; retain distinct reports and historical decisions. */
export function incidentDetailView(
  row: IncidentView,
  detail: IncidentDetailView | null,
  readOnly: boolean,
) {
  const source = detail?.incident.id === row.id ? detail : null;
  const reports = (source?.reports ?? []).map((report, index) => ({
    ...report,
    showAuthor: index !== 0 || report.fullName !== row.reportedBy,
    showTime: index !== 0 || Date.parse(report.reportedAt) !== Date.parse(row.openedAt),
  }));
  const history = (source?.history ?? [])
    .filter(
      (event) =>
        !(
          event.fromStatus === null &&
          event.toStatus === 'REPORTED' &&
          Date.parse(event.at) === Date.parse(row.openedAt) &&
          !event.comment &&
          !event.rootCause &&
          !event.resolution
        ),
    )
    .map((event) => ({
      ...event,
      rootCause: readOnly && event.rootCause === row.rootCause ? null : event.rootCause,
      resolution: readOnly && event.resolution === row.resolution ? null : event.resolution,
    }));
  const legacyComment =
    row.lastComment &&
    ![
      ...reports.map((report) => report.comment),
      ...history.map((event) => event.comment),
      row.rootCause,
      row.resolution,
    ].includes(row.lastComment)
      ? row.lastComment
      : null;
  return { reports, history, legacyComment };
}
