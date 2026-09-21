import type { ReactNode } from 'react';

export function DetailList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      {rows.map(({ label, value }) => (
        <div key={label} className="min-w-0 space-y-1">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="break-words text-base font-medium [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
