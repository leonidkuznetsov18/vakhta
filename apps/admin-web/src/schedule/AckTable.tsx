import type { AcknowledgementStatusView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '../i18n.tsx';

const t = messages(currentLocale());

/** Хто підтвердив ознайомлення з опублікованою версією (FR-SCH-03). */
export function AckTable({ rows }: { readonly rows: readonly AcknowledgementStatusView[] }) {
  const s = t.admin.schedule;
  if (rows.length === 0) return <p className="muted">{s.emptyGrid}</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{s.employee}</th>
          <th>{s.shifts}</th>
          <th>{s.acknowledged}</th>
          <th>Telegram</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.employeeId} className={r.acknowledged < r.assignments ? 'pending' : undefined}>
            <td>
              {r.fullName} <small className="muted">{r.personnelNumber}</small>
            </td>
            <td>{r.assignments}</td>
            <td>
              {r.acknowledged}/{r.assignments}
            </td>
            <td>{r.telegramLinked ? '✓' : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
