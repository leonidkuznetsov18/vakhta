import React from 'react';
import type { EmployeeView, ScheduleVersionDetail } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';

const t = messages('ru');

interface Props {
  readonly detail: ScheduleVersionDetail;
  readonly employees: readonly EmployeeView[];
}

/** Помилки блокують подання, попередження лише показуються (ТЗ 3.2). */
export function IssuesPanel({ detail, employees }: Props) {
  const s = t.admin.schedule;
  if (detail.issues.length === 0) {
    return <p className="ok">{s.noIssues}</p>;
  }
  const byId = new Map(employees.map((e) => [e.id, e.fullName]));
  const dateOf = new Map(detail.assignments.map((a) => [a.id, a.businessDate]));
  const sorted = [...detail.issues].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'ERROR' ? -1 : 1,
  );

  return (
    <ul className="issues">
      {sorted.map((issue, i) => {
        const dates = [...new Set(issue.assignmentIds.map((id) => dateOf.get(id)).filter(Boolean))]
          .sort()
          .map((d) => d!.slice(8, 10))
          .join(', ');
        const details = Object.entries(issue.details)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ');
        return (
          <li
            key={`${issue.code}-${issue.employeeId}-${i}`}
            className={issue.severity === 'ERROR' ? 'issue error' : 'issue warning'}
          >
            <span className="badge">{issue.severity === 'ERROR' ? s.error : s.warning}</span>
            <strong>{t.schedule.issues[issue.code]}</strong>
            <span>{byId.get(issue.employeeId) ?? issue.employeeId}</span>
            {dates && <span className="muted">{dates}</span>}
            {details && <small className="muted">{details}</small>}
          </li>
        );
      })}
    </ul>
  );
}
