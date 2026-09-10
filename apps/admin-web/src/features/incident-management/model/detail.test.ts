import { describe, expect, it } from 'vitest';
import type {
  IncidentDetailView,
  IncidentHistoryView,
  IncidentView,
  ReportView,
} from '@vakhta/contracts';
import { incidentDetailView } from './detail';

const row: IncidentView = {
  id: 'incident',
  siteId: null,
  orgUnitId: null,
  zoneId: null,
  zoneName: null,
  reasonCode: 'BREAKDOWN',
  reasonLabel: 'Breakdown',
  severity: 'NORMAL',
  status: 'RESOLVED',
  duplicateOfId: null,
  assigneeId: null,
  openedAt: '2026-09-10T10:00:00Z',
  slaDueAt: '2026-09-10T11:00:00Z',
  acknowledgedAt: null,
  resolvedAt: null,
  closedAt: null,
  escalatedAt: null,
  slaBreached: false,
  reportedBy: 'Worker',
  reportsCount: 1,
  stoppedNow: 0,
  lastComment: 'Legacy solution',
  rootCause: 'Worn bearing',
  resolution: 'Replaced bearing',
};
const report: ReportView = {
  id: 'report',
  incidentId: row.id,
  shiftSessionId: null,
  employeeId: 'worker',
  fullName: 'Worker',
  zoneId: null,
  reasonCode: 'BREAKDOWN',
  comment: 'Machine stopped',
  stoppedWork: true,
  reportedAt: row.openedAt,
  hasPhoto: true,
  media: null,
};
const opening: IncidentHistoryView = {
  id: 'opening',
  fromStatus: null,
  toStatus: 'REPORTED',
  actorType: 'EMPLOYEE',
  actorId: 'worker',
  at: row.openedAt,
  comment: null,
  rootCause: null,
  resolution: null,
};
const decision: IncidentHistoryView = {
  ...opening,
  id: 'decision',
  fromStatus: 'REPORTED',
  toStatus: 'RESOLVED',
  at: '2026-09-10T11:00:00Z',
  actorType: 'WEB_USER',
  comment: row.lastComment,
  rootCause: row.rootCause,
  resolution: row.resolution,
};
const detail: IncidentDetailView = {
  incident: row,
  reports: [report],
  history: [opening, decision],
  duplicates: [],
  serverTime: row.openedAt,
};

describe('incident detail presentation', () => {
  it('shows preview metadata and current decision text once while retaining the decision event', () => {
    const view = incidentDetailView(row, detail, true);
    expect(view.reports[0]).toMatchObject({
      showAuthor: false,
      showTime: false,
      comment: report.comment,
    });
    expect(view.history).toEqual([{ ...decision, rootCause: null, resolution: null }]);
    expect(view.legacyComment).toBeNull();
    expect(detail.history[1]).toEqual(decision);
  });
  it('preserves additional reports, unique opening evidence and older decisions', () => {
    const older = {
      ...decision,
      id: 'older',
      rootCause: 'Initial diagnosis',
      resolution: 'Initial attempt',
    };
    const view = incidentDetailView(
      row,
      {
        ...detail,
        reports: [report, { ...report, id: 'second' }],
        history: [{ ...opening, comment: 'Initial safety note' }, older, decision],
      },
      true,
    );
    expect(view.reports[1]).toMatchObject({ showAuthor: true, showTime: true });
    expect(view.history[0]?.comment).toBe('Initial safety note');
    expect(view.history[1]).toEqual(older);
  });
  it('keeps full legacy text when it is absent from loaded evidence and ignores another incident', () => {
    expect(incidentDetailView(row, { ...detail, history: [] }, true).legacyComment).toBe(
      row.lastComment,
    );
    expect(incidentDetailView(row, { ...detail, incident: { ...row, id: 'other' } }, true)).toEqual(
      { reports: [], history: [], legacyComment: row.lastComment },
    );
    expect(
      incidentDetailView(
        row,
        { ...detail, reports: [{ ...report, comment: row.lastComment }], history: [] },
        true,
      ).legacyComment,
    ).toBeNull();
  });
  it('keeps recorded decision values while an editable draft may differ', () => {
    expect(incidentDetailView(row, detail, false).history[0]).toEqual(decision);
  });
});
