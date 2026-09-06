import type { EmployeeView, ScheduleVersionDetail } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { StatusPill } from '@/components/app/page';
import { currentLocale } from '../i18n.tsx';

const t = messages(currentLocale());

interface Props {
  readonly detail: ScheduleVersionDetail;
  readonly employees: readonly EmployeeView[];
}

/** Errors block submission, warnings are only shown (spec 3.2). */
export function IssuesPanel({ detail, employees }: Props) {
  const s = t.admin.schedule;
  if (detail.issues.length === 0) {
    return <p className="text-sm text-emerald-700 dark:text-emerald-300">{s.noIssues}</p>;
  }
  const byId = new Map(employees.map((e) => [e.id, e.fullName]));
  const dateOf = new Map(detail.assignments.map((a) => [a.id, a.businessDate]));
  const sorted = [...detail.issues].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'ERROR' ? -1 : 1,
  );

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((issue, i) => {
        const dates = [...new Set(issue.assignmentIds.map((id) => dateOf.get(id)).filter(Boolean))]
          .sort()
          .map((d) => d!.slice(8, 10))
          .join(', ');
        const labels = s.issueDetails as Readonly<Record<string, string>>;
        const details = Object.entries(issue.details)
          .map(([k, v]) => `${labels[k] ?? k}: ${v}`)
          .join(' · ');
        return (
          <li
            key={`${issue.code}-${issue.employeeId}-${i}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm"
          >
            <StatusPill tone={issue.severity === 'ERROR' ? 'danger' : 'warning'}>
              {issue.severity === 'ERROR' ? s.error : s.warning}
            </StatusPill>
            <strong>{t.schedule.issues[issue.code]}</strong>
            <span>{byId.get(issue.employeeId) ?? issue.employeeId}</span>
            {dates && <span className="text-muted-foreground">{dates}</span>}
            {details && <span className="text-xs text-muted-foreground">{details}</span>}
          </li>
        );
      })}
    </ul>
  );
}
